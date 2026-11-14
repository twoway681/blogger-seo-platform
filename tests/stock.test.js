'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bsp-stock-'));
const UP = path.join(process.env.DATA_DIR, 'uploads');
process.env.BASE_URL = 'http://localhost:3999';
process.env.PROVIDER = 'fake';
delete process.env.UNSPLASH_ACCESS_KEY;
delete process.env.PEXELS_API_KEY;

const config = require('../server/config');
config.paths.uploads = UP;

const stock = require('../server/images/stock');
const { processImage } = require('../server/images/pipeline');
const { createApp } = require('../server/index');

let base; let server; let cookie;

async function call(method, p, { body } = {}) {
  const headers = cookie ? { Cookie: cookie } : {};
  let payload;
  if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(`${base}${p}`, { method, headers, body: payload });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

test.before(async () => {
  const app = createApp();
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
  // login through the fake provider
  const start = await fetch(`${base}/auth/google`, { redirect: 'manual' });
  const cb = new URL(start.headers.get('location'));
  const cbRes = await fetch(`${base}${cb.pathname}${cb.search}`, { redirect: 'manual' });
  cookie = cbRes.headers.get('set-cookie').split(';')[0];
});
test.after(() => server && server.close());

test('dry-run provider returns deterministic placeholders with auto alt text', async () => {
  const a = await stock.searchPhotos('misty forest hike');
  assert.equal(a.provider, 'demo');
  assert.equal(a.results.length, 9);
  const b = await stock.searchPhotos('misty forest hike');
  assert.deepEqual(a.results.map((r) => r.id), b.results.map((r) => r.id), 'deterministic ids');
  for (const r of a.results) {
    assert.ok(r.altText.length > 5);
    assert.ok(r.altText[0] === r.altText[0].toUpperCase());
    assert.ok(r.previewUrl.startsWith('data:image/svg+xml'));
    assert.equal(r.provider, 'demo');
  }
});

test('autoAlt sentence-cases, strips markup chars and caps length', () => {
  assert.equal(stock.autoAlt('', 'forest trail'), 'Forest trail');
  assert.equal(stock.autoAlt('a "quoted" <thing>', ''), 'A quoted thing');
  assert.ok(stock.autoAlt('x'.repeat(200), '').length <= 125);
  assert.equal(stock.autoAlt('', ''), 'Stock photo');
});

test('demo insert flows through the real image pipeline (WebP variants + alt)', async () => {
  const { results } = await stock.searchPhotos('sunrise over ananthagiri hills');
  const photo = results[0];
  const r = await call('POST', '/api/stock/insert', { body: { photo, alt: photo.altText } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.alt, photo.altText);
  assert.ok(r.data.variants.length >= 2);
  assert.ok(r.data.html.includes(`alt="${photo.altText}"`));
  assert.ok(r.data.html.includes('srcset='));
  const meta = await require('sharp')(fs.readFileSync(path.join(UP, path.basename(r.data.variants[0].url)))).metadata();
  assert.equal(meta.format, 'webp');
});

test('fetchPhoto rejects non-provider download URLs (no SSRF through client input)', async () => {
  await assert.rejects(
    () => stock.fetchPhoto({ provider: 'unsplash', id: 'x', _url: 'http://169.254.169.254/latest/meta-data' }),
    /provider host|invalid image url/);
  await assert.rejects(
    () => stock.fetchPhoto({ provider: 'pexels', id: 'x', _url: 'https://evil.example.com/x.jpg' }),
    /provider host/);
  await assert.rejects(() => stock.fetchPhoto({ provider: 'nope', id: 'x' }), /unknown stock provider/);
});

test('provider falls back to demo when no API keys are set', () => {
  assert.equal(stock.provider().name, 'demo');
});

test('unsplash provider maps results and auto alt text when configured', async () => {
  process.env.UNSPLASH_ACCESS_KEY = 'test-key';
  delete require.cache[require.resolve('../server/images/stock')];
  const fresh = require('../server/images/stock');
  assert.equal(fresh.provider().name, 'unsplash');
  const fakeFetch = async (url) => ({
    ok: true,
    json: async () => ({ results: [{ id: 'u1', description: null, alt_description: 'green tea in a cup', width: 1200, height: 800, user: { name: 'Ada', links: { html: 'https://unsplash.com/@ada' } }, urls: { small: 'https://images.unsplash.com/s.jpg', regular: 'https://images.unsplash.com/r.jpg' } }] }),
    arrayBuffer: async () => new TextEncoder().encode('fake').buffer,
  });
  const data = await fresh.searchPhotos('green tea', { fetchImpl: fakeFetch });
  assert.equal(data.results[0].altText, 'Green tea in a cup');
  assert.equal(data.results[0].credit, 'Ada');
  delete process.env.UNSPLASH_ACCESS_KEY;
  delete require.cache[require.resolve('../server/images/stock')];
});

test('stock search endpoint requires a query and returns demo results', async () => {
  const empty = await call('GET', '/api/stock/search');
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.data.results, []);
  const r = await call('GET', '/api/stock/search?q=monsoon%20forest');
  assert.equal(r.status, 200);
  assert.equal(r.data.provider, 'demo');
  assert.ok(r.data.results.length > 0);
});

test('stock insert requires a photo payload', async () => {
  const r = await call('POST', '/api/stock/insert', { body: {} });
  assert.equal(r.status, 400);
});
