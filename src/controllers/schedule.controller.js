'use strict';

const { PostSchedule } = require('../models');
const { imageUrlFromFile, deleteImageFile } = require('../services/upload.service');
const HttpError = require('../utils/HttpError');

const CHANNELS = new Set(['wa_status', 'wa_group', 'ig', 'fb', 'tiktok']);
const EDITABLE_STATUS = new Set(['pending']);

function serialize(post) {
  return {
    id: post.id,
    business_id: post.businessId,
    image_url: post.imageUrl,
    caption: post.caption,
    channel: post.channel,
    group_id: post.groupId,
    scheduled_time: post.scheduledTime,
    status: post.status,
    retries: post.retries,
    last_error: post.lastError,
    created_at: post.createdAt,
    updated_at: post.updatedAt,
  };
}

async function create(req, res, next) {
  try {
    if (!req.file) throw new HttpError(400, 'Picha inahitajika (multipart field: image)');

    const { caption, channel, group_id: groupId, scheduled_time: scheduledTime } = req.body;

    if (!caption || String(caption).trim() === '') throw new HttpError(400, 'caption inahitajika');
    if (!channel || !CHANNELS.has(channel)) {
      throw new HttpError(400, `channel batili (inapaswa kuwa: ${[...CHANNELS].join(', ')})`);
    }
    if (channel === 'wa_group' && !groupId) {
      throw new HttpError(400, 'group_id inahitajika wakati channel = wa_group');
    }
    if (!scheduledTime || Number.isNaN(Date.parse(scheduledTime))) {
      throw new HttpError(400, 'scheduled_time sahihi inahitajika (ISO date)');
    }

    const post = await PostSchedule.create({
      businessId: req.business.id,
      imageUrl: imageUrlFromFile(req.file),
      caption: String(caption),
      channel,
      groupId: channel === 'wa_group' ? String(groupId) : null,
      scheduledTime: new Date(scheduledTime),
      status: 'pending',
      retries: 0,
    });

    return res.status(201).json(serialize(post));
  } catch (err) {
    if (err.name === 'HttpError' && req.file) deleteImageFile(imageUrlFromFile(req.file));
    return next(err);
  }
}

async function list(req, res, next) {
  try {
    const { status } = req.query;
    const where = { businessId: req.business.id };
    if (status) {
      if (!['pending', 'sent', 'failed'].includes(status)) {
        throw new HttpError(400, 'status filter batili (pending|sent|failed)');
      }
      where.status = status;
    }

    const posts = await PostSchedule.findAll({
      where,
      order: [['scheduledTime', 'DESC']],
    });

    return res.json({ posts: posts.map(serialize) });
  } catch (err) {
    return next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const post = await PostSchedule.findOne({
      where: { id: Number(req.params.id), businessId: req.business.id },
    });
    if (!post) throw new HttpError(404, 'Post haipo');
    return res.json(serialize(post));
  } catch (err) {
    return next(err);
  }
}

async function update(req, res, next) {
  try {
    const post = await PostSchedule.findOne({
      where: { id: Number(req.params.id), businessId: req.business.id },
    });
    if (!post) throw new HttpError(404, 'Post haipo');
    if (!EDITABLE_STATUS.has(post.status)) {
      throw new HttpError(409, 'Post inaweza kuhaririwa tu ikiwa status = pending');
    }

    const { caption, channel, group_id: groupId, scheduled_time: scheduledTime } = req.body;

    const nextCaption = caption !== undefined ? String(caption) : post.caption;
    const nextChannel = channel !== undefined ? String(channel) : post.channel;

    if (nextCaption.trim() === '') throw new HttpError(400, 'caption haiwezi kuwa tupu');
    if (!CHANNELS.has(nextChannel)) throw new HttpError(400, 'channel batili');
    if (nextChannel === 'wa_group' && groupId === undefined && !post.groupId) {
      throw new HttpError(400, 'group_id inahitajika wakati channel = wa_group');
    }
    let nextScheduled = post.scheduledTime;
    if (scheduledTime !== undefined) {
      if (Number.isNaN(Date.parse(scheduledTime))) throw new HttpError(400, 'scheduled_time sahihi inahitajika');
      nextScheduled = new Date(scheduledTime);
    }

    let oldImageUrl = null;
    if (req.file) {
      oldImageUrl = post.imageUrl;
      post.imageUrl = imageUrlFromFile(req.file);
    }

    post.caption = nextCaption;
    post.channel = nextChannel;
    post.groupId = nextChannel === 'wa_group' ? (groupId !== undefined ? String(groupId) : post.groupId) : null;
    post.scheduledTime = nextScheduled;

    await post.save();
    if (oldImageUrl) deleteImageFile(oldImageUrl);

    return res.json(serialize(post));
  } catch (err) {
    if (err.name === 'HttpError' && req.file) deleteImageFile(imageUrlFromFile(req.file));
    return next(err);
  }
}

async function remove(req, res, next) {
  try {
    const post = await PostSchedule.findOne({
      where: { id: Number(req.params.id), businessId: req.business.id },
    });
    if (!post) throw new HttpError(404, 'Post haipo');
    if (!EDITABLE_STATUS.has(post.status)) {
      throw new HttpError(409, 'Post inaweza kufutwa tu ikiwa status = pending');
    }

    deleteImageFile(post.imageUrl);
    await post.destroy();
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

async function retry(req, res, next) {
  try {
    const post = await PostSchedule.findOne({
      where: { id: Number(req.params.id), businessId: req.business.id },
    });
    if (!post) throw new HttpError(404, 'Post haipo');
    if (post.status !== 'failed') {
      throw new HttpError(409, 'Retry inaruhusiwa tu kwa post zenye status = failed');
    }

    post.status = 'pending';
    post.retries += 1;
    post.lastError = null;
    await post.save();

    return res.json(serialize(post));
  } catch (err) {
    return next(err);
  }
}

module.exports = { create, list, getOne, update, remove, retry, serialize };