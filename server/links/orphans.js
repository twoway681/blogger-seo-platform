'use strict';
// Orphan-post detection: builds the internal link graph across a blog's posts
// and finds published posts that no other post links to. Orphans rank poorly
// because crawlers rarely reach them and readers never stumble onto them.
// Pure functions; the route layer assembles the post list.

/**
 * normalizeUrl(url) - collapse the variants Blogger serves the same post under:
 * trailing slash, ?m=1 mobile mirror, http/https, www, and the .html case.
 */
function normalizeUrl(url) {
  let u = String(url || '').trim();
  if (!u) return '';
  u = u.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  u = u.replace(/[?#].*$/, '');          // drop ?m=1, ?utm_..., #fragments
  u = u.replace(/\/+$/, '');             // trailing slashes
  return u.toLowerCase();
}

function extractHrefs(html) {
  const out = [];
  const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(String(html || ''))) !== null) out.push(m[1]);
  return out;
}

/**
 * findOrphans({ posts })
 * posts: [{ id?, title, url, content?/html?, published? }]
 * -> { total, orphans: [{title, url}], linked: [{title, url, inbound}],
 *     inboundCounts: { normalizedUrl: n } }
 * A post counts as linked when ANY OTHER post's body links to its URL.
 * Self-links never rescue a post from orphan status.
 */
function findOrphans({ posts = [] } = {}) {
  const known = new Map(); // normalized url -> post
  for (const p of posts) {
    const key = normalizeUrl(p.url);
    if (!key) continue;
    if (!known.has(key)) known.set(key, p);
  }

  const inbound = new Map([...known.keys()].map((k) => [k, 0]));
  for (const p of posts) {
    const selfKey = normalizeUrl(p.url);
    const body = p.content || p.html || '';
    const seenHere = new Set(); // count each target once per source post
    for (const href of extractHrefs(body)) {
      const key = normalizeUrl(href);
      if (!key || key === selfKey || seenHere.has(key)) continue;
      if (inbound.has(key)) {
        inbound.set(key, inbound.get(key) + 1);
        seenHere.add(key);
      }
    }
  }

  const orphans = [];
  const linked = [];
  for (const [key, post] of known) {
    const n = inbound.get(key) || 0;
    const row = { title: post.title || '(untitled)', url: post.url, inbound: n };
    if (n === 0) orphans.push(row);
    else linked.push(row);
  }
  orphans.sort((a, b) => String(a.title).localeCompare(String(b.title)));
  linked.sort((a, b) => a.inbound - b.inbound);
  return { total: known.size, orphans, linked, inboundCounts: Object.fromEntries(inbound) };
}

module.exports = { findOrphans, normalizeUrl };
