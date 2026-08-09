'use strict';

const instanceService = require('../services/instance.service');

async function createOrGet(req, res, next) {
  try {
    const publicBaseUrl = instanceService.resolvePublicBaseUrl(req);
    const instance = await instanceService.getOrCreateForBusiness(req.business, publicBaseUrl);

    return res.status(201).json({
      id: instance.id,
      wsapi_instance_id: instance.wsapiInstanceId,
      status: instance.status,
      pairing_code: instance.pairingCode,
      pairing_code_expires_at: instance.pairingCodeExpiresAt,
    });
  } catch (err) {
    return next(err);
  }
}

async function getStatus(req, res, next) {
  try {
    const instance = await instanceService.getForBusiness(req.business, req.params.id);
    return res.json({
      id: instance.id,
      wsapi_instance_id: instance.wsapiInstanceId,
      status: instance.status,
      pairing_code: instance.pairingCode,
      pairing_code_expires_at: instance.pairingCodeExpiresAt,
      connected_at: instance.connectedAt,
    });
  } catch (err) {
    return next(err);
  }
}

async function refreshPairingCode(req, res, next) {
  try {
    const instance = await instanceService.refreshPairingCode(req.business, req.params.id);
    return res.json({
      id: instance.id,
      wsapi_instance_id: instance.wsapiInstanceId,
      status: instance.status,
      pairing_code: instance.pairingCode,
      pairing_code_expires_at: instance.pairingCodeExpiresAt,
    });
  } catch (err) {
    return next(err);
  }
}

async function disconnect(req, res, next) {
  try {
    const instance = await instanceService.disconnect(req.business, req.params.id);
    return res.json({
      id: instance.id,
      wsapi_instance_id: instance.wsapiInstanceId,
      status: instance.status,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { createOrGet, getStatus, refreshPairingCode, disconnect };