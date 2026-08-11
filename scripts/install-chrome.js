'use strict';

// Self-contained Chrome installer for puppeteer 24 that does NOT use
// @puppeteer/browsers' install() (its yauzl-based unpack hangs mid-extraction
// on this archive). We download the pinned archive ourselves and extract with
// unzipper (a direct dependency of whatsapp-web.js).
//
// The archive chrome-<platform>.zip contains a top-level folder like
// chrome-linux64/, so extracting into <cache>/chrome/<platformDir>-<buildId>/
// yields exactly the <executablePath> puppeteer computes. Returns the
// executable path on success, throws on failure.

const fs = require('fs');
const path = require('path');
const https = require('https');
const { pipeline } = require('stream/promises');

function parseExecutablePath(executablePath) {
  const m = executablePath.match(
    /[\\/]chrome[\\/]([A-Za-z0-9_]+)-(\d+\.\d+\.\d+\.\d+)[\\/]([^\\/]+)[\\/]([^\\/]+)$/
  );
  if (!m) throw new Error('Could not parse executablePath: ' + executablePath);
  return { platform: m[1], buildId: m[2], folder: m[3], binaryName: m[4] };
}

function urlPlatformFor(platform) {
  return platform === 'linux'
    ? 'linux64'
    : platform === 'win32'
      ? 'win32'
      : platform;
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const doGet = (target, redirects) => {
      https
        .get(target, { headers: { 'User-Agent': 'puppeteer-install' } }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            if (redirects >= 5) return reject(new Error('Too many redirects'));
            return doGet(new URL(res.headers.location, target), redirects + 1);
          }
          if (res.statusCode !== 200) {
            res.resume();
            return reject(new Error('Download failed: HTTP ' + res.statusCode + ' for ' + target));
          }
          pipeline(res, fs.createWriteStream(dest))
            .then(() => resolve(dest))
            .catch(reject);
        })
        .on('error', reject);
    };
    doGet(url, 0);
  });
}

async function installChrome(executablePath, cacheDir, log) {
  const out = log || ((...a) => console.log(...a));
  const { platform, buildId, folder, binaryName } = parseExecutablePath(executablePath);
  const urlPlatform = urlPlatformFor(platform);
  const installDir = path.join(cacheDir, 'chrome', `${platform}-${buildId}`);
  const url = `https://storage.googleapis.com/chrome-for-testing-public/${buildId}/${urlPlatform}/chrome-${urlPlatform}.zip`;

  out('[install-chrome] url', url);
  fs.rmSync(installDir, { recursive: true, force: true });
  fs.mkdirSync(installDir, { recursive: true });

  const zipPath = path.join(installDir, 'archive.zip');
  await downloadFile(url, zipPath);
  out('[install-chrome] downloaded', fs.statSync(zipPath).size, 'bytes');

  const unzipper = require('unzipper');
  await new Promise((resolve, reject) => {
    fs.createReadStream(zipPath)
      .pipe(unzipper.Extract({ path: installDir }))
      .on('close', resolve)
      .on('error', reject);
  });

  const binPath = path.join(installDir, folder, binaryName);
  if (!fs.existsSync(binPath)) {
    throw new Error('Chrome binary not found after extraction at ' + binPath);
  }
  if (process.platform !== 'win32') {
    // unzipper does not preserve Unix exec bits, so Chrome's helper binaries
    // (chrome, chrome_crashpad_handler, chrome-sandbox, ...) come out
    // non-executable and Chrome aborts with "Permission denied (13)" on
    // posix_spawn. Make everything under the folder executable.
    try {
      chmodXTree(path.join(installDir, folder));
      fs.chmodSync(binPath, 0o755);
    } catch (e) {
      out('[install-chrome] chmod warning', e.message);
    }
  }
  fs.rmSync(zipPath, { force: true });
  out('[install-chrome] installed', binPath);
  return binPath;
}

function chmodXTree(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) chmodXTree(full);
    else fs.chmodSync(full, 0o755);
  }
}

module.exports = { parseExecutablePath, installChrome, chmodXTree };