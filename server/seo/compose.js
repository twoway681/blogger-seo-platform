'use strict';
// Compose the final Blogger API v3 post payload:
// sanitized semantic HTML + responsive <img> normalization + JSON-LD Article schema
// + canonical tag. Pure functions so tests can assert the exact payload.

const { buildArticleSchema, schemaScriptTag } = require('./schema');

// Minimal HTML sanitizer for editor output: keep a semantic allowlist, strip scripts,
// event handlers and javascript: URLs. The editor (TipTap) already outputs clean HTML;
// this is the server-side guarantee.
const ALLOWED_TAGS = new Set(['p', 'h2', 'h3', 'h4', 'blockquote', 'ul', 'ol', 'li', 'a', 'img', 'strong', 'em', 'b', 'i', 'u', 's', 'code', 'pre', 'br', 'hr', 'figure', 'figcaption', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span']);

function sanitizeHtml(html) {
  let out = String(html || '');
  // H1 demotion first: post title is the H1 on Blogger; body H1s become H2s.
  out = out.replace(/<(\/?)h1\b/gi, '<$1h2');
  // Drop script/style/iframe/object/embed blocks entirely.
  out = out.replace(/<(script|style|iframe|object|embed|form|link|meta)\b[\s\S]*?<\/\1>/gi, '');
  out = out.replace(/<(script|style|iframe|object|embed|form|link|meta)\b[^>]*\/?>/gi, '');
  // Remove on* event handler attributes.
  out = out.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  // Neutralize javascript: URLs.
  out = out.replace(/(href|src)\s*=\s*(["']?)\s*javascript:[^"'>\s]*\2/gi, '$1="#"');
  // Drop tags outside the allowlist but keep their text content.
  out = out.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (match, tag) => {
    return ALLOWED_TAGS.has(tag.toLowerCase()) ? match : '';
  });
  return out.trim();
}

// Ensure every <img> is responsive + lazy. Images inserted via the uploader already
// carry srcset; this normalizes anything pasted from elsewhere.
function normalizeImages(html) {
  return String(html || '').replace(/<img\b[^>]*>/gi, (tag) => {
    let t = tag;
    if (!/\bloading\s*=/i.test(t)) t = t.replace(/\/?>$/, ' loading="lazy"$&');
    if (!/\bdecoding\s*=/i.test(t)) t = t.replace(/\/?>$/, ' decoding="async"$&');
    if (!/\bstyle\s*=/i.test(t)) t = t.replace(/\/?>$/, ' style="max-width:100%;height:auto;"$&');
    return t;
  });
}

function resolveCanonical({ blogUrl, publishedUrl }) {
  if (publishedUrl) return publishedUrl;
  // Placeholder canonical for drafts: the real Blogger URL replaces it on publish.
  return blogUrl || '';
}

/**
 * composePostPayload({
 *   blogId, blogUrl, title, html, metaDescription, labels,
 *   authorName, blogName, canonicalUrl, publishedIso, isDraft, scheduledAtIso
 * })
 * -> { payload, finalHtml, canonicalUrl, schema }
 */
function composePostPayload({ blogId, blogUrl, title, html, metaDescription, labels = [], authorName, blogName, canonicalUrl, publishedIso, isDraft = false, scheduledAtIso } = {}) {
  const now = new Date().toISOString();
  const canonical = resolveCanonical({ blogUrl, publishedUrl: canonicalUrl });
  const cleanHtml = normalizeImages(sanitizeHtml(html));

  const schema = buildArticleSchema({
    title, html: cleanHtml, metaDescription, canonicalUrl: canonical, authorName, blogName,
    datePublished: publishedIso || scheduledAtIso || now, dateModified: now,
  });

  // JSON-LD goes first so it survives even if a theme truncates the body.
  // NOTE: Blogger templates emit their own <link rel="canonical"> in <head> pointing at
  // the post URL, which fixes the ?m=1 mobile duplication for standard themes. We also
  // embed a canonical <link> in the body as a belt-and-braces hint for themes that don't;
  // Google primarily honors the head tag + sitemap. Documented in README.
  const canonicalLink = canonical ? `<link rel="canonical" href="${escapeAttr(canonical)}" />` : '';
  const finalHtml = `${schemaScriptTag(schema)}${canonicalLink}\n${cleanHtml}`;

  const payload = {
    kind: 'blogger#post',
    blog: { id: String(blogId || '') },
    title: String(title || '').trim(),
    content: finalHtml,
  };
  if (Array.isArray(labels) && labels.length) payload.labels = labels.map((l) => String(l).trim()).filter(Boolean);
  if (isDraft) payload.isDraft = true;
  if (scheduledAtIso) payload.published = scheduledAtIso; // Blogger schedules future-dated posts.

  return { payload, finalHtml, canonicalUrl: canonical, schema };
}

function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

module.exports = { composePostPayload, sanitizeHtml, normalizeImages };
