'use strict';
// JSON-LD structured data builders (schema.org Article / BlogPosting).

function stripHtml(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function firstImageUrl(html) {
  const m = String(html || '').match(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i);
  return m ? m[1] : null;
}

/**
 * buildArticleSchema({ title, html, metaDescription, canonicalUrl, authorName, blogName, datePublished, dateModified })
 */
function buildArticleSchema({ title, html, metaDescription, canonicalUrl, authorName, blogName, datePublished, dateModified }) {
  const description = (metaDescription || stripHtml(html).slice(0, 160)).trim();
  const image = firstImageUrl(html);
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
    headline: String(title || '').slice(0, 110),
    description,
    author: { '@type': 'Person', name: authorName || 'Blog author' },
    publisher: { '@type': 'Organization', name: blogName || authorName || 'Blog' },
    datePublished,
    dateModified: dateModified || datePublished,
    wordCount: stripHtml(html).split(/\s+/).filter(Boolean).length,
  };
  if (image) schema.image = [image];
  return schema;
}

function schemaScriptTag(schema) {
  // Escape "</script>" inside JSON so the tag can never break out of itself.
  const json = JSON.stringify(schema, null, 0).replace(/</g, '\\u003c');
  return `<script type="application/ld+json">${json}</script>`;
}

module.exports = { buildArticleSchema, schemaScriptTag };
