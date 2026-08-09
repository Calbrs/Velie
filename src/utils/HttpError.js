'use strict';

class HttpError extends Error {
  constructor(status, message, expose = true, details = null) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.expose = expose;
    this.details = details;
  }
}

module.exports = HttpError;