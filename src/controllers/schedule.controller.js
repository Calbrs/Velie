'use strict';

const models = require('../models');
const wsapi = require('../services/wsapi_client');
const media = require('../services/media.service');
const dispatch = require('../services/dispatch.service');
const HttpError = require('../utils/HttpError');
const logger = require('../utils/logger');

const { PostSchedule, MediaAsset, WhatsAppInstance } = models;

const ALLOWED_TYPES = new Set(['text', 'image', 'video']);
/** UI restriction for this phase: only image statuses are supported. */
const ACTIVE_TYPES = new Set(['image']);
const STATUSES = new Set(['pending', 'sent', 'failed', 'deleted']);
const RETENTION_MS = 24 * 3600 * 1000;

function serialize(post, asset = null) {
  return {
    id: post.id,
    business_id: post.businessId,
    media_asset_id: post.mediaAssetId,
    type: post.type,
    content: post.content,
    media_url: asset ? asset.storagePath : null,
    scheduled_time: post.scheduledTime,
    status: post.status,
    wsapi_status_id: post.wsapiStatusId,
    retries: post.retries,
    last_error: post.lastError,
    published_at: post.publishedAt,
    created_at: post.createdAt,
    updated_at: post.updatedAt,
  };
}

async function findOwnedPost(businessId, postId) {
  const id = Number(postId);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid post id');
  const post = await PostSchedule.findOne({ where: { id, businessId } });
  if (!post) throw new HttpError(404, 'Post haipo au sio yako');
  return post;
}

async function create(req, res, next) {
  let asset = null;
  try {
    if (!req.file) throw new HttpError(400, 'Picha inahitajika (multipart field: image)');

    const { content, scheduled_time: scheduledTime, type = 'image' } = req.body;

    if (!content || String(content).trim() === '') throw new HttpError(400, 'content inahitajika');
    if (!ALLOWED_TYPES.has(type)) {
      throw new HttpError(400, `type batili (${[...ALLOWED_TYPES].join(', ')})`);
    }
    if (!ACTIVE_TYPES.has(type)) {
      throw new HttpError(422, `type '${type}' bado haijafunguliwa (image pekee kwa sasa)`);
    }
    if (!scheduledTime || Number.isNaN(Date.parse(scheduledTime))) {
      throw new HttpError(400, 'scheduled_time sahihi inahitajika (ISO date)');
    }

    asset = await media.registerUpload(req.file, req.business.id);

    const post = await PostSchedule.create({
      businessId: req.business.id,
      mediaAssetId: asset.id,
      type,
      content: String(content),
      scheduledTime: new Date(scheduledTime),
      status: 'pending',
      retries: 0,
    });

    return res.status(201).json(serialize(post, asset));
  } catch (err) {
    if (asset) await media.releaseIfUnused(asset.id);
    return next(err);
  }
}

async function list(req, res, next) {
  try {
    const { status } = req.query;
    const where = { businessId: req.business.id };
    if (status) {
      if (!STATUSES.has(status)) {
        throw new HttpError(400, 'status filter batili (pending|sent|failed|deleted)');
      }
      where.status = status;
    }

    const posts = await PostSchedule.findAll({
      where,
      include: [{ model: MediaAsset, as: 'mediaAsset' }],
      order: [['scheduledTime', 'DESC']],
    });

    return res.json({ posts: posts.map((p) => serialize(p, p.mediaAsset)) });
  } catch (err) {
    return next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const post = await PostSchedule.findOne({
      where: { id: Number(req.params.id), businessId: req.business.id },
      include: [{ model: MediaAsset, as: 'mediaAsset' }],
    });
    if (!post) throw new HttpError(404, 'Post haipo au sio yako');
    return res.json(serialize(post, post.mediaAsset));
  } catch (err) {
    return next(err);
  }
}

async function update(req, res, next) {
  try {
    const post = await findOwnedPost(req.business.id, req.params.id);
    if (post.status !== 'pending') {
      throw new HttpError(409, 'Post inaweza kuhaririwa tu ikiwa status = pending');
    }

    const { content, scheduled_time: scheduledTime } = req.body;

    if (content !== undefined) {
      if (String(content).trim() === '') throw new HttpError(400, 'content haiwezi kuwa tupu');
      post.content = String(content);
    }
    if (scheduledTime !== undefined) {
      if (Number.isNaN(Date.parse(scheduledTime))) throw new HttpError(400, 'scheduled_time sahihi inahitajika');
      post.scheduledTime = new Date(scheduledTime);
    }

    if (req.file) {
      const newAsset = await media.registerUpload(req.file, req.business.id);
      const oldAssetId = post.mediaAssetId;
      post.mediaAssetId = newAsset.id;
      if (oldAssetId) await media.releaseIfUnused(oldAssetId);
    }

    await post.save();
    const asset = post.mediaAssetId ? await MediaAsset.findByPk(post.mediaAssetId) : null;
    return res.json(serialize(post, asset));
  } catch (err) {
    return next(err);
  }
}

/**
 * DELETE /posts/:id
 * - pending / failed → cancel the schedule (delete the DB row).
 * - sent (within the 24h WhatsApp Status window) → call WSAPI DELETE /status/{id}
 *   on the business's OWN instance, then mark the post as `deleted`.
 */
async function remove(req, res, next) {
  try {
    const post = await findOwnedPost(req.business.id, req.params.id);

    if (post.status === 'sent') {
      const instance = await WhatsAppInstance.findOne({
        where: { businessId: req.business.id },
      });
      if (!instance) throw new HttpError(409, 'Instance ya WhatsApp haipo');

      if (!post.wsapiStatusId) {
        post.status = 'deleted';
        post.lastError = 'No wsapi_status_id to delete remotely';
        await post.save();
        return res.json(serialize(post));
      }

      try {
        await wsapi.deleteStatus(instance, post.wsapiStatusId);
        post.status = 'deleted';
        post.lastError = null;
        await post.save();
        logger.info(`post #${post.id} deleted live on WSAPI (${instance.wsapiInstanceId})`);
        return res.json(serialize(post));
      } catch (err) {
        throw new HttpError(502, `Kufuta status kwenye WhatsApp kulishindikana: ${err.message}`);
      }
    }

    if (post.status === 'pending' || post.status === 'failed' || post.status === 'deleted') {
      const assetId = post.mediaAssetId;
      await post.destroy();
      if (assetId) await media.releaseIfUnused(assetId);
      return res.status(204).send();
    }

    return res.status(409).json({ message: 'Post haifai kwa operesheni hii' });
  } catch (err) {
    return next(err);
  }
}

async function retry(req, res, next) {
  try {
    const post = await findOwnedPost(req.business.id, req.params.id);
    if (post.status !== 'failed') throw new HttpError(409, 'Retry inafanyika tu kwa failed posts');

    post.status = 'pending';
    post.lastError = null;
    await post.save();
    return res.json(serialize(post));
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /posts/:id/send-now — publish immediately (no cron wait).
 * Requires the post to be pending and the business to have a connected instance.
 */
async function sendNow(req, res, next) {
  try {
    const post = await findOwnedPost(req.business.id, req.params.id);
    if (post.status === 'sent') throw new HttpError(409, 'Post imeshatumwa');

    const asset = post.mediaAssetId ? await MediaAsset.findByPk(post.mediaAssetId) : null;
    if (post.type !== 'text' && !asset) throw new HttpError(409, 'Media ya post haipo');

    try {
      await dispatch.dispatchOne(post);
    } catch (err) {
      if (err.code === 'NO_INSTANCE') throw new HttpError(409, 'WhatsApp haijaunganishwa');
      throw new HttpError(502, `Kutuma post kushindikana: ${err.message}`);
    }

    const updatedAsset = post.mediaAssetId ? await MediaAsset.findByPk(post.mediaAssetId) : null;
    return res.json(serialize(post, updatedAsset));
  } catch (err) {
    return next(err);
  }
}

module.exports = { create, list, getOne, update, remove, retry, sendNow, serialize, findOwnedPost };