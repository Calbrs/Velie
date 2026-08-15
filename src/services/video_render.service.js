'use strict';

const path = require('path');
const crypto = require('crypto');
const fs = require('fs').promises;
const os = require('os');
const { spawn } = require('child_process');
const models = require('../models');
const config = require('../config/env');
const logger = require('../utils/logger');
const media = require('./media.service');

const { VideoRenderJob, MediaAsset, PostSchedule } = models;

const ffmpegPath = require('ffmpeg-static');

/**
 * Local video-rendering service.
 *
 * The backend renders video itself with a bundled ffmpeg binary (ffmpeg-static,
 * installed via npm so no system packages are needed on Render or the box).
 * This keeps the heavy processing on the Render deployment and out of the
 * app/phone: the app submits a VideoComposition, the service downloads the
 * referenced assets, runs a filter graph (trim / watermark / text / music),
 * stores the finished .mp4 in local storage and wires it to the post.
 *
 * When ffmpeg is unavailable or VIDEO_RENDER_SIMULATE=true, the job "completes"
 * using the source URL so the app flow can be exercised without a render.
 */

function fontPath() {
  return config.videoRender.fontFile
    || path.resolve(__dirname, '../../assets/fonts/DejaVuSans.ttf');
}

function shouldSimulate() {
  return config.videoRender.simulate || !ffmpegPath;
}

/** Create a job row and start the render (fire-and-forget from the API). */
async function startRender(businessId, composition, { postId = null } = {}) {
  const job = await VideoRenderJob.create({
    businessId,
    postId,
    composition,
    status: 'queued',
  });

  // Don't block the API response on the render.
  processRender(job.id).catch((err) => {
    logger.error(`video render job #${job.id} failed unexpectedly: ${err.message}`);
  });

  return job;
}

async function processRender(jobId) {
  const job = await VideoRenderJob.findByPk(jobId);
  if (!job) return;

  if (shouldSimulate()) {
    job.status = 'processing';
    job.composition = job.composition || {};
    await job.save();

    await new Promise((resolve) => setTimeout(resolve, config.videoRender.simulateDelayMs));
    const finalUrl = media.absoluteUrl(job.composition.source_video_url);
    await finalizeRender(job.id, finalUrl, { simulated: true });
    return;
  }

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'velie-render-'));
  try {
    job.status = 'processing';
    await job.save();
    const outputPath = await renderComposition(job.composition, workDir);
    await finalizeRender(job.id, outputPath, { simulated: false });
  } catch (err) {
    await markFailed(job.id, err.message);
  } finally {
    fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Download the composition's assets and run the ffmpeg filter graph.
 * Returns the absolute path of the finished .mp4.
 */
async function renderComposition(composition, workDir) {
  const download = async (url, name) => {
    if (!url || !/^(https?:\/\/|file:\/\/|\/|[a-zA-Z]:[\\/])/i.test(url)) return null;
    const full = path.join(workDir, name);
    if (/^https?:\/\//i.test(url)) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Assets download failed (${res.status})`);
      const buf = Buffer.from(await res.arrayBuffer());
      await fs.writeFile(full, buf);
    } else {
      // Local path (absolute or file://) — copy directly (dev/test convenience).
      const local = url.replace(/^file:\/\/\//i, '').replace(/^file:\/\//i, '');
      await fs.copyFile(local, full);
    }
    return full;
  };

  const sourceFile = await download(composition.source_video_url, 'source.mp4');
  if (!sourceFile) throw new Error('source_video_url haipatikani');

  const wmFile = composition.watermark && composition.watermark.image_url
    ? await download(composition.watermark.image_url, 'watermark.png')
    : null;
  const musicFile = composition.background_music && composition.background_music.audio_url
    ? await download(composition.background_music.audio_url, 'music.m4a')
    : null;

  const outputFile = path.join(workDir, 'output.mp4');
  await runFfmpeg({
    sourceFile,
    wmFile,
    musicFile,
    composition,
    outputFile,
  });
  return outputFile;
}

/** Build the ffmpeg arguments for a composition and execute them. */
async function runFfmpeg({ sourceFile, wmFile, musicFile, composition, outputFile }) {
  const args = [];
  args.push('-y');
  args.push('-i', sourceFile);
  if (wmFile) args.push('-i', wmFile);
  if (musicFile) args.push('-i', musicFile);

  const filter = [];
  const inputs = { video: 0, audio: 0, music: null };
  if (musicFile) inputs.music = wmFile ? 2 : 1;

  // --- Video chain ---
  let vChain = `[0:v]`;
  const trim = composition.trim;
  if (trim && Number(trim.end_time) > Number(trim.start_time)) {
    const start = Number(trim.start_time) || 0;
    const dur = Number(trim.end_time) - start;
    vChain += `trim=start=${start}:duration=${dur},setpts=PTS-STARTPTS,`;
  }
  vChain += 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black[v0];';
  filter.push(vChain);

  let videoOut = 'v0';
  let wmInput = 1;

  if (wmFile) {
    const scale = Number(composition.watermark.scale) || 0.5;
    const wmX = Number(composition.watermark.x_position) || 50;
    const wmY = Number(composition.watermark.y_position) || 100;
    filter.push(`[1:v]scale=iw*${scale}:-1[wm];`);
    filter.push(`[v0][wm]overlay=${wmX}:${wmY}[v1];`);
    videoOut = 'v1';
    wmInput = 2;
  }

  const overlays = composition.text_overlays || [];
  if (overlays.length > 0) {
    const textFilters = [];
    overlays.forEach((t, i) => {
      const safe = String(t.text || '').replace(/[\\:]/g, (m) => (m === '\\' ? '\\\\' : '\\:'));
      const size = Number(t.font_size) || 48;
      const color = t.color || '#FFFFFF';
      const x = Number(t.x_position) || 200;
      const y = Number(t.y_position) || 800;
      textFilters.push(`drawtext=fontfile=${fontPath()}:text='${safe}':fontsize=${size}:fontcolor=${color}:x=${x}:y=${y}`);
    });
    filter.push(`[${videoOut}]${textFilters.join(',')}[vt];`);
    videoOut = 'vt';
  }

  // --- Audio chain: only audio streams may enter amix ---
  let audioOut = null;
  if (musicFile) {
    const vol = Number(composition.background_music.volume) || 0.8;
    const mute = composition.background_music.mute_original_audio !== false;
    const musicIdx = wmFile ? 2 : 1;
    if (mute) {
      // Mute the original track entirely; keep just the music at its volume.
      filter.push(`[0:a]volume=0[vo];`);
      filter.push(`[${musicIdx}:a]volume=${vol}[ma];`);
      filter.push(`[vo][ma]amix=inputs=2:duration=first:dropout_transition=0[a];`);
    } else {
      filter.push(`[0:a]volume=1[vo];`);
      filter.push(`[${musicIdx}:a]volume=${vol}[ma];`);
      filter.push(`[vo][ma]amix=inputs=2:duration=first:dropout_transition=0[a];`);
    }
    audioOut = '[a]'; // filter-graph output label
  } else {
    audioOut = '0:a'; // pass through source audio untouched
  }

  const mapArgs = [`-map`, `[${videoOut}]`, '-map', audioOut];

  args.push(
    '-filter_complex', filter.join(''),
    ...mapArgs,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    '-shortest',
    outputFile,
  );

  await execFfmpeg(args);
}

/** Spawn the bundled ffmpeg; rejects with stderr on non-zero exit. */
function execFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, { windowsHide: true });
    let stderr = '';
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.split('\n').slice(-6).join(' ')}`));
    });
  });
}

/** Finalize a completed render: register the asset, update job + post. */
async function finalizeRender(jobId, outputPath, { simulated = false } = {}) {
  const job = await VideoRenderJob.findByPk(jobId);
  if (!job) return null;

  let outputUrl = simulated ? outputPath : null;
  if (!simulated) {
    const name = `${Date.now()}_${crypto.randomBytes(8).toString('hex')}.mp4`;
    const dest = path.join(media.uploadDir, name);
    await fs.copyFile(outputPath, dest);
    const asset = await MediaAsset.create({
      businessId: job.businessId,
      storagePath: media.storageUrlFor({ filename: name }),
      mimeType: 'video/mp4',
      sizeBytes: (await fs.stat(dest)).size,
      expiresAt: null,
    });
    outputUrl = media.absoluteUrl(asset.storagePath);

    if (job.postId) {
      const post = await PostSchedule.findByPk(job.postId);
      if (post && post.status === 'pending') {
        post.mediaAssetId = asset.id;
        await post.save();
      }
    }
  }

  job.status = 'completed';
  job.outputUrl = outputUrl;
  job.completedAt = new Date();
  await job.save();
  logger.info(`video render job #${job.id} completed (${outputUrl})`);
  return job;
}

async function markFailed(jobId, message) {
  const job = await VideoRenderJob.findByPk(jobId);
  if (!job) return;
  job.status = 'failed';
  job.error = String(message || 'Unknown render error').slice(0, 1000);
  await job.save();
  logger.warn(`video render job #${job.id} failed: ${job.error}`);
}

module.exports = {
  startRender,
  processRender,
  finalizeRender,
  markFailed,
  shouldSimulate,
  renderComposition,
  runFfmpeg,
  fontPath,
};