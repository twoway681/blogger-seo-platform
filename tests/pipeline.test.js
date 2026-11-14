'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bsp-data-'));
const UP = path.join(process.env.DATA_DIR, 'uploads');
process.env.BASE_URL = 'http://localhost:3999';

// Point the local storage driver at a temp uploads dir.
const config = require('../server/config');
config.paths.uploads = UP;

const sharp = require('sharp');
const { processImage } = require('../server/images/pipeline');

test('image pipeline compresses to responsive WebP variants and emits clean HTML', async () => {
  const png = await sharp({ create: { width: 2000, height: 1200, channels: 3, background: { r: 200, g: 120, b: 40 } } })
    .png().toBuffer();
  const result = await processImage({ buffer: png, originalName: 'My Sunset Photo!.png', alt: 'A "quoted" <alt>', userId: 'u1' });
  assert.ok(result.bytesIn > 0);
  const widths = result.variants.map((v) => v.width);
  assert.deepEqual(widths, [480, 800, 1200, 1600]);
  for (const v of result.variants) {
    assert.ok(v.url.startsWith('http://localhost:3999/uploads/'), v.url);
    assert.ok(v.url.endsWith(`${v.width}w.webp`));
    const meta = await sharp(fs.readFileSync(path.join(UP, path.basename(v.url)))).metadata();
    assert.equal(meta.format, 'webp');
    assert.equal(meta.width, v.width);
  }
  assert.ok(result.html.includes('srcset='));
  assert.ok(result.html.includes('loading="lazy"'));
  assert.ok(result.html.includes('&quot;quoted&quot; &lt;alt&gt;'), 'alt text is attribute-escaped');
  assert.ok(result.bytesOut < result.bytesIn * 4, 'compressed output is sane');
});
