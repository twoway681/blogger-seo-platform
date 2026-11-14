'use strict';
// Monetization readiness kit: AdSense approval checklist, auto-generated legal
// pages (privacy / about / affiliate disclosure), affiliate-link detection and
// FTC disclosure helpers. Pure functions, no I/O - routes and tests drive them.

const { stripHtml } = require('../seo/analyzer');

// Common affiliate / referral link signatures. Kept conservative: a match here
// means the link almost certainly earns the blogger money and needs both
// rel="sponsored" and a visible FTC disclosure.
const AFFILIATE_PATTERNS = [
  /amzn\.to/i,
  /amazon\.[a-z.]+[/?#].*[?&]tag=/i,
  /flipkart\.[a-z.]+[/?#].*[?&]affid=/i,
  /shareasale\.com/i,
  /awin1\.com/i,
  /impact\.com|impactradius/i,
  /cj\.com|commission-junction/i,
  /rakutenmarketing|linksynergy\.com/i,
  /clickbank\.com|\.hop\.clickbank/i,
  /gumroad\.com|gum\.co\//i,
  /payhip\.com/i,
  /partnerize|prf\.hn/i,
  /[?&]aff(_?id|iliate)?=/i,
  /[?&]ref(=|erral=)/i,
];

function extractAnchors(html) {
  const out = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(String(html || ''))) !== null) {
    const attrs = m[1];
    const href = (attrs.match(/href\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
    const rel = (attrs.match(/rel\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
    out.push({ href, rel: rel.toLowerCase(), anchor: stripHtml(m[2]) });
  }
  return out;
}

function isAffiliateHref(href) {
  return AFFILIATE_PATTERNS.some((p) => p.test(href));
}

/**
 * findAffiliateLinks(html) -> [{ href, anchor, sponsored }]
 * sponsored = rel already contains "sponsored".
 */
function findAffiliateLinks(html) {
  return extractAnchors(html)
    .filter((a) => isAffiliateHref(a.href))
    .map((a) => ({ href: a.href, anchor: a.anchor, sponsored: /\bsponsored\b/.test(a.rel) }));
}

const DISCLOSURE_RE = /\b(affiliate|commission|sponsored|paid partnership|at no (extra )?cost|disclosure|i (may )?(earn|receive|get paid))\b/i;

/**
 * hasDisclosure(html) -> true when a visible disclosure appears in the first
 * ~120 words of the post (FTC: disclosure must be conspicuous and up front).
 */
function hasDisclosure(html) {
  const text = stripHtml(html);
  const firstChunk = text.split(/\s+/).slice(0, 120).join(' ');
  return DISCLOSURE_RE.test(firstChunk);
}

/**
 * disclosureBlock(blogName) -> HTML snippet for the top of a post.
 * Visible, plain-language, FTC-compliant.
 */
function disclosureBlock() {
  return '<p><em>Disclosure: some links in this post are affiliate links. '
    + 'If you buy through them, I may earn a small commission at no extra cost to you. '
    + 'I only recommend things I have used or would genuinely suggest to a friend.</em></p>';
}

/**
 * tagSponsoredLinks(html) -> { html, tagged }
 * Adds rel="sponsored noopener" to every affiliate link that lacks "sponsored".
 * Idempotent: already-tagged links are untouched.
 */
function tagSponsoredLinks(html) {
  let tagged = 0;
  const out = String(html || '').replace(/<a\b[^>]*>/gi, (tag) => {
    const href = (tag.match(/href\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
    if (!isAffiliateHref(href)) return tag;
    const relM = tag.match(/rel\s*=\s*["']([^"']*)["']/i);
    if (relM && /\bsponsored\b/.test(relM[1].toLowerCase())) return tag;
    tagged += 1;
    if (relM) {
      const merged = `${relM[1]} sponsored noopener`.trim();
      return tag.replace(relM[0], `rel="${merged}"`);
    }
    return tag.replace(/>$/, ' rel="sponsored noopener">');
  });
  return { html: out, tagged };
}

// --- Auto-generated legal pages --------------------------------------------
const PAGE_KINDS = ['privacy', 'about', 'disclosure'];

function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * generatePage(kind, { blogName, blogUrl, ownerName, email })
 * -> { title, html } ready to send to the Blogger pages.insert API.
 */
function generatePage(kind, { blogName = 'this blog', blogUrl = '', ownerName = '', email = '' } = {}) {
  if (!PAGE_KINDS.includes(kind)) throw new Error(`unknown page kind: ${kind}`);
  const name = escHtml(blogName);
  const url = escHtml(blogUrl);
  const owner = escHtml(ownerName || `the ${blogName} team`);
  const contact = email ? escHtml(email) : `the contact options on ${url || 'the blog'}`;

  if (kind === 'privacy') {
    return {
      title: 'Privacy Policy',
      html: `<h2>Privacy Policy</h2>
<p>${name} (${url}) respects your privacy. This page explains what data is collected when you visit and how it is used.</p>
<h2>What is collected</h2>
<p>Like most websites, this blog receives standard server logs (browser type, pages visited, approximate location) through Google Blogger, which hosts this site. Google's own privacy policy applies to that collection.</p>
<h2>Cookies and advertising</h2>
<p>Third-party vendors, including Google, use cookies to serve ads based on your prior visits to this and other websites. Google's use of advertising cookies enables it and its partners to serve ads based on your visits. You can opt out of personalized advertising at Google Ads Settings (adssettings.google.com) and at aboutads.info/choices.</p>
<h2>Analytics</h2>
<p>Aggregate, anonymous statistics (page views, popular posts) are used to decide what to write next. No personal profiles are built or sold.</p>
<h2>Your choices</h2>
<p>You can block or delete cookies in your browser settings at any time; the site still works without them.</p>
<h2>Contact</h2>
<p>Questions about this policy: ${contact}.</p>
<p><em>Last updated: ${new Date().toISOString().slice(0, 10)}</em></p>`,
    };
  }
  if (kind === 'about') {
    return {
      title: 'About',
      html: `<h2>About ${name}</h2>
<p>${name} is written by ${owner}.</p>
<p>This blog exists to share practical, first-hand experience - every post is written from real use, real trips or real testing, and updated when things change.</p>
<h2>What you will find here</h2>
<p>Clear guides, honest opinions and step-by-step walkthroughs. No copied content, no filler written for search engines alone.</p>
<h2>How this blog makes money</h2>
<p>Some posts contain advertising or affiliate links, always marked and never influencing what gets recommended. See the Affiliate Disclosure page for details.</p>
<h2>Contact</h2>
<p>${contact}</p>`,
    };
  }
  return {
    title: 'Affiliate Disclosure',
    html: `<h2>Affiliate Disclosure</h2>
<p>Some links on ${name} (${url}) are affiliate links. This means that if you click one and make a purchase, ${owner} may earn a small commission - at no extra cost to you.</p>
<h2>What this means for you</h2>
<p>The price you pay is the same whether you use an affiliate link or not. Commissions come from the seller's marketing budget, not from you.</p>
<h2>Editorial independence</h2>
<p>Recommendations are based on first-hand use and honest judgment. A product is never recommended because it pays a commission, and posts containing affiliate links say so at the top.</p>
<h2>Programs</h2>
<p>This blog may participate in programs such as Amazon Associates and similar affiliate networks. As an Amazon Associate, earnings come from qualifying purchases.</p>
<p><em>This disclosure follows the US FTC's guidance on endorsements and testimonials (16 CFR Part 255).</em></p>
<p><em>Last updated: ${new Date().toISOString().slice(0, 10)}</em></p>`,
  };
}

// --- AdSense readiness checklist --------------------------------------------
/**
 * adsenseChecklist({ blog, posts, pages })
 *  blog:  { name, url }
 *  posts: [{ title, html/content, status }] (published items; local + provider)
 *  pages: { privacy: bool, about: bool, disclosure: bool }
 * -> [{ id, label, status: pass|warn|fail, detail, manual? }]
 */
function adsenseChecklist({ blog = {}, posts = [], pages = {} } = {}) {
  const checks = [];
  const add = (id, label, status, detail, manual = false) => checks.push({ id, label, status, detail, manual });

  const published = posts.filter((p) => (p.status || 'published') === 'published' || p.status === 'live_dry_run');
  const wordCounts = published.map((p) => stripHtml(p.html || p.content || '').split(/\s+/).filter(Boolean).length);
  const avgWords = wordCounts.length ? Math.round(wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length) : 0;
  const affiliateLinks = published.reduce((n, p) => n + findAffiliateLinks(p.html || p.content || '').length, 0);

  add('page-privacy', 'Privacy policy page', pages.privacy ? 'pass' : 'fail',
    pages.privacy ? 'Privacy policy is published - AdSense requires it.' : 'AdSense rejects blogs without a privacy policy. Generate one below.');
  add('page-about', 'About page', pages.about ? 'pass' : 'fail',
    pages.about ? 'About page published.' : 'An About page with real authorship signals a legitimate blog to AdSense reviewers.');
  add('page-disclosure', 'Affiliate disclosure page',
    pages.disclosure ? 'pass' : affiliateLinks > 0 ? 'fail' : 'warn',
    pages.disclosure ? 'Disclosure page published.'
      : affiliateLinks > 0 ? `Found ${affiliateLinks} affiliate link(s) in published posts - a disclosure page (and per-post disclosure) is required.`
      : 'No affiliate links found yet. Generate the page now so it is ready when you add them.');

  add('content-count', 'Enough original posts',
    published.length >= 15 ? 'pass' : published.length >= 8 ? 'warn' : 'fail',
    `${published.length} published post(s). AdSense approvals typically land with 15-20 substantial posts; under 8 is almost always rejected.`);

  add('content-depth', 'Substantial content',
    !published.length ? 'fail' : avgWords >= 600 ? 'pass' : avgWords >= 300 ? 'warn' : 'fail',
    !published.length ? 'No published posts to measure.'
      : `Average ${avgWords} words per post. Reviewers look for genuinely useful depth - 600+ words average is a healthy signal.`);

  const onSubdomain = /\.blogspot\.com\/?$/i.test(String(blog.url || ''));
  add('custom-domain', 'Custom domain', onSubdomain ? 'warn' : 'pass',
    onSubdomain
      ? 'Not required for AdSense itself, but a custom domain lifts approval odds and is required by premium ad networks (Mediavine, Raptive) later.'
      : 'Custom domain in place.');

  add('contact', 'Reachable contact info', 'warn',
    'Confirm manually: your About page or header should give readers (and reviewers) a way to reach you.', true);
  add('original', 'Original content only', 'warn',
    'Confirm manually: every post is your own writing and images are licensed or yours - copied content is the top AdSense rejection reason.', true);
  add('navigation', 'Clear navigation', 'warn',
    'Confirm manually: labels/categories plus links to your Privacy, About and Disclosure pages in the menu or footer.', true);

  return checks;
}

module.exports = {
  AFFILIATE_PATTERNS,
  PAGE_KINDS,
  findAffiliateLinks,
  hasDisclosure,
  disclosureBlock,
  tagSponsoredLinks,
  generatePage,
  adsenseChecklist,
};
