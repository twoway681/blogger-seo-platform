'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bsp-aeo-'));
process.env.PROVIDER = 'fake';
process.env.PUBLISH_MODE = 'dry_run';

const { createApp } = require('../server/index');
const { generateLlmsTxt } = require('../server/aeo/llmstxt');
const { suggestQa, headingToQuestion } = require('../server/aeo/qa');

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

// --- unit: llms.txt ---------------------------------------------------------
test('llms.txt lists only live posts with links and summaries', () => {
  const txt = generateLlmsTxt({
    blog: { name: 'My Demo Blog', url: 'https://my-demo-blog.blogspot.com/' },
    posts: [
      { title: 'Hello Trek', status: 'published', published_url: 'https://my-demo-blog.blogspot.com/2026/11/hello.html', meta_description: 'A first trek report.', html: '' },
      { title: 'Dry Run Post', status: 'live_dry_run', published_url: 'https://my-demo-blog.blogspot.com/2026/11/dry.html', meta_description: '', html: '<p>Dry run body text here.</p>' },
      { title: 'Secret Draft', status: 'draft', published_url: null, html: '<p>Never shown.</p>' },
    ],
  });
  assert.ok(txt.startsWith('# My Demo Blog'));
  assert.match(txt, /## Posts/);
  assert.match(txt, /- \[Hello Trek\]\(https:\/\/my-demo-blog\.blogspot\.com\/2026\/11\/hello\.html\): A first trek report\./);
  assert.match(txt, /Dry Run Post.*Dry run body text here/);
  assert.ok(!txt.includes('Secret Draft'), 'drafts never leak into llms.txt');
  assert.match(txt, /- Sitemap: https:\/\/my-demo-blog\.blogspot\.com\/sitemap\.xml/);
});

// --- unit: Q&A suggestions --------------------------------------------------
test('headingToQuestion transforms match how people ask', () => {
  assert.equal(headingToQuestion('Which treks are best in July?'), 'Which treks are best in July?');
  assert.equal(headingToQuestion('What to pack'), 'What should I pack?');
  assert.equal(headingToQuestion('How to reach Ananthagiri'), 'How do I reach Ananthagiri?');
  assert.equal(headingToQuestion('Trail distances and difficulty'), 'What should I know about trail distances and difficulty?');
});

test('suggestQa builds pairs from the keyword intro and real sections only', () => {
  const html = '<p>Monsoon treks near Hyderabad are short rainforest hikes ideal for beginners who want green trails.</p>'
    + '<h2>Which treks are best in July?</h2><p>Ananthagiri Hills is the classic pick for July with thick green cover.</p>'
    + '<h2>What to pack</h2><p>Quick-dry shoes, a rain cover and two liters of water cover most trail conditions.</p>'
    + '<h2>Too thin</h2><p>Short.</p>';
  const out = suggestQa({ title: 'Monsoon Treks', focusKeyword: 'monsoon treks hyderabad', html });
  assert.equal(out.length, 3); // thin section is skipped
  assert.equal(out[0].question, 'What is monsoon treks hyderabad?');
  assert.equal(out[1].question, 'Which treks are best in July?');
  assert.equal(out[2].question, 'What should I pack?');
  assert.ok(out.every((s) => s.answer.split(/\s+/).length >= 8));
});

test('suggestQa on an empty post returns nothing, never fabricates', () => {
  assert.deepEqual(suggestQa({ title: '', html: '', focusKeyword: '' }), []);
});

// --- API --------------------------------------------------------------------
test('GET /api/blogs/:id/llms.txt serves a text file built from published posts', async () => {
  const post = await (await call('POST', '/api/posts', { body: { blogId: 'fake-blog-1', title: 'Llms Entry Post' } })).json();
  await call('PUT', `/api/posts/${post.id}`, { body: { html: '<p>Body for the llms entry post with enough words to summarize.</p>', metaDescription: 'Summary for llms.' } });
  await call('POST', `/api/posts/${post.id}/publish`, { body: { mode: 'publish' } });
  const res = await call('GET', '/api/blogs/fake-blog-1/llms.txt');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/plain/);
  const txt = await res.text();
  assert.match(txt, /# My Demo Blog/);
  assert.match(txt, /- \[Llms Entry Post\]\(https:\/\/my-demo-blog\.blogspot\.com\/[^)]+\): Summary for llms\./);
});

test('POST /api/qa/suggest works over the wire and requires auth', async () => {
  const unauth = await fetch(`${base}/api/qa/suggest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(unauth.status, 401);
  const res = await call('POST', '/api/qa/suggest', { body: { title: 'T', html: '<h2>What to pack</h2><p>Shoes, water and a rain cover are enough for most short trails here.</p>' } });
  const body = await res.json();
  assert.equal(body.suggestions[0].question, 'What should I pack?');
});
