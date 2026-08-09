'use strict';

const { Op } = require('sequelize');
const models = require('../models');
const wsapi = require('./wsapi_client');
const config = require('../config/env');
const logger = require('../utils/logger');

const { ScheduledPost, WhatsAppInstance } = models;

function absoluteMediaUrl(mediaUrl) {
  if (!mediaUrl) return null;
  if (/^https?:\/\//i.test(mediaUrl)) return mediaUrl;
  return `${config.publicBaseUrl}${mediaUrl.startsWith('/') ? mediaUrl : `/${mediaUrl}`}`;
}

function randomDelayMs() {
  const min = Math.max(0, config.dispatch.minDelayMs);
  const max = Math.max(min, config.dispatch.maxDelayMs);
  return min + Math.round(Math.random() * (max - min));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function publish(post, instance) {
  const mediaUrl = absoluteMediaUrl(post.mediaUrl);

  if (post.channel === 'wa_group') {
    if (!post.groupId) throw new Error('group_id inahitajika kwa channel wa_group');
    return wsapi.sendWhatsAppGroupMessage(instance, post.groupId, {
      mediaUrl,
      content: post.content,
    });
  }

  return wsapi.sendWhatsAppStatus(instance, { mediaUrl, content: post.content });
}

/**
 * Dispatch cycle: every due post is sent through ITS OWN instance
 * (`post.instanceId` → `X-Instance-Id`/`X-Api-Key`), never a shared/default
 * instance. Only connected instances may publish.
 */
async function runDispatchCycle() {
  const now = new Date();

  const due = await ScheduledPost.findAll({
    where: {
      status: 'pending',
      scheduledAt: { [Op.lte]: now },
    },
    include: [{ model: WhatsAppInstance, as: 'instance' }],
    order: [['scheduledAt', 'ASC']],
    limit: 200,
  });

  if (due.length === 0) return 0;

  let first = true;
  for (const post of due) {
    const instance = post.instance;

    if (!instance) {
      post.status = 'failed';
      post.error = 'No WhatsApp instance linked to this post';
      await post.save();
      logger.error(`post #${post.id}: no linked instance`);
      continue;
    }

    if (instance.status !== 'connected') {
      post.error = 'WhatsApp instance haijaunganishwa (connected required)';
      await post.save();
      logger.warn(`post #${post.id}: instance ${instance.wsapiInstanceId} is ${instance.status}`);
      continue;
    }

    try {
      await publish(post, instance);
      post.status = 'published';
      post.error = null;
      post.publishedAt = new Date();
      logger.info(`post #${post.id} published via instance ${instance.wsapiInstanceId}`);
    } catch (err) {
      post.status = 'failed';
      post.attempts += 1;
      post.error = err.message;
      post.publishedAt = null;
      logger.error(`post #${post.id} failed: ${err.message}`);
    }
    await post.save();

    if (!first) {
      const delay = randomDelayMs();
      logger.info(`Staggering ${delay}ms between posts (anti-ban)`);
      await sleep(delay);
    }
    first = false;
  }

  return due.length;
}

/** User-scoped retry: flip a failed post back into the dispatch queue. */
async function requeueForRetry(userId, postId) {
  const post = await models.WebhookEvent; // placeholder removed below
  return post;
}

module.exports = { runDispatchCycle, randomDelayMs, absoluteMediaUrl };