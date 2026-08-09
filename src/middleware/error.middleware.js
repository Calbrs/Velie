'use strict';

const multer = require('multer');
const logger = require('../utils/logger');

function notFoundHandler(req, res) {
  return res.status(404).json({ message: 'Route haipo' });
}

function internalErrorLogger(err) {
  if (!err.expose) logger.error(err.stack || err.message);
}

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  let status = err.status || 500;
  let message = err.expose ? err.message : 'Internal server error';

  if (err instanceof multer.MulterError) {
    status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    message = err.code === 'LIMIT_FILE_SIZE'
      ? 'Picha ni kubwa mno'
      : `Upload error: ${err.code}`;
  }

  if (err.name === 'SequelizeValidationError') {
    status = 422;
    message = err.errors.map((e) => e.message).join('; ');
  }

  if (err.name === 'SequelizeUniqueConstraintError') {
    status = 409;
    message = 'Duplicate value: data hiyo tayari ipo';
  }

  if (status >= 500) internalErrorLogger(err);

  if (res.headersSent) return next(err);

  const payload = { message };
  if (err.details && status < 500) payload.details = err.details;
  if (status === 500 && (err.expose || req.app.get('env') === 'development')) payload.message = message;
  return res.status(status).json(payload);
}

module.exports = { notFoundHandler, errorHandler };