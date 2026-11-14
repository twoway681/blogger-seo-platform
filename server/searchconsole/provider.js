'use strict';
// Search Console provider switch, same pattern as server/blogger/provider.js.
// Google mode rides the same OAuth session (webmasters scope); fake mode is offline.

const config = require('../config');
const googleSc = require('./googleClient');
const googleBlogger = require('../blogger/googleClient');
const fake = require('./fakeProvider');

function isGoogle() {
  return config.effectiveProvider === 'google';
}

function withToken(user, saveTokens, fn) {
  return googleBlogger.withFreshToken(user, saveTokens, fn);
}

async function addSite(user, siteUrl, saveTokens) {
  if (!isGoogle()) return fake.addSite(siteUrl);
  return withToken(user, saveTokens, (t) => googleSc.addSite(t, siteUrl));
}

async function getSite(user, siteUrl, saveTokens) {
  if (!isGoogle()) return fake.getSite(siteUrl);
  return withToken(user, saveTokens, (t) => googleSc.getSite(t, siteUrl));
}

async function submitSitemap(user, siteUrl, sitemapUrl, saveTokens) {
  if (!isGoogle()) return fake.submitSitemap(siteUrl, sitemapUrl);
  return withToken(user, saveTokens, (t) => googleSc.submitSitemap(t, siteUrl, sitemapUrl));
}

async function listSitemaps(user, siteUrl, saveTokens) {
  if (!isGoogle()) return fake.listSitemaps(siteUrl);
  return withToken(user, saveTokens, (t) => googleSc.listSitemaps(t, siteUrl));
}

async function inspectUrl(user, siteUrl, url, saveTokens, opts = {}) {
  if (!isGoogle()) return fake.inspectUrl(siteUrl, url, opts);
  return withToken(user, saveTokens, (t) => googleSc.inspectUrl(t, siteUrl, url));
}

module.exports = { isGoogle, addSite, getSite, submitSitemap, listSitemaps, inspectUrl };
