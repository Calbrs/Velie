'use strict';

const { User } = require('../models');

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
    const user = await User.findOne({ where: { accessToken: token } });
    if (!user) return res.status(401).json({ message: 'Access token batili' });
    req.user = user;
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { authenticate, extractBearerToken };