'use strict';
require('dotenv').config();

const path = require('path');
const ROOT = path.join(__dirname, '..');

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  baseUrl: (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, ''),
  sessionSecret: process.env.SESSION_SECRET || null,
  provider: (process.env.PROVIDER || 'fake').toLowerCase(),
  publishMode: (process.env.PUBLISH_MODE || 'dry_run').toLowerCase(), // 'dry_run' | 'live'
  imageStorage: (process.env.IMAGE_STORAGE || 'local').toLowerCase(),
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    // Blogger API v3 (write) + Search Console read-only, per blueprint Phase 1.
    scopes: [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/blogger',
      'https://www.googleapis.com/auth/webmasters', // read/write: sitemap submission + property setup
    ],
    redirectUri: `${(process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '')}/auth/google/callback`,
  },
  paths: {
    root: ROOT,
    data: process.env.DATA_DIR || path.join(ROOT, 'data'),
    uploads: path.join(ROOT, 'public', 'uploads'),
    publicDir: path.join(ROOT, 'public'),
  },
};

// Fall back to the offline fake provider whenever Google credentials are absent.
config.googleConfigured = Boolean(config.google.clientId && config.google.clientSecret);
config.effectiveProvider = config.provider === 'google' && config.googleConfigured ? 'google' : 'fake';
// Live publishing requires BOTH the real provider and an explicit opt-in.
config.livePublishingEnabled = config.effectiveProvider === 'google' && config.publishMode === 'live';

// Without an explicit SESSION_SECRET, generate a random one per boot so the app
// never runs on a publicly-known secret (sessions are invalidated on restart -
// acceptable for the self-hosted MVP; set SESSION_SECRET in .env to persist them).
if (!config.sessionSecret) {
  config.sessionSecret = require('crypto').randomBytes(32).toString('hex');
  console.warn('[security] SESSION_SECRET not set - using a random per-boot secret. Set it in .env to keep sessions across restarts.');
}
module.exports = config;
