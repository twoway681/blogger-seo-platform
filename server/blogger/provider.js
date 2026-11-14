'use strict';
// Provider switch: unified Blogger interface over the real Google client or the
// offline fake provider, chosen by config.effectiveProvider.

const config = require('../config');
const google = require('./googleClient');
const fake = require('./fakeProvider');

function isGoogle() {
  return config.effectiveProvider === 'google';
}

function authUrl(state) {
  return isGoogle() ? google.authUrl(state) : fake.fakeAuthUrl(state, config.baseUrl);
}

async function exchangeCode(code) {
  return isGoogle() ? google.exchangeCode(code) : fake.fakeExchangeCode(code);
}

async function userinfo(accessToken) {
  return isGoogle() ? google.userinfo(accessToken) : fake.fakeUserinfo();
}

async function listBlogs(user, saveTokens) {
  if (!isGoogle()) return { items: fake.demoBlogs() };
  return google.withFreshToken(user, saveTokens, (t) => google.listBlogs(t));
}

async function listPosts(user, blogId, saveTokens) {
  if (!isGoogle()) return fake.listPosts(blogId);
  return google.withFreshToken(user, saveTokens, (t) => google.listPosts(t, blogId));
}

async function insertPost(user, blogId, payload, saveTokens) {
  if (!isGoogle()) return fake.insertPost(blogId, payload);
  return google.withFreshToken(user, saveTokens, (t) => google.insertPost(t, blogId, payload, { isDraft: payload.isDraft }));
}

module.exports = { isGoogle, authUrl, exchangeCode, userinfo, listBlogs, listPosts, insertPost };
