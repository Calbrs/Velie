'use strict';

const { User } = require('../models');
const { generateAccessToken } = require('../utils/token');
const HttpError = require('../utils/HttpError');

function normalizeEmail(email) {
  return String(email).trim().toLowerCase();
}

/**
 * Register: (1) create the user account, (2) generate its access token.
 * The WSAPI instance for this user is created lazily on "Connect WhatsApp"
 * (POST /admin/instances) with a per-instance id + api key.
 */
async function register(req, res, next) {
  try {
    const { name, email, phone } = req.body;

    const normalizedName = String(name).trim();
    const normalizedEmail = normalizeEmail(email);
    const normalizedPhone = phone ? String(phone).trim() : null;

    if (!normalizedName) throw new HttpError(400, 'name inahitajika');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw new HttpError(400, 'email batili');
    }
    if (normalizedPhone && !/^\+?\d{7,15}$/.test(normalizedPhone.replace(/[\s-]/g, ''))) {
      throw new HttpError(400, 'phone muundo si sahihi (mfano +2557XXXXXXX)');
    }

    const existing = await User.findOne({ where: { email: normalizedEmail } });
    if (existing) throw new HttpError(409, 'Email tayari imesajiliwa');

    const user = await User.create({
      name: normalizedName,
      email: normalizedEmail,
      phone: normalizedPhone,
      accessToken: generateAccessToken(32),
      plan: 'free',
    });

    return res.status(201).json({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      plan: user.plan,
      access_token: user.accessToken,
      created_at: user.createdAt,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { register };