'use strict';

const { Business } = require('../models');
const { generateAccessToken } = require('../utils/token');
const HttpError = require('../utils/HttpError');

/** Normalize any accepted phone form to one E.164 (+255...). */
function normalizeE164(value) {
  const digits = String(value || '').replace(/[^0-9]/g, '');
  const withCountry = digits.replace(/^0/, '').replace(/^255/, '');
  const body = withCountry.length > 9
    ? withCountry.slice(-9)
    : withCountry.padStart(9, '0');
  return body ? `+255${body}` : '';
}

async function register(req, res, next) {
  try {
    const { business_name: businessName, owner_phone: ownerPhone } = req.body;

    const normalizedName = String(businessName).trim();
    const normalizedPhone = normalizeE164(ownerPhone);

    if (!normalizedName) throw new HttpError(400, 'business_name inahitajika');
    if (!/^\+\d{9,15}$/.test(normalizedPhone)) {
      throw new HttpError(400, 'owner_phone muundo si sahihi (mfano +2557XXXXXXX)');
    }

    const existing = await Business.findOne({ where: { ownerPhone: normalizedPhone } });
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