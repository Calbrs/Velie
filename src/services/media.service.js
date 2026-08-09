'use strict';

const { Op } = require('sequelize');
const models = require('../models');
const config = require('../config/env');
const { deleteImageFile, uploadDir } = require('./upload.service');
const logger = require('../utils/logger');

const { MediaAsset, PostSchedule } = models;

function storageUrlFor(file) {
  return `/uploads/${file.filename}`;
}

/** Register an uploaded file as a hybrid media asset (expires_at = NULL until first post ships). */
async function registerUpload(file, businessId) {
  return MediaAsset.create({
    businessId,
    storagePath: storageUrlFor(file),
    mimeType: file.mimetype,
    sizeBytes: file.size,
    expiresAt: null,
  });
}

/** Absolute URL (PUBLIC_BASE_URL + storage path) — what WSAPI must receive for /status/image. */
function absoluteUrl(storagePath) {
  if (!storagePath) return null;
  if (/^https?:\/\//i.test(storagePath)) return storagePath;
  return `${config.publicBaseUrl}${storagePath.startsWith('/') ? storagePath : `/${storagePath}`}`;
}

/**
 * Extend the asset's expiry to `at + retentionHours`. Called every time a post
 * that uses this asset is published, so an asset shared by several posts stays
 * alive until ALL of them have shipped.
 */
async function touchExpiry(mediaAssetId, at) {
  if (!mediaAssetId) return;
  const asset = await MediaAsset.findByPk(mediaAssetId);
  if (!asset) return;
  const candidate = new Date(at.getTime() + config.cleanup.retentionHours * 3600 * 1000);
  if (!asset.expiresAt || new Date(asset.expiresAt) < candidate) {
    asset.expiresAt = candidate;
    await asset.save();
  }
}

/** Remove the physical file if it has no DB references left (e.g. post deleted). */
async function releaseIfUnused(mediaAssetId) {
  if (!mediaAssetId) return;
  const refs = await PostSchedule.count({ where: { mediaAssetId } });
  if (refs > 0) return;
  const asset = await MediaAsset.findByPk(mediaAssetId);
  if (!asset) return;
  deleteImageFile(asset.storagePath);
  await asset.destroy();
  logger.info(`Media asset #${asset.id} released (no references)`);
}

/**
 * Hourly cleanup worker body: remove assets whose expiry has passed and which
 * are no longer referenced by any pending post.
 */
async function runCleanup() {
  const now = new Date();
  const expired = await MediaAsset.findAll({
    where: { expiresAt: { [Op.lt]: now } },
  });

  let removed = 0;
  for (const asset of expired) {
    const pendingRefs = await PostSchedule.count({
      where: { mediaAssetId: asset.id, status: 'pending' },
    });
    if (pendingRefs > 0) continue;
    deleteImageFile(asset.storagePath);
    await asset.destroy();
    removed += 1;
    logger.info(`Media asset #${asset.id} cleaned up (${asset.storagePath})`);
  }
  return removed;
}

module.exports = { registerUpload, absoluteUrl, touchExpiry, releaseIfUnused, runCleanup, uploadDir };