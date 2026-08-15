'use strict';

const models = require('../models');
const media = require('../services/media.service');
const videoRender = require('../services/video_render.service');
const HttpError = require('../utils/HttpError');

const { VideoRenderJob } = models;

const RESOLUTIONS = new Set(['1080x1920', '720x1280', '1920x1080']);

function validateComposition(body) {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'VideoComposition payload inahitajika');
  if (!body.source_video_url || !/^https?:\/\//i.test(body.source_video_url)) {
    throw new HttpError(400, 'source_video_url inahitajika (https URL)');
  }
  if (body.resolution && !RESOLUTIONS.has(body.resolution)) {
    throw new HttpError(400, `resolution batili (${[...RESOLUTIONS].join(', ')})`);
  }
  if (body.trim) {
    const start = Number(body.trim.start_time);
    const end = Number(body.trim.end_time);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      throw new HttpError(400, 'trim inahitajika: end_time lazima iwe kubwa kuliko start_time');
    }
  }
  if (Array.isArray(body.text_overlays)) {
    for (const t of body.text_overlays) {
      if (!t || typeof t.text !== 'string' || t.text.trim() === '') {
        throw new HttpError(400, 'kila text_overlay inahitaji text isiyo tupu');
      }
    }
  }
  return body;
}

/**
 * POST /api/v1/video/asset — upload a raw video/audio/image that will be
 * referenced from a composition (source video, watermark or background music).
 * Returns the public URL to embed in the composition payload.
 */
async function uploadAsset(req, res, next) {
  try {
    if (!req.file) throw new HttpError(400, 'Faili inahitajika (multipart field: file)');
    const asset = await media.registerUpload(req.file, req.business.id);
    return res.status(201).json({
      asset_id: asset.id,
      url: media.absoluteUrl(asset.storagePath),
    });
  } catch (err) {
    return next(err);
  }
}

async function createRender(req, res, next) {
  try {
    const composition = validateComposition(req.body);
    const postId = req.body.post_id ? Number(req.body.post_id) : null;

    const job = await videoRender.startRender(req.business.id, composition, {
      postId: Number.isInteger(postId) && postId > 0 ? postId : null,
    });

    return res.status(202).json({
      job_id: job.id,
      status: job.status,
      message: 'Render imepokelewa. Angalia hali kupitia /api/v1/video/render/status',
    });
  } catch (err) {
    return next(err);
  }
}

async function getStatus(req, res, next) {
  try {
    const id = Number(req.query.job_id || req.query.id);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'job_id sahihi inahitajika');

    const job = await VideoRenderJob.findOne({ where: { id, businessId: req.business.id } });
    if (!job) throw new HttpError(404, 'Render job haipo');

    return res.json({
      job_id: job.id,
      status: job.status,
      output_url: job.outputUrl,
      error: job.error,
      completed_at: job.completedAt,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { uploadAsset, createRender, getStatus };