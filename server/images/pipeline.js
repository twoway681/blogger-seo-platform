'use strict';
// Image pipeline: upload -> sharp compress -> WebP at responsive widths -> storage -> HTML.
// Replaces Blogger's missing binary-upload endpoint per blueprint section 3.

const crypto = require('crypto');
const path = require('path');
const sharp = require('sharp');
const storage = require('./storage');

const RESPONSIVE_WIDTHS = [480, 800, 1200, 1600];
const MAX_WIDTH = 1600;
const WEBP_QUALITY = 80;

/**
 * processImage({ buffer, originalName, alt, userId })
 * -> { id, alt, bytesIn, variants: [{width,url,bytes}], html }
 */
async function processImage({ buffer, originalName, alt = '', userId }) {
  const bytesIn = buffer.length;
  const meta = await sharp(buffer).metadata();
  const srcWidth = meta.width || MAX_WIDTH;
  const widths = RESPONSIVE_WIDTHS.filter((w) => w <= Math.max(srcWidth, 480));
  if (!widths.includes(Math.min(srcWidth, MAX_WIDTH))) widths.push(Math.min(srcWidth, MAX_WIDTH));
  const uniqueWidths = [...new Set(widths)].sort((a, b) => a - b);

  const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16);
  const slug = slugify(path.basename(originalName || 'image', path.extname(originalName || ''))) || 'image';
  const base = `${slug}-${hash}`;

  const store = storage.driver();
  const variants = [];
  for (const width of uniqueWidths) {
    const out = await sharp(buffer)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
    const key = `${base}-${width}w.webp`;
    const url = await store.put({ key, buffer: out, contentType: 'image/webp' });
    variants.push({ width, url, bytes: out.length, format: 'webp' });
  }

  const largest = variants[variants.length - 1];
  const srcset = variants.map((v) => `${v.url} ${v.width}w`).join(', ');
  const safeAlt = escapeAttr(alt);
  const html = `<img src="${largest.url}" srcset="${srcset}" sizes="(max-width: 800px) 100vw, 800px" alt="${safeAlt}" loading="lazy" decoding="async" style="max-width:100%;height:auto;" />`;

  return {
    id: hash,
    alt,
    bytesIn,
    bytesOut: variants.reduce((a, v) => a + v.bytes, 0),
    originalWidth: srcWidth,
    variants,
    html,
    userId,
  };
}

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}
function escapeAttr(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

module.exports = { processImage, RESPONSIVE_WIDTHS };
