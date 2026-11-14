'use strict';
// Real Google Search Console API client (webmasters v3 + URL Inspection API).
// Plain fetch, mirrors server/blogger/googleClient.js.

async function sc(token, method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return {};
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data && data.error && data.error.message ? data.error.message : `HTTP ${res.status}`;
    const err = new Error(`Search Console API ${method} ${url} failed: ${msg}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const SITES = 'https://www.googleapis.com/webmasters/v3/sites';
const INSPECTION = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';

module.exports = {
  // Add (and for Blogger blogs on the same Google account, usually auto-verify) a property.
  addSite: (token, siteUrl) => sc(token, 'PUT', `${SITES}/${encodeURIComponent(siteUrl)}`),
  getSite: (token, siteUrl) => sc(token, 'GET', `${SITES}/${encodeURIComponent(siteUrl)}`),
  submitSitemap: (token, siteUrl, sitemapUrl) =>
    sc(token, 'PUT', `${SITES}/${encodeURIComponent(siteUrl)}/sitemaps/${encodeURIComponent(sitemapUrl)}`),
  listSitemaps: (token, siteUrl) => sc(token, 'GET', `${SITES}/${encodeURIComponent(siteUrl)}/sitemaps`),
  // Read-only index-status observation. No indexing-request endpoint is called
  // anywhere in this client: the Indexing API is JobPosting/BroadcastEvent-only.
  inspectUrl: (token, siteUrl, url) =>
    sc(token, 'POST', INSPECTION, { inspectionUrl: url, siteUrl }),
  // Search Analytics API: observed clicks/impressions per page. Fully supported,
  // read-only reporting data (no action claims).
  queryPerformance: (token, siteUrl, { startDate, endDate } = {}) =>
    sc(token, 'POST', `${SITES}/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
      startDate, endDate, dimensions: ['page'], rowLimit: 100,
    }),
};
