'use strict';
// Shared text helpers for the SEO analyzer and the writing lint.

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function words(text) {
  const m = String(text || '').toLowerCase().match(/[a-z0-9']+/g);
  return m || [];
}

module.exports = { stripHtml, words };
