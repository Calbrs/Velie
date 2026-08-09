'use strict';

const crypto = require('crypto');
const { Op } = require('sequelize');
const models = require('../models');
const config = require('../config/env');
const HttpError = require('../utils/HttpError');
const logger = require('../utils/logger');

const { Subscription } = models;

const PLANS = new Set(['free', 'pro', 'business']);
const CYCLES = new Set(['monthly', 'annual']);

function cycleMs(cycle) {
  return cycle === 'annual' ? 365 * 24 * 3600 * 1000 : 30 * 24 * 3600 * 1000;
}

/**
 * MVP (Phase 1 of §12): payment is confirmed manually outside the app, so this
 * just records the subscription. The payment gateway flow is wired via the
 * billing webhook when Phase 2 lands.
 */
async function subscribe(req, res, next) {
  try {
    const { plan, billing_cycle: billingCycle = 'monthly', currency = 'TZS', payment_provider: paymentProvider, price_amount: priceAmount } = req.body;

    if (!PLANS.has(plan)) throw new HttpError(400, `plan batili (${[...PLANS].join(', ')})`);
    if (!CYCLES.has(billingCycle)) throw new HttpError(400, `billing_cycle batili (${[...CYCLES].join(', ')})`);
    if (plan === 'free') throw new HttpError(422, 'Free plan haiwezi kusajiliwa kupitia billing');

    const now = new Date();
    const expiresAt = new Date(now.getTime() + cycleMs(billingCycle));

    const subscription = await Subscription.create({
      businessId: req.business.id,
      plan,
      billingCycle,
      priceAmount: priceAmount !== undefined ? priceAmount : null,
      currency,
      paymentProvider: paymentProvider || null,
      paymentRef: null,
      startedAt: now,
      expiresAt,
      status: 'active',
    });

    return res.status(201).json({
      id: subscription.id,
      plan: subscription.plan,
      billing_cycle: subscription.billingCycle,
      price_amount: subscription.priceAmount,
      currency: subscription.currency,
      payment_provider: subscription.paymentProvider,
      started_at: subscription.startedAt,
      expires_at: subscription.expiresAt,
      status: subscription.status,
    });
  } catch (err) {
    return next(err);
  }
}

async function getSubscription(req, res, next) {
  try {
    const subscription = await Subscription.findOne({
      where: {
        businessId: req.business.id,
        status: { [Op.ne]: 'cancelled' },
      },
      order: [['id', 'DESC']],
    });

    if (!subscription) {
      return res.status(404).json({ message: 'Hakuna subscription ya sasa (plan: free)' });
    }

    return res.json({
      id: subscription.id,
      plan: subscription.plan,
      billing_cycle: subscription.billingCycle,
      price_amount: subscription.priceAmount,
      currency: subscription.currency,
      payment_provider: subscription.paymentProvider,
      payment_ref: subscription.paymentRef,
      started_at: subscription.startedAt,
      expires_at: subscription.expiresAt,
      status: subscription.status,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Callback from the payment gateway (Mobile Money / Flutterwave). Verifies the
 * provider signature then updates the subscription identified by payment_ref.
 * Placeholder verification — real provider HMAC rules land with Phase 2.
 */
async function billingWebhook(req, res, next) {
  try {
    const signature = req.headers['x-billing-signature'];
    if (!signature || !config.webhookSecret || signature !== config.webhookSecret) {
      return res.status(401).json({ message: 'Invalid billing signature' });
    }

    const payload = req.body || {};
    const { payment_ref: paymentRef, status: paymentStatus, plan, expires_at: expiresAt } = payload;

    const subscription = paymentRef
      ? await Subscription.findOne({ where: { paymentRef } })
      : null;

    if (!subscription) {
      logger.warn(`Billing webhook: subscription not found for ref ${paymentRef}`);
      return res.status(200).json({ received: true, matched: false });
    }

    if (paymentStatus === 'success' || paymentStatus === 'paid' || paymentStatus === 'completed') {
      subscription.status = 'active';
      if (plan && PLANS.has(plan)) subscription.plan = plan;
      if (expiresAt) subscription.expiresAt = new Date(expiresAt);
      await subscription.save();
      logger.info(`Subscription #${subscription.id} activated via billing webhook`);
    } else if (paymentStatus === 'expired' || paymentStatus === 'cancelled') {
      subscription.status = paymentStatus;
      await subscription.save();
    }

    return res.status(200).json({ received: true, matched: true });
  } catch (err) {
    return next(err);
  }
}

module.exports = { subscribe, getSubscription, billingWebhook };