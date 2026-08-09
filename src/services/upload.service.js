'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const config = require('../config/env');
const HttpError = require('../utils/HttpError');

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const uploadDir = path.resolve(process.cwd(), config.uploads.dir);
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeExt = ALLOWED_EXT.has(ext) ? ext : '.img';
    cb(null, `${Date.now()}_${crypto.randomBytes(8).toString('hex')}${safeExt}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
  return cb(new HttpError(400, 'Invalid file type: picha jpg/png/webp pekee inakubaliwa'));
};

const imageUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.uploads.maxImageSizeMb * 1024 * 1024,
    files: 1,
  },
});

function deleteImageFile(storagePath) {
  if (!storagePath) return;
  const name = path.basename(storagePath);
  const full = path.join(uploadDir, name);
  if (!full.startsWith(uploadDir)) return;
  fs.unlink(full, (err) => {
    if (err && err.code !== 'ENOENT') {
      // non-fatal; media cleanup still removes the DB row
    }
  });
}

module.exports = { imageUpload, deleteImageFile, uploadDir, ALLOWED_MIME };