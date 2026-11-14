'use strict';
// Offline fake Search Console: mirrors the real provider's behavior for demo mode
// and tests. Verification always succeeds; sitemaps are accepted; a URL starts
// "unknown to Google" and becomes "submitted" once an indexing ping is requested.

const indexed = new Map(); // url -> { status, crawledAt }

function addSite(siteUrl) {
  return { siteUrl, permissionLevel: 'siteOwner' };
}

function getSite(siteUrl) {
  return { siteUrl, permissionLevel: 'siteOwner' };
}

function submitSitemap(siteUrl, sitemapUrl) {
  return { path: sitemapUrl, lastSubmitted: new Date().toISOString(), isPending: false, warnings: 0, errors: 0 };
}

function listSitemaps(siteUrl) {
  return { sitemap: [{ path: `${siteUrl.replace(/\/$/, '')}/sitemap.xml`, lastSubmitted: new Date().toISOString(), warnings: 0, errors: 0 }] };
}

function inspectUrl(siteUrl, url, { submit = false } = {}) {
  if (submit) {
    indexed.set(url, { status: 'SUBMITTED', at: new Date().toISOString() });
  }
  const known = indexed.get(url);
  return {
    inspectionResult: {
      indexStatusResult: known
        ? { coverageState: 'Submitted and indexed', lastCrawlTime: known.at, pageFetchState: 'SUCCESSFUL', indexingState: 'INDEXING_ALLOWED' }
        : { coverageState: 'URL is unknown to Google', pageFetchState: 'SUCCESSFUL', indexingState: 'INDEXING_ALLOWED' },
    },
  };
}

module.exports = { addSite, getSite, submitSitemap, listSitemaps, inspectUrl };
