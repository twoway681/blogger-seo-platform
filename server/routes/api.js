'use strict';
const express = require('express');
const multer = require('multer');
const db = require('../db');
const config = require('../config');
const provider = require('../blogger/provider');
const { requireAuth, saveTokens, newId } = require('./auth');
const { analyzePost } = require('../seo/analyzer');
const { composePostPayload } = require('../seo/compose');
const { processImage } = require('../images/pipeline');
const { suggestKeywords, researchKeywords } = require('../keywords/provider');
const { suggestInternalLinks } = require('../links/suggest');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const postCols = `id, blog_id AS blogId, blogger_post_id AS bloggerPostId, title, html, meta_description AS metaDescription,
  focus_keyword AS focusKeyword, labels, status, scheduled_at AS scheduledAt, published_url AS publishedUrl,
  seo_json AS seoJson, created_at AS createdAt, updated_at AS updatedAt`;

function getPost(req, res) {
  const post = db.prepare(`SELECT ${postCols} FROM posts WHERE id = ? AND user_id = ?`).get(req.params.id, req.user.id);
  if (!post) res.status(404).json({ error: 'post_not_found' });
  return post;
}

function blogUrlFor(userId, blogId) {
  const b = db.prepare('SELECT url FROM blogs WHERE id = ? AND user_id = ?').get(blogId, userId);
  return b ? b.url : '';
}

router.get('/me', requireAuth, (req, res) => {
  res.json({
    user: { email: req.user.email, name: req.user.name, picture: req.user.picture },
    provider: config.effectiveProvider,
    googleConfigured: config.googleConfigured,
    publishMode: config.publishMode,
    livePublishingEnabled: config.livePublishingEnabled,
    imageStorage: config.imageStorage,
  });
});

// --- Blogs -------------------------------------------------------------
router.get('/blogs', requireAuth, async (req, res) => {
  try {
    const data = await provider.listBlogs(req.user, saveTokens(req.user.id));
    const items = data.items || [];
    const upsert = db.prepare(`INSERT INTO blogs (id, user_id, name, url, provider, raw_json, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, url=excluded.url, raw_json=excluded.raw_json, synced_at=excluded.synced_at`);
    for (const b of items) upsert.run(String(b.id), req.user.id, b.name || '', b.url || '', config.effectiveProvider, JSON.stringify(b));
    res.json({ items });
  } catch (err) {
    res.status(502).json({ error: 'blogger_api_error', message: err.message });
  }
});

router.get('/blogs/:blogId/posts', requireAuth, async (req, res) => {
  try {
    const data = await provider.listPosts(req.user, req.params.blogId, saveTokens(req.user.id));
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'blogger_api_error', message: err.message });
  }
});

// --- Local drafts ------------------------------------------------------
router.get('/posts', requireAuth, (req, res) => {
  const rows = db.prepare(`SELECT ${postCols} FROM posts WHERE user_id = ? ORDER BY updated_at DESC`).all(req.user.id);
  res.json({ items: rows });
});

router.post('/posts', requireAuth, (req, res) => {
  const { blogId, title = '' } = req.body || {};
  if (!blogId) return res.status(400).json({ error: 'blogId required' });
  const id = newId('post');
  db.prepare('INSERT INTO posts (id, user_id, blog_id, title) VALUES (?, ?, ?, ?)').run(id, req.user.id, String(blogId), title);
  const post = db.prepare(`SELECT ${postCols} FROM posts WHERE id = ?`).get(id);
  res.status(201).json(post);
});

router.get('/posts/:id', requireAuth, (req, res) => {
  const post = getPost(req, res);
  if (post) res.json(post);
});

router.put('/posts/:id', requireAuth, (req, res) => {
  const post = getPost(req, res);
  if (!post) return;
  const { title, html, metaDescription, focusKeyword, labels } = req.body || {};
  db.prepare(`UPDATE posts SET title = COALESCE(?, title), html = COALESCE(?, html),
    meta_description = COALESCE(?, meta_description), focus_keyword = COALESCE(?, focus_keyword),
    labels = COALESCE(?, labels), updated_at = datetime('now') WHERE id = ?`)
    .run(title ?? null, html ?? null, metaDescription ?? null, focusKeyword ?? null,
      labels ? JSON.stringify(labels) : null, post.id);
  res.json(db.prepare(`SELECT ${postCols} FROM posts WHERE id = ?`).get(post.id));
});

router.delete('/posts/:id', requireAuth, (req, res) => {
  const post = getPost(req, res);
  if (!post) return;
  db.prepare('DELETE FROM posts WHERE id = ?').run(post.id);
  res.json({ ok: true });
});

// --- SEO analysis (live editor sidebar + server-side snapshot) ---------
router.post('/seo/analyze', requireAuth, (req, res) => {
  const { title, html, metaDescription, focusKeyword, blogId } = req.body || {};
  const siteUrl = blogId ? blogUrlFor(req.user.id, String(blogId)) : '';
  res.json(analyzePost({ title, html, metaDescription, focusKeyword, siteUrl }));
});

// --- Image pipeline ----------------------------------------------------
router.post('/images', requireAuth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'image file required' });
    if (!/^image\//.test(req.file.mimetype)) return res.status(400).json({ error: 'not an image' });
    const alt = String((req.body && req.body.alt) || '');
    const result = await processImage({ buffer: req.file.buffer, originalName: req.file.originalname, alt, userId: req.user.id });
    db.prepare('INSERT INTO images (id, user_id, original_name, mime_in, bytes_in, alt, variants_json) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(result.id, req.user.id, req.file.originalname, req.file.mimetype, result.bytesIn, alt, JSON.stringify(result.variants));
    res.status(201).json({ id: result.id, alt, bytesIn: result.bytesIn, variants: result.variants, html: result.html });
  } catch (err) {
    res.status(500).json({ error: 'image_pipeline_error', message: err.message });
  }
});

// --- Publish / draft / schedule ---------------------------------------
// mode: 'publish' (now) | 'draft' (Blogger draft) | 'schedule' (future timestamp)
router.post('/posts/:id/publish', requireAuth, async (req, res) => {
  const post = getPost(req, res);
  if (!post) return;
  const { mode = 'publish', scheduledAt } = req.body || {};
  if (mode === 'schedule' && !scheduledAt) return res.status(400).json({ error: 'scheduledAt required for schedule mode' });
  if (mode === 'schedule' && !(new Date(scheduledAt) > new Date())) return res.status(400).json({ error: 'scheduledAt must be in the future' });

  const analysis = analyzePost({
    title: post.title, html: post.html, metaDescription: post.metaDescription,
    focusKeyword: post.focusKeyword, siteUrl: blogUrlFor(req.user.id, post.blogId),
  });

  const { payload, finalHtml, canonicalUrl } = composePostPayload({
    blogId: post.blogId,
    blogUrl: blogUrlFor(req.user.id, post.blogId),
    title: post.title,
    html: post.html,
    metaDescription: post.metaDescription,
    labels: JSON.parse(post.labels || '[]'),
    authorName: req.user.name,
    blogName: (db.prepare('SELECT name FROM blogs WHERE id = ? AND user_id = ?').get(post.blogId, req.user.id) || {}).name,
    canonicalUrl: post.publishedUrl,
    isDraft: mode === 'draft',
    scheduledAtIso: mode === 'schedule' ? new Date(scheduledAt).toISOString() : undefined,
  });

  // Safety gate: with the real provider, only actually call Blogger when PUBLISH_MODE=live.
  const willCallLive = provider.isGoogle() && config.livePublishingEnabled;
  const dryRun = provider.isGoogle() && !config.livePublishingEnabled;

  try {
    let result;
    if (dryRun) {
      result = { dryRun: true, reason: 'PUBLISH_MODE is not "live" - payload built and validated, nothing sent to Blogger.', payload };
    } else {
      result = await provider.insertPost(req.user, post.blogId, payload, saveTokens(req.user.id));
    }

    const newStatus = dryRun ? 'live_dry_run' : mode === 'draft' ? 'draft' : mode === 'schedule' ? 'scheduled' : 'published';
    db.prepare(`UPDATE posts SET status = ?, blogger_post_id = COALESCE(?, blogger_post_id),
      published_url = COALESCE(?, published_url), scheduled_at = ?, seo_json = ?, last_payload_json = ?, updated_at = datetime('now')
      WHERE id = ?`)
      .run(newStatus, result.id || null, result.url || null,
        mode === 'schedule' ? new Date(scheduledAt).toISOString() : null,
        JSON.stringify(analysis), JSON.stringify({ payload, canonicalUrl, result }), post.id);

    res.json({ ok: true, mode, dryRun, status: newStatus, result, canonicalUrl, seo: analysis });
  } catch (err) {
    res.status(502).json({ error: 'publish_failed', message: err.message });
  }
});

// --- Template library (Phase 2 drop-in: XML files + manifest.json) ----------
router.get('/templates', requireAuth, (req, res) => {
  const dir = path.join(config.paths.root, 'templates');
  let manifest = [];
  try { manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')); } catch { /* empty library */ }
  const items = (Array.isArray(manifest) ? manifest : []).map((t) => ({
    ...t,
    downloadUrl: `/templates/${encodeURIComponent(t.file)}`,
    available: fs.existsSync(path.join(dir, t.file)),
  }));
  res.json({ items, installGuideUrl: '/templates/INSTALL.md' });
});

// --- Keyword ideas (Phase 3 seam: server/keywords/provider.js) ---------------
router.get('/keywords/suggest', requireAuth, async (req, res) => {
  try {
    const seed = String(req.query.q || '').trim();
    if (!seed) return res.json({ seed, suggestions: [] });
    const suggestions = await suggestKeywords(seed);
    res.json({ seed, suggestions: suggestions.slice(0, 30) });
  } catch (err) {
    res.status(502).json({ error: 'keyword_provider_error', message: err.message });
  }
});

// Deep keyword research: scored long-tail opportunities (slower, wide fan-out).
router.get('/keywords/research', requireAuth, async (req, res) => {
  try {
    const seed = String(req.query.q || '').trim();
    if (!seed) return res.json({ seed, results: [] });
    const results = await researchKeywords(seed);
    res.json({ seed, results: results.slice(0, 50) });
  } catch (err) {
    res.status(502).json({ error: 'keyword_provider_error', message: err.message });
  }
});

// --- Internal link suggestions (Phase 2 seam: Blogger post-list API) ---------
router.post('/links/suggest', requireAuth, async (req, res) => {
  try {
    const { blogId, html } = req.body || {};
    if (!blogId) return res.status(400).json({ error: 'blogId required' });
    const data = await provider.listPosts(req.user, String(blogId), saveTokens(req.user.id));
    const posts = (data.items || []).map((p) => ({ title: p.title || '', url: p.url || '' }));
    res.json({ suggestions: suggestInternalLinks({ html: html || '', posts }) });
  } catch (err) {
    res.status(502).json({ error: 'blogger_api_error', message: err.message });
  }
});

// Inspect the exact payload that would be / was sent to Blogger (review + audit).
router.get('/posts/:id/payload', requireAuth, (req, res) => {
  const row = db.prepare('SELECT last_payload_json FROM posts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'post_not_found' });
  res.json(row.last_payload_json ? JSON.parse(row.last_payload_json) : null);
});

module.exports = router;
