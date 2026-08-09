'use strict';

const bcrypt = require('bcryptjs');
const { Business } = require('../models');
const { generateAccessToken } = require('../utils/token');
const HttpError = require('../utils/HttpError');

const BCRYPT_ROUNDS = 10;
const PHONE_RE = /^\+\d{9,15}$/;

/** Normalize any accepted phone form to one E.164 (+255...). */
function normalizeE164(value) {
  const digits = String(value || '').replace(/[^0-9]/g, '');
  const withCountry = digits.replace(/^0/, '').replace(/^255/, '');
  const body = withCountry.length > 9
    ? withCountry.slice(-9)
    : withCountry.padStart(9, '0');
  return body ? `+255${body}` : '';
}

function serialize(business) {
  return {
    id: business.id,
    name: business.name || business.businessName,
    owner_phone: business.ownerPhone,
    plan: business.plan,
    access_token: business.accessToken,
    created_at: business.createdAt,
  };
}

async function register(req, res, next) {
  try {
    const { name, owner_phone: ownerPhone, password } = req.body;

    const normalizedName = String(name).trim();
    const normalizedPhone = normalizeE164(ownerPhone);

    if (!normalizedName) throw new HttpError(400, 'name inahitajika');
    if (!PHONE_RE.test(normalizedPhone)) {
      throw new HttpError(400, 'owner_phone muundo si sahihi (mfano +2557XXXXXXX)');
    }
    if (!password || String(password).length < 6) {
      throw new HttpError(400, 'password lazima iwe na herufi 6 au zaidi');
    }

    const existing = await Business.findOne({ where: { ownerPhone: normalizedPhone } });
    if (existing) throw new HttpError(409, 'Namba hii tayari imesajiliwa');

    const passwordHash = await bcrypt.hash(String(password), BCRYPT_ROUNDS);

    const business = await Business.create({
      name: normalizedName,
      businessName: normalizedName,
      ownerPhone: normalizedPhone,
      accessToken: generateAccessToken(32),
      passwordHash,
      plan: 'free',
    });

    return res.status(201).json(serialize(business));
  } catch (err) {
    return next(err);
  }
}

async function login(req, res, next) {
  try {
    const { owner_phone: ownerPhone, password } = req.body;

    const normalizedPhone = normalizeE164(ownerPhone);
    if (!PHONE_RE.test(normalizedPhone)) {
      throw new HttpError(400, 'owner_phone muundo si sahihi');
    }
    if (!password) throw new HttpError(400, 'password inahitajika');

    const business = await Business.findOne({ where: { ownerPhone: normalizedPhone } });
    if (!business || !business.passwordHash) {
      throw new HttpError(401, 'Namba au password si sahihi');
    }

    const ok = await bcrypt.compare(String(password), business.passwordHash);
    if (!ok) throw new HttpError(401, 'Namba au password si sahihi');

    // Rotate the token on every login so a stolen token gets invalidated.
    business.accessToken = generateAccessToken(32);
    await business.save();

    return res.json(serialize(business));
  } catch (err) {
    return next(err);
  }
}

module.exports = { register, login, normalizeE164 };
