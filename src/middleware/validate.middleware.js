'use strict';

const HttpError = require('../utils/HttpError');

/** Reject the request when any of the given body fields is missing/empty. */
function requireFields(fields) {
  return (req, res, next) => {
    const missing = fields
      .filter((f) => {
        const value = req.body ? req.body[f] : undefined;
        return value === undefined || value === null || String(value).trim() === '';
      });

    if (missing.length > 0) {
      return next(new HttpError(400, `Missing fields: ${missing.join(', ')}`));
    }
    return next();
  };
}

function validIntParam(name) {
  return (req, res, next) => {
    const value = req.params[name];
    if (!Number.isInteger(Number(value)) || Number(value) <= 0) {
      return next(new HttpError(400, `Invalid ${name} parameter`));
    }
    return next();
  };
}

module.exports = { requireFields, validIntParam };