'use strict';

const { ScheduledPost, WhatsAppInstance } = require('../models');
const { imageUrlFromFile, deleteImageFile } = require('../services/upload.service');
const wsapi = require('../services/wsapi_client');
const { parseScheduledAt } = require('../utils/timezone');
const HttpError = require('../utils/HttpError');
const logger = require('../utils/logger');

const CHANNELS = new Set(['wa_status', 'wa_group']);
const DEFAULT_TIMEZONE = 'Africa/Dar_es_Salaam';
const STATUSES = new Set(['pending', 'published', 'failed']);

function serialize(post, instance = null) {
  return {
    id: post.id,
    user_id: post.userId,
    instance_id: post.instanceId,
    wsapi_instance_id: instance ? instance.wsapiInstanceId : null,
    type: post.type,
    media_url: post.mediaUrl,
    content: post.content,
    caption: post.content, // alias, backward-compatible with the Flutter app
    image_url: post.mediaUrl, // alias, backward-compatible with the Flutter app
    channel: post.channel,
    group_id: post.groupId,
    scheduled_at: post.scheduledAt,
    timezone: post.timezone,
    status: post.status,
    attempts: post.attempts,
    error: post.error,
    published_at: post.publishedAt,
    created_at: post.createdAt,
    updated_at: post.updatedAt,
  };
}

async function resolveInstance(userId, requestedId) {
  if (requestedId !== undefined && requestedId !== '') {
    const id = Number(requestedId);
    const instance = await WhatsAppInstance.findOne({ where: { id, userId } });
    if (!instance) throw new HttpError(404, 'Instance haipo au sio yako');
    return instance;
  }
  const instance = await WhatsAppInstance.findOne({
    where: { userId, status: ['connected', 'pending'] },
    order: [['id', 'DESC']],
  });
  if (!instance) throw new HttpError(409, 'Unganisha WhatsApp kwanza (hakuna instance)');
  return instance;
}

async function create(req, res, next) {
  try {
    if (!req.file) throw new HttpError(400, 'Picha inahitajika (multipart field: image)');

    const {
      content,
      channel = 'wa_status',
      group_id: groupId,
      scheduled_at: scheduledAt,
      timezone = DEFAULT_TIMEZONE,
      instance_id: instanceId,
    } = req.body;

    if (!content || String(content).trim() === '') throw new HttpError(400, 'content inahitajika');
    if (!CHANNELS.has(channel)) throw new HttpError(400, `channel batili (${[...CHANNELS].join(', ')})`);
    if (channel === 'wa_group' && !groupId) throw new HttpError(400, 'group_id inahitajika kwa wa_group');

    const instance = await resolveInstance(req.user.id, instanceId);

    const post = await ScheduledPost.create({
      userId: req.user.id,
      instanceId: instance.id,
      mediaUrl: imageUrlFromFile(req.file),
      content: String(content),
      type: 'image',
      channel,
      groupId: channel === 'wa_group' ? String(groupId) : null,
      scheduledAt: parseScheduledAt(scheduledAt, timezone),
      timezone,
      status: 'pending',
      attempts: 0,
    });

    return res.status(201).json(serialize(post, instance));
  } catch (err) {
    if (req.file) deleteImageFile(imageUrlFromFile(req.file));
    return next(err);
  }
}

async function list(req, res, next) {
  try {
    const { status, instance_id: instanceId } = req.query;
    const where = { userId: req.user.id };
    if (status) {
      if (!STATUSES.has(status)) throw new HttpError(400, 'status filter batili (pending|published|failed)');
      where.status = status;
    }
    if (instanceId) where.instanceId = Number(instanceId);

    const posts = await ScheduledPost.findAll({
      where,
      include: [{ model: WhatsAppInstance, as: 'instance' }],
      order: [['scheduledAt', 'DESC']],
    });

    return res.json({ posts: posts.map((p) => serialize(p, p.instance)) });
  } catch (err) {
    return next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const post = await ScheduledPost.findOne({
      where: { id: Number(req.params.id), userId: req.user.id },
      include: [{ model: WhatsAppInstance, as: 'instance' }],
    });
    if (!post) throw new HttpError(404, 'Post haipo au sio yako');
    return res.json(serialize(post, post.instance));
  } catch (err) {
    return next(err);
  }
}

async function update(req, res, next) {
  try {
    const post = await findOwnedPost(req.user.id, req.params.id);
    if (post.status !== 'pending') {
      throw new HttpError(409, 'Post inaweza kuhaririwa tu ikiwa status = pending');
    }

    const {
      content,
      channel,
      group_id: groupId,
      scheduled_at: scheduledAt,
      timezone = post.timezone,
    } = req.body;

    if (content !== undefined) {
      if (String(content).trim() === '') throw new HttpError(400, 'content haiwezi kuwa tupu');
      post.content = String(content);
    }
    if (channel !== undefined) {
      if (!CHANNELS.has(channel)) throw new HttpError(400, 'channel batili');
      post.channel = channel;
    }
    if ((post.channel === 'wa_group' && groupId !== undefined) || groupId !== undefined) {
      post.groupId = groupId ? String(groupId) : null;
    }
    if (post.channel === 'wa_group' && !post.groupId) {
      throw new HttpError(400, 'group_id inahitajika wakati channel = wa_group');
    }
    if (scheduledAt !== undefined) {
      post.scheduledAt = parseScheduledAt(scheduledAt, timezone);
    }
    if (timezone !== undefined) post.timezone = timezone;

    if (req.file) {
      const old = post.mediaUrl;
      post.mediaUrl = imageUrlFromFile(req.file);
      deleteImageFile(old);
    }

    await post.save();
    return res.json(serialize(post));
  } catch (err) {
    if (req.file) deleteImageFile(imageUrlFromFile(req.file));
    return next(err);
  }
}

/**
 * Delete: ownership is verified (`user_id == req.user.id`) BEFORE touching the
 * instance. Published posts are additionally removed from WSAPI through the
 * OWNED instance (per-instance delete), so a user can never act through
 * another user's instance.
 */
async function remove(req, res, next) {
  try {
    const post = await findOwnedPost(req.user.id, req.params.id);

    if (post.status === 'published' && post.instanceId) {
      const instance = await WhatsAppInstance.findOne({
        where: { id: post.instanceId, userId: req.user.id },
      });
      if (instance) {
        try {
          await wsapi.deleteStatus(instance, { mediaUrl: post.mediaUrl });
          logger.info(`post #${post.id} deleted from WSAPI via ${instance.wsapiInstanceId}`);
        } catch (err) {
          logger.warn(`WS delete failed for post #${post.id}: ${err.message}`);
        }
      }
    }

    deleteImageFile(post.mediaUrl);
    await post.destroy();
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

async function retry(req, res, next) {
  try {
    const post = await findOwnedPost(req.user.id, req.params.id);
    if (post.status !== 'failed') throw new HttpError(409, 'Retry inafanyika tu kwa failed posts');

    post.status = 'pending';
    post.attempts += 1;
    post.error = null;
    await post.save();
    return res.json(serialize(post));
  } catch (err) {
    return next(err);
  }
}

async function findOwnedPost(userId, postId) {
  const id = Number(postId);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid post id');
  const post = await ScheduledPost.findOne({ where: { id, userId } });
  if (!post) throw new HttpError(404, 'Post haipo au sio yako');
  return post;
}

module.exports = { create, list, getOne, update, remove, retry, serialize, findOwnedPost };