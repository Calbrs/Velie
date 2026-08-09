'use strict';

const { Business } = require('../models');

function extractBearerToken(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme && scheme.toLowerCase() === 'bearer' && token) return token;
  return null;
}

async function authenticate(req, res, next) {
  const token = extractBearerToken(req);
  if (!token) return res.status(401).json({ message: 'Access token inahitajika' });

  try {
    const business = await Business.findOne({ where: { accessToken: token } });
    if (!business) return res.status(401).json({ message: 'Access token batili' });
    req.business = business;
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { authenticate, extractBearerToken };