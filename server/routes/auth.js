'use strict';
const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const config = require('../config');
const provider = require('../blogger/provider');

const router = express.Router();
const SESSION_COOKIE = 'sid';
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
}

function createSession(userId) {
  const id = newId('sess');
  db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(id, userId, Date.now() + SESSION_TTL_MS);
  return id;
}

function setSessionCookie(res, sid) {
  res.cookie(SESSION_COOKIE, sid, { httpOnly: true, sameSite: 'lax', secure: config.baseUrl.startsWith('https:'), maxAge: SESSION_TTL_MS });
}

function currentUser(req) {
  const sid = req.cookies && req.cookies[SESSION_COOKIE];
  if (!sid) return null;
  const row = db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ?').get(sid, Date.now());
  return row || null;
}

function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'not_authenticated' });
  req.user = user;
  next();
}

function saveTokens(userId) {
  return (accessToken, expiresAt) => {
    db.prepare('UPDATE users SET google_access_token = ?, google_access_token_expires_at = ? WHERE id = ?').run(accessToken, expiresAt, userId);
  };
}

// Start OAuth (real Google consent screen, or instant fake round-trip in demo mode).
router.get('/google', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  db.prepare('INSERT INTO oauth_states (state, created_at) VALUES (?, ?)').run(state, Date.now());
  res.redirect(provider.authUrl(state));
});

router.get('/google/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;
    if (error) return res.status(400).send(`OAuth error: ${error}`);
    if (!code || !state) return res.status(400).send('Missing code/state');
    const st = db.prepare('SELECT state, created_at FROM oauth_states WHERE state = ?').get(state);
    if (!st || Date.now() - st.created_at > 10 * 60 * 1000) return res.status(400).send('Invalid or expired state');
    db.prepare('DELETE FROM oauth_states WHERE state = ?').run(state);

    const tokens = await provider.exchangeCode(code);
    const profile = await provider.userinfo(tokens.access_token);

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(profile.email);
    const userId = existing ? existing.id : newId('user');
    if (existing) {
      db.prepare(`UPDATE users SET name = ?, picture = ?, provider = ?,
        google_refresh_token = COALESCE(?, google_refresh_token),
        google_access_token = ?, google_access_token_expires_at = ? WHERE id = ?`)
        .run(profile.name, profile.picture || '', config.effectiveProvider,
          tokens.refresh_token || null, tokens.access_token, Date.now() + tokens.expires_in * 1000, userId);
    } else {
      db.prepare(`INSERT INTO users (id, email, name, picture, provider, google_refresh_token, google_access_token, google_access_token_expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(userId, profile.email, profile.name, profile.picture || '', config.effectiveProvider,
          tokens.refresh_token || null, tokens.access_token, Date.now() + tokens.expires_in * 1000);
    }
    setSessionCookie(res, createSession(userId));
    res.redirect('/');
  } catch (err) {
    res.status(500).send(`Sign-in failed: ${err.message}`);
  }
});

router.post('/logout', (req, res) => {
  const sid = req.cookies && req.cookies[SESSION_COOKIE];
  if (sid) db.prepare('DELETE FROM sessions WHERE id = ?').run(sid);
  res.clearCookie(SESSION_COOKIE);
  res.json({ ok: true });
});

module.exports = { router, requireAuth, currentUser, saveTokens, newId };
