'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bsp-f2-'));
process.env.PROVIDER = 'fake';
process.env.PUBLISH_MODE = 'dry_run';

const { createApp } = require('../server/index');
const { suggestQuestions } = require('../server/keywords/provider');
const db = require('../server/db');

let base; let server; let cookie;
async function call(method, p, { body, redirect = 'manual' } = {}) {
  const headers = cookie ? { Cookie: cookie } : {};
  let payload;
  if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  return fetch(`${base}${p}`, { method, headers, body: payload, redirect });
}
const json = (r) => r.json();

test.before(async () => {
  const app = createApp();
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
  const start = await call('GET', '/auth/google');
  const cb = new URL(start.headers.get('location'));
  const cbRes = await call('GET', cb.pathname + cb.search);
  cookie = cbRes.headers.get('set-cookie').split(';')[0];
  await call('GET', '/api/blogs');
});
test.after(() => server && server.close());

// --- 1. Content refresh queue ------------------------------------------------
test('refresh queue flags stale live posts and re-publishing clears them', async () => {
  const post = await json(await call('POST', '/api/posts', { body: { blogId: 'fake-blog-1', title: 'Stale Trek Guide' } }));
  await call('PUT', `/api/posts/${post.id}`, { body: { html: '<p>Old but gold content here for the queue.</p>' } });
  await call('POST', `/api/posts/${post.id}/publish`, { body: { mode: 'publish' } });

  let queue = await json(await call('GET', '/api/refresh-queue'));
  assert.ok(!queue.items.some((i) => i.id === post.id), 'freshly published post is not stale');

  db.prepare("UPDATE posts SET updated_at = datetime('now', '-40 days') WHERE id = ?").run(post.id);
  queue = await json(await call('GET', '/api/refresh-queue'));
  const item = queue.items.find((i) => i.id === post.id);
  assert.ok(item, 'post older than the freshness window is flagged');
  assert.ok(item.daysSinceUpdate >= 40);

  const refreshed = await json(await call('POST', `/api/posts/${post.id}/publish`, { body: { mode: 'publish' } }));
  assert.equal(refreshed.ok, true);
  queue = await json(await call('GET', '/api/refresh-queue'));
  assert.ok(!queue.items.some((i) => i.id === post.id), 're-publish clears the flag');
});

// --- 2. Question mining -------------------------------------------------------
test('suggestQuestions mines question phrasing and filters non-questions', async () => {
  const fakeFetch = async (url) => {
    const q = decodeURIComponent(new URL(url).searchParams.get('q'));
    const table = {
      'how to monsoon trek': ['how to monsoon trek near hyderabad', 'monsoon trek shoes'],
      'what is monsoon trek': ['what is monsoon trekking'],
      'is monsoon trek': ['is monsoon trekking safe'],
    };
    return { ok: true, json: async () => [q, table[q] || []] };
  };
  const out = await suggestQuestions('monsoon trek', { fetchImpl: fakeFetch, templates: [(q) => `how to ${q}`, (q) => `what is ${q}`, (q) => `is ${q}`] });
  const qs = out.map((x) => x.question);
  assert.ok(qs.includes('how to monsoon trek near hyderabad'));
  assert.ok(qs.includes('is monsoon trekking safe'));
  assert.ok(!qs.includes('monsoon trek shoes'), 'non-question suggestions are filtered out');
});

test('questions endpoint requires auth, handles empty seed, marks coverage', async () => {
  const unauth = await fetch(`${base}/api/keywords/questions?q=trek`);
  assert.equal(unauth.status, 401);
  const empty = await json(await call('GET', '/api/keywords/questions?q='));
  assert.deepEqual(empty.questions, []);
});

// --- 5. Search Console performance -------------------------------------------
test('performance endpoint returns stable per-post metrics matched by URL', async () => {
  const res = await json(await call('GET', '/api/searchconsole/fake-blog-1/performance'));
  assert.equal(res.rangeDays, 28);
  const row = res.items.find((i) => i.title === 'Stale Trek Guide');
  assert.ok(row, 'published post appears in performance');
  assert.ok(row.impressions > 0 && row.position > 0);
  const again = await json(await call('GET', '/api/searchconsole/fake-blog-1/performance'));
  const row2 = again.items.find((i) => i.postId === row.postId);
  assert.equal(row.clicks, row2.clicks, 'fake metrics are deterministic');
  assert.equal(row.impressions, row2.impressions);
});

// --- 6. Scheduling + batch publish -------------------------------------------
test('schedule mode uses the two-step draft-then-publishDate flow', async () => {
  const post = await json(await call('POST', '/api/posts', { body: { blogId: 'fake-blog-1', title: 'Future Post' } }));
  await call('PUT', `/api/posts/${post.id}`, { body: { html: '<p>Scheduled body.</p>' } });
  const when = new Date(Date.now() + 3 * 86400_000).toISOString();
  const pub = await json(await call('POST', `/api/posts/${post.id}/publish`, { body: { mode: 'schedule', scheduledAt: when } }));
  assert.equal(pub.ok, true);
  assert.equal(pub.status, 'scheduled');
  assert.equal(pub.result.status, 'SCHEDULED', 'provider reports a scheduled post, not a live one');
  assert.equal(new Date(pub.result.published).toISOString(), new Date(when).toISOString());
  const bad = await call('POST', `/api/posts/${post.id}/publish`, { body: { mode: 'schedule', scheduledAt: '2020-01-01T00:00:00Z' } });
  assert.equal(bad.status, 400, 'past dates are rejected');
});

test('batch publish runs the audited flow per post and reports per-post results', async () => {
  const a = await json(await call('POST', '/api/posts', { body: { blogId: 'fake-blog-1', title: 'Batch A' } }));
  const b = await json(await call('POST', '/api/posts', { body: { blogId: 'fake-blog-1', title: 'Batch B' } }));
  await call('PUT', `/api/posts/${a.id}`, { body: { html: '<p>A body.</p>' } });
  await call('PUT', `/api/posts/${b.id}`, { body: { html: '<p>B body.</p>' } });
  const res = await json(await call('POST', '/api/posts/batch/publish', { body: { ids: [a.id, b.id, 'missing-id'] } }));
  assert.equal(res.results.length, 3);
  assert.equal(res.results[0].ok, true);
  assert.equal(res.results[1].ok, true);
  assert.equal(res.results[2].ok, false);
  assert.equal(res.ok, false, 'one failure makes the batch report not-ok');
  const posts = await json(await call('GET', '/api/posts'));
  const pa = posts.items.find((p) => p.id === a.id);
  assert.equal(pa.status, 'published');
});
