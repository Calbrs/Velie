'use strict';

const { Op } = require('sequelize');
const models = require('../models');
const wsapi = require('./wsapi_client');
const media = require('./media.service');
const config = require('../config/env');
const logger = require('../utils/logger');

const { PostSchedule, WhatsAppInstance, MediaAsset } = models;

function randomDelayMs() {
  const min = Math.max(0, config.dispatch.minDelayMs);
  const max = Math.max(min, config.dispatch.maxDelayMs);
  return min + Math.round(Math.random() * (max - min));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Single place that builds the WSAPI `/status/{type}` payload.
 * BLOCKER (§10): exact body fields for /status/image and /status/video are not
 * confirmed yet — adjust this function when the OpenAPI spec is available,
 * without touching the dispatch logic.
 */
function buildStatusPayload(post, asset) {
  if (post.type === 'text') return { text: post.content };
  const mediaUrl = asset ? media.absoluteUrl(asset.storagePath) : null;
  return { caption: post.content, media_url: mediaUrl };
}

function extractStatusId(result) {
  const p = result && typeof result === 'object' ? result : {};
  return p.wsapiStatusId || p.statusId || p.status_id || p.id || p.data?.id || null;
}

/**
 * Dispatch cycle: every due pending post is published through the owning
 * business's instance (decrypted api key → X-Instance-Id / X-Api-Key), with an
 * anti-ban stagger between posts. Success sets `sent` + `published_at` +
 * `wsapi_status_id` and extends the media asset's expiry.
 */
async function runDispatchCycle() {
  const now = new Date();

  const due = await PostSchedule.findAll({
    where: { status: 'pending', scheduledTime: { [Op.lte]: now } },
    include: [{ model: MediaAsset, as: 'mediaAsset' }],
    order: [['scheduledTime', 'ASC']],
    limit: 200,
  });

  if (due.length === 0) return 0;

  let first = true;
  for (const post of due) {
    const instance = await WhatsAppInstance.findOne({
      where: { businessId: post.businessId, status: 'connected' },
    });

    if (!instance) {
      post.status = 'failed';
      post.retries += 1;
      post.lastError = 'No connected WhatsApp instance for this business';
      await post.save();
      logger.error(`post #${post.id}: no connected instance`);
      continue;
    }

    if (post.type !== 'text' && !post.mediaAsset) {
      post.status = 'failed';
      post.retries += 1;
      post.lastError = `Post #${post.id}: media asset missing for type ${post.type}`;
      await post.save();
      continue;
    }

    try {
      const payload = buildStatusPayload(post, post.mediaAsset);
      const result = await wsapi.sendStatus(instance, post.type, payload);

      post.status = 'sent';
      post.publishedAt = new Date();
      post.lastError = null;
      post.wsapiStatusId = extractStatusId(result);
      await post.save();

      if (post.mediaAssetId) await media.touchExpiry(post.mediaAssetId, post.publishedAt);
      logger.info(`post #${post.id} sent as ${post.type} via ${instance.wsapiInstanceId} (wsapi_id=${post.wsapiStatusId})`);
    } catch (err) {
      post.status = 'failed';
      post.retries += 1;
      post.lastError = err.message;
      await post.save();
      logger.error(`post #${post.id} failed: ${err.message}`);
    }

    if (!first) {
      const delay = randomDelayMs();
      logger.info(`Staggering ${delay}ms before next post (anti-ban)`);
      await sleep(delay);
    }
    first = false;
  }

  return due.length;
}

module.exports = { runDispatchCycle, randomDelayMs, buildStatusPayload };