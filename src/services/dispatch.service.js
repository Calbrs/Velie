'use strict';

const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');
const models = require('../models');
const wsapi = require('./wsapi_client');
const media = require('./media.service');
const config = require('../config/env');
const logger = require('../utils/logger');
const { uploadDir } = require('./upload.service');

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
 * Spec: `/status/image` & `/status/video` take base64 `data` (or `url`) plus
 * optional `caption` and `mimeType`; `/status/text` takes `text`.
 *
 * We ship base64 `data` so the WSAPI never has to reach back to `PUBLIC_BASE_URL`
 * (works when the backend is behind NAT / local during dev). The file is read
 * straight off disk (uploads/<name>) and encoded.
 */
async function buildStatusPayload(post, asset) {
  if (post.type === 'text') return { text: post.content };

  const mimeType = (asset && asset.mimeType) || 'image/webp';
  const data = await media.base64FromStorage(asset && asset.storagePath);

  if (!data) {
    const err = new Error(`Could not read media file for post #${post.id}`);
    err.code = 'NO_MEDIA';
    throw err;
  }

  return { caption: post.content, data, mimeType };
}

function extractStatusId(result) {
  const p = result && typeof result === 'object' ? result : {};
  return p.wsapiStatusId || p.statusId || p.status_id || p.id || p.data?.id || null;
}

/**
 * Publish a single post right now through the owning business's connected
 * instance. Used by "Post Now" (immediate, no cron wait) and by the dispatch
 * cycle. Throws on failure so callers can decide how to record it.
 */
async function dispatchOne(post) {
  const instance = await WhatsAppInstance.findOne({
    where: { businessId: post.businessId, status: 'connected' },
  });
  if (!instance) {
    const err = new Error('No connected WhatsApp instance for this business');
    err.code = 'NO_INSTANCE';
    throw err;
  }

  if (post.type !== 'text' && !post.mediaAsset) {
    const err = new Error(`Media asset missing for type ${post.type}`);
    err.code = 'NO_MEDIA';
    throw err;
  }

  const payload = await buildStatusPayload(post, post.mediaAsset);
  const result = await wsapi.sendStatus(instance, post.type, payload);

  post.status = 'sent';
  post.publishedAt = new Date();
  post.lastError = null;
  post.wsapiStatusId = extractStatusId(result);
  await post.save();

  if (post.mediaAssetId) await media.touchExpiry(post.mediaAssetId, post.publishedAt);
  logger.info(`post #${post.id} sent as ${post.type} via ${instance.wsapiInstanceId} (wsapi_id=${post.wsapiStatusId})`);
  return post;
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
    try {
      await dispatchOne(post);
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

module.exports = { runDispatchCycle, dispatchOne, randomDelayMs, buildStatusPayload };