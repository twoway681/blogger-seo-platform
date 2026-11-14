'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bsp-money-'));
process.env.PROVIDER = 'fake';
process.env.PUBLISH_MODE = 'dry_run';

const { createApp } = require('../server/index');
const money = require('../server/monetize/kit');
const { findOrphans, normalizeUrl } = require('../server/links/orphans');
const { analyzePost } = require('../server/seo/analyzer');

let base; let server; let cookie;

async function call(method, p, { body, redirect = 'manual' } = {}) {
  const headers = cookie ? { Cookie: cookie } : {};
  let payload;
  if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  return fetch(`${base}${p}`, { method, headers, body: payload, redirect });
}

test.before(async () => {
  const app = createApp();
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
  const start = await call('GET', '/auth/google');
  const cb = new URL(start.headers.get('location'));
  const cbRes = await call('GET', cb.pathname + cb.search);
  cookie = cbRes.headers.get('set-cookie').split(';')[0];
  await call('GET', '/api/blogs'); // sync fake blogs into the db
});
test.after(() => server && server.close());

// --- unit: affiliate link detection ------------------------------------------
test('findAffiliateLinks spots money links and their sponsored state', () => {
  const html = `<p>Buy <a href="https://amzn.to/3abc">this tripod</a> or
    <a href="https://www.amazon.in/dp/B0X?tag=myblog-21" rel="sponsored noopener">that lens</a> and
    <a href="https://example.com/review">a normal link</a>.</p>`;
  const links = money.findAffiliateLinks(html);
  assert.equal(links.length, 2);
  assert.equal(links[0].sponsored, false);
  assert.equal(links[1].sponsored, true);
});

test('tagSponsoredLinks tags only untagged affiliate links, idempotently', () => {
  const html = `<p><a href="https://amzn.to/3abc">a</a> <a href="https://amazon.in/dp/B0X?tag=t-21" rel="sponsored">b</a> <a href="https://example.com">c</a></p>`;
  const once = money.tagSponsoredLinks(html);
  assert.equal(once.tagged, 1);
  assert.match(once.html, /href="https:\/\/amzn\.to\/3abc" rel="sponsored noopener"/);
  assert.match(once.html, /rel="sponsored">b<\/a>/); // existing tag untouched
  assert.ok(!once.html.includes('example.com" rel='), 'normal links untouched');
  const twice = money.tagSponsoredLinks(once.html);
  assert.equal(twice.tagged, 0);
  assert.equal(twice.html, once.html);
});

// --- unit: disclosure detection -----------------------------------------------
test('hasDisclosure requires the disclosure near the top (FTC conspicuousness)', () => {
  const early = '<p>Disclosure: this post contains affiliate links.</p>' + '<p>Body. </p>'.repeat(200);
  assert.equal(money.hasDisclosure(early), true);
  const buried = '<p>Body text first. </p>'.repeat(300) + '<p>Disclosure: affiliate links.</p>';
  assert.equal(money.hasDisclosure(buried), false);
  assert.equal(money.hasDisclosure('<p>No money talk here.</p>'), false);
});

// --- unit: page generation ------------------------------------------------------
test('generatePage produces kind-specific, blog-named legal pages', () => {
  const ctx = { blogName: 'Trail Notes', blogUrl: 'https://trailnotes.blogspot.com', ownerName: 'Demo Creator', email: 'demo@example.com' };
  const privacy = money.generatePage('privacy', ctx);
  assert.equal(privacy.title, 'Privacy Policy');
  assert.match(privacy.html, /Trail Notes/);
  assert.match(privacy.html, /personalized advertising/i);
  const about = money.generatePage('about', ctx);
  assert.match(about.html, /Demo Creator/);
  const disclosure = money.generatePage('disclosure', ctx);
  assert.match(disclosure.html, /no extra cost to you/i);
  assert.match(disclosure.html, /FTC/);
  assert.throws(() => money.generatePage('nope', ctx));
});

// --- unit: AdSense checklist -----------------------------------------------------
test('adsenseChecklist gates on legal pages, volume and depth', () => {
  const none = money.adsenseChecklist({ blog: { url: 'https://x.blogspot.com' }, posts: [], pages: {} });
  const byId = Object.fromEntries(none.map((c) => [c.id, c]));
  assert.equal(byId['page-privacy'].status, 'fail');
  assert.equal(byId['content-count'].status, 'fail');
  assert.equal(byId['custom-domain'].status, 'warn'); // not required, just recommended

  const posts = Array.from({ length: 16 }, (_, i) => ({
    title: `Post ${i}`, status: 'published', html: `<p>${'word '.repeat(650)}</p>`,
  }));
  const good = money.adsenseChecklist({ blog: { url: 'https://trailnotes.com' }, posts, pages: { privacy: true, about: true, disclosure: true } });
  assert.ok(good.every((c) => c.status === 'pass' || c.manual), `all green or manual: ${good.filter((c) => c.status !== 'pass' && !c.manual).map((c) => c.id)}`);

  // affiliate links in posts make the missing disclosure page a hard fail
  const aff = money.adsenseChecklist({ blog: {}, posts: [{ status: 'published', html: '<a href="https://amzn.to/x">buy</a>' }], pages: {} });
  assert.equal(aff.find((c) => c.id === 'page-disclosure').status, 'fail');
});

// --- unit: orphan detection -------------------------------------------------------
test('normalizeUrl collapses Blogger URL variants', () => {
  const base2 = 'my-demo-blog.blogspot.com/2026/10/welcome';
  assert.equal(normalizeUrl('https://my-demo-blog.blogspot.com/2026/10/welcome.html'), 'my-demo-blog.blogspot.com/2026/10/welcome.html');
  assert.equal(normalizeUrl(`http://www.${base2}.html?m=1#comments`), `${base2}.html`);
  assert.equal(normalizeUrl(`https://${base2}.html/`), `${base2}.html`);
});

test('findOrphans flags unlinked posts; self-links never rescue', () => {
  const graph = findOrphans({ posts: [
    { title: 'A', url: 'https://b.com/a.html', content: '<p><a href="https://b.com/a.html">self</a> <a href="https://b.com/b.html?m=1">to B</a></p>' },
    { title: 'B', url: 'https://b.com/b.html', content: '<p>nothing</p>' },
    { title: 'C', url: 'https://b.com/c.html', content: '<p>nothing</p>' },
  ] });
  assert.equal(graph.total, 3);
  assert.deepEqual(graph.orphans.map((o) => o.title).sort(), ['A', 'C']); // A's self-link does not count
  assert.deepEqual(graph.linked.map((l) => [l.title, l.inbound]), [['B', 1]]);
});

// --- unit: analyzer monetization checks ---------------------------------------------
test('analyzer flags untagged affiliate links and missing disclosure', () => {
  const bad = analyzePost({ title: 't', html: '<p>Intro.</p><p><a href="https://amzn.to/3abc">buy this</a></p>' });
  const ids = Object.fromEntries(bad.checks.map((c) => [c.id, c]));
  assert.equal(ids['money-sponsored'].status, 'fail');
  assert.equal(ids['money-disclosure'].status, 'fail');

  const good = analyzePost({ title: 't', html: '<p>Disclosure: affiliate links ahead.</p><p><a href="https://amzn.to/3abc" rel="sponsored noopener">buy this</a></p>' });
  const gids = Object.fromEntries(good.checks.map((c) => [c.id, c]));
  assert.equal(gids['money-sponsored'].status, 'pass');
  assert.equal(gids['money-disclosure'].status, 'pass');

  const none = analyzePost({ title: 't', html: '<p>No money links.</p>' });
  assert.ok(!none.checks.some((c) => c.id.startsWith('money-')), 'no money checks when no affiliate links');
});

// --- routes -----------------------------------------------------------------------
test('GET /monetization returns checklist; page generation stores and publishes (demo)', async () => {
  let res = await call('GET', '/api/blogs/fake-blog-1/monetization');
  assert.equal(res.status, 200);
  let d = await res.json();
  assert.ok(Array.isArray(d.checklist) && d.checklist.length >= 8);
  assert.equal(d.pages.privacy, false);

  res = await call('POST', '/api/blogs/fake-blog-1/monetization/page', { body: { kind: 'privacy' } });
  assert.equal(res.status, 200);
  const gen = await res.json();
  assert.equal(gen.title, 'Privacy Policy');
  assert.equal(gen.status, 'published'); // demo provider really "publishes"
  assert.match(gen.url, /\/p\/privacy-policy\.html$/);

  res = await call('GET', '/api/blogs/fake-blog-1/monetization');
  d = await res.json();
  assert.equal(d.pages.privacy, true);
  assert.equal(d.checklist.find((c) => c.id === 'page-privacy').status, 'pass');

  res = await call('POST', '/api/blogs/fake-blog-1/monetization/page', { body: { kind: 'bogus' } });
  assert.equal(res.status, 400);
});

test('GET /orphans reports the demo orphan post', async () => {
  const res = await call('GET', '/api/blogs/fake-blog-1/orphans');
  assert.equal(res.status, 200);
  const d = await res.json();
  assert.equal(d.total, 3);
  // welcome-to-my-blog is linked from beginner-mistakes; mistakes and hidden-gems
  // have no inbound links, so both are orphans.
  assert.equal(d.orphanCount, 2);
  const orphanTitles = d.orphans.map((o) => o.title);
  assert.ok(orphanTitles.includes('Hidden gems no one links to'));
  assert.ok(orphanTitles.includes('Beginner mistakes I made'));
  assert.deepEqual(d.linked.map((l) => [l.title, l.inbound]), [['Welcome to my blog', 1]]);
});
