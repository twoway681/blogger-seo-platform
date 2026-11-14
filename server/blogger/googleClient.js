'use strict';
// Real Google OAuth 2.0 + Blogger API v3 client, implemented with plain fetch
// (Node 22 global fetch) to keep dependencies minimal and auditable.

const config = require('../config');

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const BLOGGER = 'https://www.googleapis.com/blogger/v3';

function authUrl(state) {
  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: config.google.redirectUri,
    response_type: 'code',
    scope: config.google.scopes.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `${AUTH_URL}?${params}`;
}

async function exchangeCode(code) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      redirect_uri: config.google.redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`token exchange failed: ${data.error || res.status} ${data.error_description || ''}`);
  return data; // { access_token, expires_in, refresh_token, id_token, scope }
}

async function refreshAccessToken(refreshToken) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`token refresh failed: ${data.error || res.status}`);
  return data; // { access_token, expires_in }
}

async function userinfo(accessToken) {
  const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`userinfo failed: ${res.status}`);
  return data; // { sub, email, name, picture }
}

async function blogger(accessToken, method, p, body) {
  const res = await fetch(`${BLOGGER}${p}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data && data.error && data.error.message ? data.error.message : `HTTP ${res.status}`;
    throw new Error(`Blogger API ${method} ${p} failed: ${msg}`);
  }
  return data;
}

// Ensure a fresh access token for a user row; persists refreshed tokens via saveTokens.
async function withFreshToken(user, saveTokens, fn) {
  let accessToken = user.google_access_token;
  const expiresAt = user.google_access_token_expires_at || 0;
  if (!accessToken || Date.now() > expiresAt - 60_000) {
    if (!user.google_refresh_token) throw new Error('No Google refresh token - reconnect the account.');
    const refreshed = await refreshAccessToken(user.google_refresh_token);
    accessToken = refreshed.access_token;
    await saveTokens(accessToken, Date.now() + refreshed.expires_in * 1000);
  }
  return fn(accessToken);
}

const api = {
  authUrl,
  exchangeCode,
  userinfo,
  withFreshToken,
  listBlogs: (token) => blogger(token, 'GET', '/users/self/blogs'),
  getBlog: (token, blogId) => blogger(token, 'GET', `/blogs/${blogId}`),
  insertPost: (token, blogId, payload, { isDraft } = {}) =>
    blogger(token, 'POST', `/blogs/${blogId}/posts/${isDraft ? '?isDraft=true' : ''}`, payload),
  // Scheduling is native to Blogger: publish a DRAFT with publishDate in the future
  // (https://developers.google.com/blogger/docs/3.0/reference/posts/publish).
  publishPost: (token, blogId, postId, publishDate) =>
    blogger(token, 'POST', `/blogs/${blogId}/posts/${postId}/publish${publishDate ? `?publishDate=${encodeURIComponent(publishDate)}` : ''}`),
  updatePost: (token, blogId, postId, payload) => blogger(token, 'PATCH', `/blogs/${blogId}/posts/${postId}`, payload),
  deletePost: (token, blogId, postId) => blogger(token, 'DELETE', `/blogs/${blogId}/posts/${postId}`),
  listPosts: (token, blogId) => blogger(token, 'GET', `/blogs/${blogId}/posts?maxResults=50`),
};

module.exports = api;
