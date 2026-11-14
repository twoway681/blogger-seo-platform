'use strict';
// Offline fake Search Console: mirrors the real provider's behavior for demo mode
// and tests. Verification always succeeds; sitemaps are accepted.
//
// Honesty model (matches Google's real constraints):
// - No API call requests indexing. Sitemap submission is recorded as a *hint*.
// - Index status is only ever an OBSERVED value. This fake simulates Google's
//   observed progression after a sitemap hint: a URL under a hinted site is first
//   "Discovered - currently not indexed", and a later inspection observes it as
//   "Submitted and indexed". Without any sitemap hint, URLs stay unknown.

const sitemapHints = new Map(); // siteUrl -> last sitemap submission time (hint only)
const observed = new Map();     // url -> { stage: 'discovered' | 'indexed', at }

function addSite(siteUrl) {
  return { siteUrl, permissionLevel: 'siteOwner' };
}

function getSite(siteUrl) {
  return { siteUrl, permissionLevel: 'siteOwner' };
}

function submitSitemap(siteUrl, sitemapUrl) {
  const at = new Date().toISOString();
  sitemapHints.set(siteUrl, at);
  return { path: sitemapUrl, lastSubmitted: at, isPending: false, warnings: 0, errors: 0 };
}

function listSitemaps(siteUrl) {
  return { sitemap: [{ path: `${siteUrl.replace(/\/$/, '')}/sitemap.xml`, lastSubmitted: sitemapHints.get(siteUrl) || null, warnings: 0, errors: 0 }] };
}

// Read-only observation. There is intentionally no submit/request-indexing flag:
// the real URL Inspection API has none either.
function inspectUrl(siteUrl, url) {
  // Like Google, the inspected URL must belong to the verified property.
  if (!String(url).startsWith(siteUrl)) {
    const err = new Error('Search Console API POST https://searchconsole.googleapis.com/v1/urlInspection/index:inspect failed: Permission denied. Failed to verify the URL ownership.');
    err.status = 403;
    throw err;
  }
  const hinted = sitemapHints.has(siteUrl);
  let state;
  if (!hinted) {
    state = { coverageState: 'URL is unknown to Google', pageFetchState: 'SUCCESSFUL', indexingState: 'INDEXING_ALLOWED' };
  } else if (!observed.has(url)) {
    observed.set(url, { stage: 'discovered', at: new Date().toISOString() });
    state = { coverageState: 'Discovered - currently not indexed', pageFetchState: 'SUCCESSFUL', indexingState: 'INDEXING_ALLOWED' };
  } else {
    const rec = observed.get(url);
    if (rec.stage === 'discovered') { rec.stage = 'indexed'; rec.at = new Date().toISOString(); observed.set(url, rec); }
    state = { coverageState: 'Submitted and indexed', lastCrawlTime: rec.at, pageFetchState: 'SUCCESSFUL', indexingState: 'INDEXING_ALLOWED' };
  }
  return { inspectionResult: { indexStatusResult: state } };
}

module.exports = { addSite, getSite, submitSitemap, listSitemaps, inspectUrl };
