'use strict';

const { Op } = require('sequelize');
const models = require('../models');
const wsapi = require('./wsapi_client');
const logger = require('../utils/logger');

const { PostSchedule, WhatsAppInstance } = models;

function serializeViewers(list) {
  return Array.isArray(list) ? list.join(',') : null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch the viewer list for one sent post from the owning instance's gateway and
 * persist the count + list. Best-effort: any failure leaves the DB unchanged.
 * Returns the post (with updated fields) or null when not refreshable.
 */
async function refreshPostViewers(post) {
  if (!post || post.status !== 'sent' || !post.wsapiStatusId) return null;

  const instance = await WhatsAppInstance.findOne({
    where: { businessId: post.businessId },
  });
  if (!instance) return null;

  try {
    const data = await wsapi.getStatusViewers(instance, post.wsapiStatusId);
    const viewers = (data && data.viewers) || [];
    const count = Array.isArray(viewers) ? viewers.length : null;

    if (typeof count === 'number') {
      post.viewerCount = count;
      post.viewers = serializeViewers(viewers);
      await post.save();
      logger.info(`post #${post.id} viewers refreshed: ${count}`);
    }
  } catch (err) {
    logger.warn(`viewer refresh failed for post #${post.id}: ${err.message}`);
  }
  return post;
}

/**
 * Refresh viewers for every sent post that still has a wsapi_status_id, with a
 * small stagger between posts to avoid hammering the gateway.
 */
async function refreshAllViewers() {
  const posts = await PostSchedule.findAll({
    where: {
      status: 'sent',
      wsapiStatusId: { [Op.not]: null },
    },
    limit: 100,
  });
  if (posts.length === 0) return 0;

  let first = true;
  for (const post of posts) {
    await refreshPostViewers(post);
    if (!first) await sleep(300);
    first = false;
  }
  return posts.length;
}

module.exports = { refreshPostViewers, refreshAllViewers, serializeViewers };