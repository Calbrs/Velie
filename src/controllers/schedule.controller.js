'use strict';

const models = require('../models');
const wsapi = require('../services/wsapi_client');
const media = require('../services/media.service');
const dispatch = require('../services/dispatch.service');
const viewerService = require('../services/viewer.service');
const HttpError = require('../utils/HttpError');
const logger = require('../utils/logger');

const { PostSchedule, MediaAsset, WhatsAppInstance } = models;

const ALLOWED_TYPES = new Set(['text', 'image', 'video']);
const ACTIVE_TYPES = new Set(['text', 'image', 'video']);
const STATUSES = new Set(['pending', 'sent', 'failed', 'deleted']);
const RETENTION_MS = 24 * 3600 * 1000;

/** WhatsApp Web text-status backgrounds (hex) + font styles (0=SS, 1=Serif, 2=Norican, 3=Oswald). */
const BG_HEX = /^#[0-9a-fA-F]{6}$/;

function normalizeTextStyle(body) {
  const bg = typeof body.backgroundColor === 'string' && BG_HEX.test(body.backgroundColor)
    ? body.backgroundColor
    : null;
  const fontRaw = body.font;
  const font = fontRaw === undefined || fontRaw === null || fontRaw === ''
    ? null
    : Number(fontRaw);
  return { backgroundColor: bg, font: Number.isInteger(font) && font >= 0 ? font : null };
}

function serialize(post, asset = null) {
  return {
    id: post.id,
    business_id: post.businessId,
    media_asset_id: post.mediaAssetId,
    type: post.type,
    content: post.content,
    media_url: asset ? asset.storagePath : null,
    backgroundColor: post.backgroundColor || null,
    font: post.font !== null && post.font !== undefined ? post.font : null,
    scheduled_time: post.scheduledTime,
    status: post.status,
    wsapi_status_id: post.wsapiStatusId,
    viewer_count: post.viewerCount !== null && post.viewerCount !== undefined ? post.viewerCount : null,
    viewers: post.viewers || null,
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
    const { content, scheduled_time: scheduledTime, type = 'image' } = req.body;

    if (!content || String(content).trim() === '') throw new HttpError(400, 'content inahitajika');
    if (!ALLOWED_TYPES.has(type)) {
      throw new HttpError(400, `type batili (${[...ALLOWED_TYPES].join(', ')})`);
    }
    if (!ACTIVE_TYPES.has(type)) {
      throw new HttpError(422, `type '${type}' bado haijafunguliwa (${[...ACTIVE_TYPES].join(', ')} kwa sasa)`);
    }
    if (!scheduledTime || Number.isNaN(Date.parse(scheduledTime))) {
      throw new HttpError(400, 'scheduled_time sahihi inahitajika (ISO date)');
    }

    // Text statuses carry background colour + font in the body and need no file.
    const style = type === 'text' ? normalizeTextStyle(req.body) : { backgroundColor: null, font: null };

    if (type !== 'text' && !req.file) {
      throw new HttpError(400, 'Fails inahitajika kwa image/video (multipart field: image)');
    }

    if (req.file) asset = await media.registerUpload(req.file, req.business.id);

    const post = await PostSchedule.create({
      businessId: req.business.id,
      mediaAssetId: asset ? asset.id : null,
      type,
      content: String(content),
      backgroundColor: style.backgroundColor,
      font: style.font,
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
    // Refresh viewer count live when a status is sent so the app shows
    // up-to-date numbers without waiting for the periodic worker.
    if (post.status === 'sent' && post.wsapiStatusId) {
      await viewerService.refreshPostViewers(post);
    }
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

    const { content, scheduled_time: scheduledTime, backgroundColor, font } = req.body;

    if (content !== undefined) {
      if (String(content).trim() === '') throw new HttpError(400, 'content haiwezi kuwa tupu');
      post.content = String(content);
    }
    if (scheduledTime !== undefined) {
      if (Number.isNaN(Date.parse(scheduledTime))) throw new HttpError(400, 'scheduled_time sahihi inahitajika');
      post.scheduledTime = new Date(scheduledTime);
    }

    if (post.type === 'text') {
      const style = normalizeTextStyle({ backgroundColor, font });
      if (style.backgroundColor !== null) post.backgroundColor = style.backgroundColor;
      if (style.font !== null) post.font = style.font;
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
 * - pending / failed / deleted → hard-delete the DB row.
 * - sent (within the 24h WhatsApp Status window) → first call WSAPI
 *   DELETE /status/{id} on the business's OWN instance, then hard-delete the
 *   DB row. A front-end delete always physically removes the record — no soft
 *   delete / `deleted` tombstone rows from the app.
 */
async function remove(req, res, next) {
  try {
    const post = await findOwnedPost(req.business.id, req.params.id);

    if (post.status === 'sent') {
      const instance = await WhatsAppInstance.findOne({
        where: { businessId: req.business.id },
      });
      if (!instance) throw new HttpError(409, 'Instance ya WhatsApp haipo');

      // Delete the live WhatsApp status first (when there is one), then
      // HARD-delete the DB row below — never leave a soft `deleted` record.
      if (post.wsapiStatusId) {
        try {
          await wsapi.deleteStatus(instance, post.wsapiStatusId);
          logger.info(`post #${post.id} deleted live on WSAPI (${instance.wsapiInstanceId})`);
        } catch (err) {
          throw new HttpError(502, `Kufuta status kwenye WhatsApp kulishindikana: ${err.message}`);
        }
      }

      const assetId = post.mediaAssetId;
      await post.destroy();
      if (assetId) await media.releaseIfUnused(assetId);
      return res.status(204).send();
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
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid post id');
    const post = await PostSchedule.findOne({
      where: { id, businessId: req.business.id },
      include: [{ model: MediaAsset, as: 'mediaAsset' }],
    });
    if (!post) throw new HttpError(404, 'Post haipo au sio yako');
    if (post.status === 'sent') throw new HttpError(409, 'Post imeshatumwa');

    if (post.type !== 'text' && !post.mediaAsset) throw new HttpError(409, 'Media ya post haipo');

    try {
      await dispatch.dispatchOne(post);
    } catch (err) {
      if (err.code === 'NO_INSTANCE') throw new HttpError(409, 'WhatsApp haijaunganishwa');
      throw new HttpError(502, `Kutuma post kushindikana: ${err.message}`);
    }

    return res.json(serialize(post, post.mediaAsset));
  } catch (err) {
    return next(err);
  }
}

module.exports = { create, list, getOne, update, remove, retry, sendNow, serialize, findOwnedPost };