'use strict';

const { Op } = require('sequelize');
const models = require('../models');
const wsapi = require('./wsapi_client');
const config = require('../config/env');
const logger = require('../utils/logger');

const { PostSchedule, WhatsAppInstance } = models;

const SUPPORTED_CHANNELS = new Set(['wa_status', 'wa_group']);

function absoluteImageUrl(imageUrl) {
  if (!imageUrl) return null;
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
  return `${config.publicBaseUrl}${imageUrl.startsWith('/') ? imageUrl : `/${imageUrl}`}`;
}

function randomDelayMs() {
  const { minDelayMs, maxDelayMs } = config.dispatch;
  const min = Math.max(0, minDelayMs);
  const max = Math.max(min, maxDelayMs);
  return min + Math.round(Math.random() * (max - min));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendPost(post, instance) {
  const imageUrl = absoluteImageUrl(post.imageUrl);

  if (post.channel === 'wa_status') {
    return wsapi.sendWhatsAppStatus(instance.instanceKey, { imageUrl, caption: post.caption });
  }

  if (post.channel === 'wa_group') {
    if (!post.groupId) throw new Error('group_id inahitajika kwa channel wa_group');
    return wsapi.sendWhatsAppGroupMessage(instance.instanceKey, post.groupId, {
      imageUrl,
      caption: post.caption,
    });
  }

  throw new Error(`Channel '${post.channel}' haijaunganishwa bado (Phase 2)`);
}

async function runDispatchCycle() {
  const now = new Date();
  const pending = await PostSchedule.findAll({
    where: {
      status: 'pending',
      scheduledTime: { [Op.lte]: now },
    },
    order: [['scheduledTime', 'ASC']],
    limit: 500,
  });

  if (pending.length === 0) return 0;

  const instancesByBusiness = new Map();

  for (let i = 0; i < pending.length; i += 1) {
    const post = pending[i];

    let instance = instancesByBusiness.get(post.businessId);
    if (!instance) {
      instance = await WhatsAppInstance.findOne({
        where: { businessId: post.businessId, status: 'connected' },
        order: [['updatedAt', 'DESC']],
      });
      instancesByBusiness.set(post.businessId, instance);
    }

    if (!instance) {
      post.status = 'failed';
      post.lastError = 'No connected WhatsApp instance for this business';
      await post.save();
      logger.error(`Dispatch blocked post #${post.id}: no connected instance`);
      continue;
    }

    if (!SUPPORTED_CHANNELS.has(post.channel)) {
      post.status = 'failed';
      post.lastError = `Channel '${post.channel}' inatungojea (Phase 2)`;
      await post.save();
      logger.error(`post #${post.id} channel '${post.channel}' unsupported`);
      continue;
    }

    try {
      await sendPost(post, instance);
      post.status = 'sent';
      post.lastError = null;
      logger.info(`post #${post.id} sent via ${post.channel} (instance ${instance.instanceKey})`);
    } catch (err) {
      post.status = 'failed';
      post.lastError = err.message;
      logger.error(`post #${post.id} failed: ${err.message}`);
    }

    await post.save();

    const isLast = i === pending.length - 1;
    if (!isLast) {
      const delay = randomDelayMs();
      logger.info(`Staggering ${delay}ms before next post (anti-ban)`);
      await sleep(delay);
    }
  }

  return pending.length;
}

module.exports = { runDispatchCycle, randomDelayMs, absoluteImageUrl };