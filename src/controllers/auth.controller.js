'use strict';

const { Business } = require('../models');
const { generateAccessToken } = require('../utils/token');
const HttpError = require('../utils/HttpError');

async function register(req, res, next) {
  try {
    const { business_name: businessName, owner_phone: ownerPhone } = req.body;

    const normalizedName = String(businessName).trim();
    const normalizedPhone = String(ownerPhone).trim();

    if (!normalizedName) throw new HttpError(400, 'business_name inahitajika');
    if (!/^\+?\d{7,15}$/.test(normalizedPhone.replace(/[\s-]/g, ''))) {
      throw new HttpError(400, 'owner_phone muundo si sahihi (mfano +2557XXXXXXX)');
    }

    const existing = await Business.findOne({ where: { ownerPhone } });
    if (existing) throw new HttpError(409, 'owner_phone tayari imesajiliwa');

    const business = await Business.create({
      businessName: normalizedName,
      ownerPhone: normalizedPhone,
      accessToken: generateAccessToken(32),
      plan: 'free',
    });

    return res.status(201).json({
      id: business.id,
      business_name: business.businessName,
      owner_phone: business.ownerPhone,
      plan: business.plan,
      access_token: business.accessToken,
      created_at: business.createdAt,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { register };