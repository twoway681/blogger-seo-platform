'use strict';
// Storage: node:sqlite (built into Node 22) so the MVP runs with zero external services.
// Production equivalent per blueprint: PostgreSQL via Supabase or Neon (both free tier).
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');

fs.mkdirSync(config.paths.data, { recursive: true });
const db = new DatabaseSync(path.join(config.paths.data, 'app.db'));

db.exec(`
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  name TEXT,
  picture TEXT,
  google_refresh_token TEXT,
  google_access_token TEXT,
  google_access_token_expires_at INTEGER,
  provider TEXT NOT NULL DEFAULT 'fake',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS blogs (
  id TEXT PRIMARY KEY,          -- provider blog id
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT,
  url TEXT,
  provider TEXT NOT NULL,
  raw_json TEXT,
  synced_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,          -- local id
  user_id TEXT NOT NULL REFERENCES users(id),
  blog_id TEXT NOT NULL,
  blogger_post_id TEXT,         -- set after publish
  title TEXT NOT NULL DEFAULT '',
  html TEXT NOT NULL DEFAULT '',
  meta_description TEXT NOT NULL DEFAULT '',
  focus_keyword TEXT NOT NULL DEFAULT '',
  labels TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft',   -- draft | scheduled | published | live_dry_run
  scheduled_at TEXT,
  published_url TEXT,
  seo_json TEXT,                -- last SEO analysis snapshot
  last_payload_json TEXT,       -- last composed Blogger payload (for review/audit)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS search_console (
  blog_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  site_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unverified',   -- unverified | verified | error
  permission_level TEXT,
  sitemap_url TEXT,
  sitemap_submitted_at TEXT,
  error TEXT,
  details_json TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS indexing (
  url TEXT PRIMARY KEY,
  blog_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  coverage_state TEXT,
  last_crawl_time TEXT,
  result_json TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  original_name TEXT,
  mime_in TEXT,
  bytes_in INTEGER,
  alt TEXT NOT NULL DEFAULT '',
  variants_json TEXT NOT NULL,  -- [{width, url, bytes, format}]
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

module.exports = db;
