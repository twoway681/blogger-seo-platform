'use strict';
// CDN storage abstraction. MVP driver: local disk served at /uploads.
// Production drivers (documented in README, no spend in MVP):
//   - Cloudflare R2 (S3-compatible, zero egress fees, free tier 10 GB)
//   - Cloudinary (free tier 25 credits/mo) with f_auto,q_auto transforms
//   - AWS S3 + CloudFront
// Each driver implements put({ key, buffer, contentType }) -> public URL.

const fs = require('fs');
const path = require('path');
const config = require('../config');

const local = {
  name: 'local',
  async put({ key, buffer }) {
    const dest = path.join(config.paths.uploads, key);
    await fs.promises.mkdir(path.dirname(dest), { recursive: true });
    await fs.promises.writeFile(dest, buffer);
    return `${config.baseUrl}/uploads/${key}`;
  },
};

// Stub kept deliberately small: wiring R2 later means adding @aws-sdk/client-s3 and env
// vars R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET / R2_PUBLIC_BASE_URL,
// then implementing put() with PutObjectCommand. See README "Connecting paid services".
const r2 = {
  name: 'r2',
  async put() {
    throw new Error('R2 driver not configured - set IMAGE_STORAGE=local for the MVP or add R2 credentials (see README).');
  },
};

function driver() {
  switch (config.imageStorage) {
    case 'r2': return r2;
    case 'local':
    default: return local;
  }
}

module.exports = { driver };
