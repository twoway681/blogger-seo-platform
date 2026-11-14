'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bsp-api-'));
process.env.PROVIDER = 'fake';
process.env.PUBLISH_MODE = 'dry_run';

const sharp = require('sharp');
const { createApp } = require('../server/index');

let base; let server; let cookie;

async function call(method, p, { body, form, redirect = 'manual' } = {}) {
  const headers = cookie ? { Cookie: cookie } : {};
  let payload;
  if (form) { payload = form; }
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(`${base}${p}`, { method, headers, body: payload, redirect });
  return res;
}
async function json(res) { return res.json(); }

test.before(async () => {
  const app = createApp();
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server && server.close());

test('fake OAuth flow signs in and returns a session', async () => {
  const start = await call('GET', '/auth/google');
  assert.equal(start.status, 302);
  const cb = new URL(start.headers.get('location'));
  const cbRes = await call('GET', cb.pathname + cb.search);
  assert.equal(cbRes.status, 302);
  cookie = cbRes.headers.get('set-cookie').split(';')[0];
  assert.ok(cookie.startsWith('sid='));
  const me = await json(await call('GET', '/api/me'));
  assert.equal(me.provider, 'fake');
  assert.equal(me.livePublishingEnabled, false);
  assert.equal(me.user.email, 'demo.creator@gmail.com');
});

test('blogs list, draft CRUD, SEO analyze, image upload, publish + payload audit', async () => {
  const blogs = await json(await call('GET', '/api/blogs'));
  assert.ok(blogs.items.length >= 2);
  const blogId = blogs.items[0].id;

  const post = await json(await call('POST', '/api/posts', { body: { blogId, title: '' } }));
  assert.ok(post.id);

  const png = await sharp({ create: { width: 1600, height: 900, channels: 3, background: { r: 10, g: 80, b: 160 } } }).jpeg().toBuffer();
  const form = new FormData();
  form.append('image', new Blob([png], { type: 'image/jpeg' }), 'camera-lens.jpg');
  form.append('alt', 'Camera lens close up');
  const img = await json(await call('POST', '/api/images', { form }));
  assert.ok(img.html.includes('srcset'));
  assert.ok(img.html.includes('alt="Camera lens close up"'));

  const html = `<p>Mobile photography tips for beginners start here.</p>
    <h2>Mobile photography tips: lighting</h2><p>${'Natural light matters most for clean sharp photos. '.repeat(40)}</p>
    <p>Read <a href="${blogs.items[0].url}/2026/10/welcome-to-my-blog.html">my first post</a> and
    <a href="https://example.com/guide">this guide</a>.</p>${img.html}`;
  const fields = {
    title: 'Mobile Photography Tips: 10 Beginner Tricks for Sharp Photos',
    html,
    metaDescription: 'Learn mobile photography tips covering lighting, composition and simple editing tricks that make beginner photos look professional fast.',
    focusKeyword: 'mobile photography tips',
    labels: ['Photography', 'Guides'],
  };
  await json(await call('PUT', `/api/posts/${post.id}`, { body: fields }));

  const seo = await json(await call('POST', '/api/seo/analyze', { body: { ...fields, blogId } }));
  assert.ok(seo.score >= 70, `seo score ${seo.score}`);

  const pub = await json(await call('POST', `/api/posts/${post.id}/publish`, { body: { mode: 'publish' } }));
  assert.equal(pub.ok, true);
  assert.equal(pub.dryRun, false, 'fake provider simulates publish directly');
  assert.ok(pub.result.url.includes('blogspot.com'));
  assert.equal(pub.status, 'published');

  const audit = await json(await call('GET', `/api/posts/${post.id}/payload`));
  const content = audit.payload.content;
  assert.ok(content.includes('application/ld+json'), 'JSON-LD in payload');
  assert.ok(content.includes('"@type":"Article"'));
  assert.ok(content.includes('rel="canonical"'));
  assert.ok(content.includes('srcset='));
  assert.ok(!/<h1/i.test(content));
  assert.deepEqual(audit.payload.labels, ['Photography', 'Guides']);

  // schedule validation
  const bad = await call('POST', `/api/posts/${post.id}/publish`, { body: { mode: 'schedule', scheduledAt: '2020-01-01T00:00:00Z' } });
  assert.equal(bad.status, 400);

  const posts = await json(await call('GET', '/api/posts'));
  assert.ok(posts.items.find((p) => p.id === post.id));
});

test('unauthenticated API calls are rejected', async () => {
  const res = await fetch(`${base}/api/posts`);
  assert.equal(res.status, 401);
});
