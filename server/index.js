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
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  app.use('/auth', auth.router);
  app.use('/api', api);

  // Static: editor app (client/) and uploaded images (public/uploads).
  app.use(express.static(path.join(config.paths.root, 'client')));
  app.use('/uploads', express.static(config.paths.uploads, { maxAge: '30d', immutable: true }));

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
