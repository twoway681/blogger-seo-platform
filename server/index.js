'use strict';
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const config = require('./config');
const auth = require('./routes/auth');
const api = require('./routes/api');

function createApp() {
  const app = express();
  app.disable('x-powered-by');

  // Baseline security headers on every response. CSP allows inline script/style
  // because the client renders rows with inline handlers; object/embed are off.
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    });
    next();
  });

  // Small fixed-window in-memory rate limiter - no external service needed.
  // Buckets: auth (OAuth start/callback) and general API. Single-process MVP
  // scope; a multi-instance deployment would move this to the edge (Cloudflare).
  const buckets = new Map(); // key -> { count, resetAt }
  function rateLimit({ windowMs, max, keyFn }) {
    return (req, res, next) => {
      const now = Date.now();
      const key = keyFn(req);
      let b = buckets.get(key);
      if (!b || now > b.resetAt) { b = { count: 0, resetAt: now + windowMs }; buckets.set(key, b); }
      b.count += 1;
      if (buckets.size > 10000) { for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k); }
      if (b.count > max) {
        res.set('Retry-After', String(Math.ceil((b.resetAt - now) / 1000)));
        return res.status(429).json({ error: 'rate_limited', retryAfterSeconds: Math.ceil((b.resetAt - now) / 1000) });
      }
      next();
    };
  }
  const ip = (req) => req.ip || req.socket.remoteAddress || 'unknown';
  app.use('/auth', rateLimit({ windowMs: 10 * 60 * 1000, max: 60, keyFn: (req) => `auth:${ip(req)}` }));
  app.use('/api', rateLimit({ windowMs: 60 * 1000, max: 240, keyFn: (req) => `api:${ip(req)}` }));

  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  app.use('/auth', auth.router);
  app.use('/api', api);

  // Static: editor app (client/) and uploaded images (public/uploads).
  app.use(express.static(path.join(config.paths.root, 'client')));
  app.use('/uploads', express.static(config.paths.uploads, { maxAge: '30d', immutable: true }));
  app.use('/templates', express.static(path.join(config.paths.root, 'templates')));

  app.get('/healthz', (req, res) => res.json({ ok: true, provider: config.effectiveProvider, publishMode: config.publishMode }));

  // SPA fallback (Express 5 has no '*' route; middleware catches remaining GETs)
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(config.paths.root, 'client', 'index.html'));
  });

  // JSON error handler (multer errors etc.)
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    res.status(err.status || 500).json({ error: err.code || 'server_error', message: err.message });
  });
  return app;
}

if (require.main === module) {
  const app = createApp();
  app.listen(config.port, () => {
    console.log(`Blogger SEO platform listening on ${config.baseUrl}`);
    console.log(`Provider: ${config.effectiveProvider} | publish mode: ${config.publishMode} | live publishing: ${config.livePublishingEnabled ? 'ON' : 'OFF (dry run)'}`);
  });
}

module.exports = { createApp };
