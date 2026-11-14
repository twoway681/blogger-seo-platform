'use strict';
// Real-time on-page SEO checklist engine (pure functions, no I/O).
// Drives the live sidebar in the editor. Each check returns pass | warn | fail.

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

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function keywordTokens(keyword) {
  return words(keyword).filter((w) => !STOPWORDS.has(w));
}

const STOPWORDS = new Set(('a,an,the,and,or,but,if,then,else,for,to,of,in,on,at,by,with,from,as,is,are,was,were,be,been,it,its,this,that,these,those,you,your,i,we,they,he,she,how,what,why,when,where,which,who,can,will,do,does,did,not,no,so,my,our,their,his,her,me,him,us,them,about,into,over,after,before,between,through,during,without,within,along,among,per,via,vs').split(','));

function countKeywordOccurrences(text, keyword) {
  const kw = String(keyword || '').trim().toLowerCase();
  if (!kw) return 0;
  const hay = ` ${String(text || '').toLowerCase()} `;
  const needle = kw.replace(/\s+/g, '\\s+');
  const re = new RegExp(`(^|[^a-z0-9])${escapeRegExp(needle)}([^a-z0-9]|$)`, 'g');
  const m = hay.match(re);
  return m ? m.length : 0;
}

function extractTags(html, tag) {
  const out = [];
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  let m;
  while ((m = re.exec(html)) !== null) out.push(stripHtml(m[1]));
  return out;
}

function extractImages(html) {
  const imgs = [];
  const re = /<img\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const tag = m[0];
    const attr = (name) => {
      const a = tag.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i')) || tag.match(new RegExp(`${name}\\s*=\\s*'([^']*)'`, 'i'));
      return a ? a[1] : null;
    };
    imgs.push({ src: attr('src') || '', alt: attr('alt'), hasLazy: /loading\s*=\s*["']lazy["']/i.test(tag), hasSrcset: /\bsrcset\s*=/i.test(tag) });
  }
  return imgs;
}

function extractLinks(html, siteHost) {
  const links = { internal: 0, external: 0, anchors: [] };
  const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    const anchor = stripHtml(m[2]);
    links.anchors.push({ href, anchor });
    if (href.startsWith('/') || (siteHost && href.includes(siteHost))) links.internal += 1;
    else if (/^https?:\/\//i.test(href)) links.external += 1;
  }
  return links;
}

// Simple Flesch Reading Ease over the stripped body text.
function flesch(text) {
  const sentences = Math.max(1, (String(text).match(/[.!?]+(\s|$)/g) || [1]).length);
  const w = words(text);
  const syllables = w.reduce((acc, word) => acc + countSyllables(word), 0);
  if (w.length === 0) return 0;
  return 206.835 - 1.015 * (w.length / sentences) - 84.6 * (syllables / w.length);
}

function countSyllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const groups = w.replace(/e$/, '').match(/[aeiouy]+/g);
  return Math.max(1, groups ? groups.length : 1);
}

function grade(status) {
  return status; // 'pass' | 'warn' | 'fail'
}

/**
 * analyzePost({ title, html, metaDescription, focusKeyword, siteUrl })
 * Returns { score: 0..100, checks: [{id, label, status, detail}] }
 */
function analyzePost({ title = '', html = '', metaDescription = '', focusKeyword = '', siteUrl = '' } = {}) {
  const text = stripHtml(html);
  const wordList = words(text);
  const wordCount = wordList.length;
  const kw = String(focusKeyword || '').trim();
  const kwLower = kw.toLowerCase();
  const siteHost = (siteUrl.match(/^https?:\/\/([^/]+)/i) || [])[1] || '';
  const h1s = extractTags(html, 'h1');
  const h2s = extractTags(html, 'h2');
  const h3s = extractTags(html, 'h3');
  const headingsAll = extractTags(html, 'h2').concat(extractTags(html, 'h3'), extractTags(html, 'h4'));
  const images = extractImages(html);
  const links = extractLinks(html, siteHost);
  const occurrences = countKeywordOccurrences(text, kw);
  const density = kw && wordCount ? (occurrences * (keywordTokens(kw).length || 1)) / wordCount * 100 : 0;

  const checks = [];
  const add = (id, label, status, detail) => checks.push({ id, label, status: grade(status), detail });

  // 1. Title length (Google displays ~50-60 chars)
  const tl = title.trim().length;
  add('title-length', 'Title length', tl === 0 ? 'fail' : tl < 30 ? 'warn' : tl <= 60 ? 'pass' : tl <= 70 ? 'warn' : 'fail',
    tl === 0 ? 'Add a title.' : `${tl} characters (aim for 50-60).`);

  // 2. Focus keyword present
  add('focus-keyword', 'Focus keyword set', kw ? 'pass' : 'fail', kw ? `Targeting "${kw}".` : 'Set a focus keyword to check placement and density.');

  if (kw) {
    add('kw-title', 'Keyword in title', title.toLowerCase().includes(kwLower) ? 'pass' : 'fail',
      title.toLowerCase().includes(kwLower) ? 'Keyword appears in the title.' : 'Include the exact focus keyword in the title.');
    const firstPara = stripHtml((html.match(/<p[^>]*>[\s\S]*?<\/p>/i) || [''])[0]);
    add('kw-intro', 'Keyword in first paragraph', firstPara.toLowerCase().includes(kwLower) ? 'pass' : 'warn',
      firstPara.toLowerCase().includes(kwLower) ? 'Keyword appears in the opening paragraph.' : 'Work the keyword into the first paragraph.');
    add('kw-heading', 'Keyword in a subheading', headingsAll.some((h) => h.toLowerCase().includes(kwLower)) ? 'pass' : 'warn',
      headingsAll.some((h) => h.toLowerCase().includes(kwLower)) ? 'Keyword found in an H2/H3.' : 'Use the keyword in at least one H2 or H3.');
    add('kw-meta', 'Keyword in search description', metaDescription.toLowerCase().includes(kwLower) ? 'pass' : 'warn',
      metaDescription.toLowerCase().includes(kwLower) ? 'Keyword is in the search description.' : 'Add the keyword to the search description.');
    add('kw-density', 'Keyword density', !wordCount ? 'fail' : density < 0.3 ? 'warn' : density <= 2.5 ? 'pass' : 'warn',
      !wordCount ? 'No body text yet.' : `${density.toFixed(2)}% (${occurrences} exact-match occurrence${occurrences === 1 ? '' : 's'}; aim for 0.5-2.5%).`);
  }

  // 3. Search description (meta description) length
  const ml = metaDescription.trim().length;
  add('meta-length', 'Search description length', ml === 0 ? 'fail' : ml < 70 ? 'warn' : ml <= 160 ? 'pass' : 'warn',
    ml === 0 ? 'Add a search description - Blogger exposes it as the meta description.' : `${ml} characters (aim for 120-160).`);

  // 4. Word count
  add('word-count', 'Content length', wordCount >= 800 ? 'pass' : wordCount >= 300 ? 'warn' : 'fail',
    `${wordCount} words (thin posts under 300 rarely rank; 800+ is competitive).`);

  // 5. Heading structure
  add('h1-count', 'Single H1 only', h1s.length === 0 ? 'pass' : 'warn',
    h1s.length === 0 ? 'No H1 in body - Blogger renders the post title as the H1.' : `${h1s.length} H1 tag(s) in the body; the title is already the H1, use H2/H3 instead.`);
  add('h2-usage', 'H2 subheadings', h2s.length >= 2 ? 'pass' : h2s.length === 1 ? 'warn' : 'fail',
    h2s.length ? `${h2s.length} H2 heading(s) break the post into scannable sections.` : 'Add H2 subheadings - both readers and crawlers rely on them.');

  // 6. Images
  if (images.length === 0) {
    add('images', 'Images', 'warn', 'No images yet - posts with at least one image earn more clicks.');
  } else {
    const missingAlt = images.filter((i) => !i.alt || !i.alt.trim());
    add('img-alt', 'Image alt text', missingAlt.length === 0 ? 'pass' : 'fail',
      missingAlt.length === 0 ? `All ${images.length} image(s) have alt text.` : `${missingAlt.length}/${images.length} image(s) missing alt text.`);
    add('img-responsive', 'Responsive, lazy-loaded images', images.every((i) => i.hasLazy && i.hasSrcset) ? 'pass' : 'warn',
      images.every((i) => i.hasLazy && i.hasSrcset) ? 'All images use srcset + lazy loading.' : 'Some images lack srcset/lazy - re-insert them through the uploader.');
  }

  // 7. Links
  add('internal-links', 'Internal links', links.internal >= 1 ? 'pass' : 'warn',
    links.internal >= 1 ? `${links.internal} internal link(s) keep crawlers moving through the blog.` : 'Link to at least one older post - orphaned posts rank poorly.');
  add('external-links', 'External links', links.external >= 1 ? 'pass' : 'warn',
    links.external >= 1 ? `${links.external} external link(s) to supporting sources.` : 'Link out to at least one authoritative source.');

  // 8. Readability
  const fr = flesch(text);
  add('readability', 'Readability', !wordCount ? 'fail' : fr >= 60 ? 'pass' : fr >= 40 ? 'warn' : 'fail',
    !wordCount ? 'No body text yet.' : `Flesch score ${fr.toFixed(0)} (60+ reads easily for beginners).`);

  // Score: fail=0, warn=0.5, pass=1 weighted equally.
  const weight = { pass: 1, warn: 0.5, fail: 0 };
  const score = Math.round((checks.reduce((a, c) => a + weight[c.status], 0) / checks.length) * 100);

  return {
    score,
    checks,
    stats: { wordCount, images: images.length, internalLinks: links.internal, externalLinks: links.external, keywordDensity: density, flesch: Math.round(fr) },
  };
}

module.exports = { analyzePost, stripHtml, countKeywordOccurrences, flesch };
