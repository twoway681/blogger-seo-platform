'use strict';
// Stock photo provider abstraction (research build-now item: stock image picker).
//
//   provider()                -> { name, configured }
//   searchPhotos(query, opts) -> Promise<[{ id, provider, description, altText, credit, creditUrl, width, height, previewUrl }]>
//   fetchPhoto(result)        -> Promise<{ buffer, originalName, alt, credit }>
//
// Real providers (Unsplash, Pexels) are free-tier but need the user's own API key,
// so until a key is configured a deterministic DRY-RUN provider generates branded
// placeholder photos locally (no network, no spend) - the picker UI, alt-text flow
// and image pipeline are exercised end-to-end exactly as with a real provider.
// Set UNSPLASH_ACCESS_KEY or PEXELS_API_KEY in .env to switch on live search.

const crypto = require('crypto');
const sharp = require('sharp');

const cache = new Map(); // key -> { at, value }
const CACHE_TTL_MS = 1800_000;

// --- auto alt text -----------------------------------------------------------
// Derived from the photo's own description, falling back to the search query.
// Alt text describes the image; the photographer credit travels separately.
function autoAlt(description, query) {
  let alt = String(description || '').trim() || String(query || '').trim();
  alt = alt.replace(/\s+/g, ' ').replace(/[<>"]/g, '').trim();
  if (!alt) alt = 'Stock photo';
  // Sentence-case, cap at ~125 chars (screen-reader guidance).
  alt = alt[0].toUpperCase() + alt.slice(1);
  if (alt.length > 125) alt = alt.slice(0, 122).replace(/\s+\S*$/, '') + '...';
  return alt;
}

// --- dry-run provider --------------------------------------------------------
// Deterministic placeholders: the id encodes query + index, so fetchPhoto can
// regenerate the identical image with no stored state and no network.
const PALETTES = [
  ['#1e3a8a', '#3b82f6'], ['#065f46', '#34d399'], ['#7c2d12', '#fb923c'],
  ['#4a044e', '#c084fc'], ['#0f172a', '#64748b'], ['#713f12', '#facc15'],
  ['#881337', '#fb7185'], ['#134e4a', '#2dd4bf'],
];

function dryRunResult(query, index) {
  const id = `dry-${crypto.createHash('sha256').update(`${query}#${index}`).digest('hex').slice(0, 12)}`;
  const palette = PALETTES[(crypto.createHash('md5').update(id).digest()[0]) % PALETTES.length];
  const width = 1600;
  const height = 900 + (index % 3) * 100;
  const label = query.split(' ').map((w) => w[0] ? w[0].toUpperCase() + w.slice(1) : w).join(' ');
  return {
    id,
    provider: 'demo',
    description: `${label} - stock photo ${index + 1}`,
    query,
    index,
    altText: autoAlt(`${label} photo`, query),
    credit: 'Blogsmith demo placeholder',
    creditUrl: '',
    width,
    height,
    _palette: palette,
  };
}

function placeholderSvg({ width, height, label, palette }) {
  const [c1, c2] = palette;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>
      </linearGradient></defs>
      <rect width="${width}" height="${height}" fill="url(#g)"/>
      <circle cx="${width * 0.78}" cy="${height * 0.24}" r="${Math.min(width, height) * 0.14}" fill="rgba(255,255,255,0.25)"/>
      <rect x="0" y="${height * 0.72}" width="${width}" height="${height * 0.28}" fill="rgba(0,0,0,0.18)"/>
      <text x="${width / 2}" y="${height / 2}" font-family="Georgia, serif" font-size="${Math.round(width / 16)}" fill="rgba(255,255,255,0.92)" text-anchor="middle">${label.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>
      <text x="${width / 2}" y="${height / 2 + Math.round(width / 11)}" font-family="Arial, sans-serif" font-size="${Math.round(width / 40)}" fill="rgba(255,255,255,0.6)" text-anchor="middle">demo placeholder - connect Unsplash/Pexels for real photos</text>
    </svg>`
  );
}

const dryRun = {
  name: 'demo',
  configured: true,
  async search(query) {
    const clean = String(query || '').trim().toLowerCase() || 'blog photo';
    return Promise.all(Array.from({ length: 9 }, (_, i) => {
      const r = dryRunResult(clean, i);
      const svg = placeholderSvg({ width: 480, height: 300, label: r.description, palette: r._palette });
      return { ...r, previewUrl: `data:image/svg+xml;base64,${svg.toString('base64')}` };
    }));
  },
  async fetch(result) {
    const svg = placeholderSvg({ width: result.width, height: result.height, label: result.description, palette: result._palette });
    const buffer = await sharp(svg).png().toBuffer();
    return { buffer, originalName: `${result.id}.png`, alt: result.altText, credit: result.credit };
  },
};

// --- Unsplash (free tier, needs the user's own key) --------------------------
const unsplash = {
  name: 'unsplash',
  configured: Boolean(process.env.UNSPLASH_ACCESS_KEY),
  async search(query, { fetchImpl = fetch } = {}) {
    const url = `https://api.unsplash.com/search/photos?per_page=12&query=${encodeURIComponent(query)}`;
    const res = await fetchImpl(url, { headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` } });
    if (!res.ok) throw new Error(`unsplash failed: HTTP ${res.status}`);
    const data = await res.json();
    return (data.results || []).map((p) => ({
      id: p.id, provider: 'unsplash',
      description: p.description || p.alt_description || query,
      altText: autoAlt(p.alt_description || p.description, query),
      credit: p.user ? p.user.name : 'Unsplash photographer',
      creditUrl: p.user && p.user.links ? p.user.links.html : 'https://unsplash.com',
      width: p.width, height: p.height,
      previewUrl: p.urls && p.urls.small,
      _url: p.urls && p.urls.regular,
    }));
  },
  async fetch(result, { fetchImpl = fetch } = {}) {
    const res = await fetchImpl(assertProviderUrl(result._url, 'images.unsplash.com'));
    if (!res.ok) throw new Error(`unsplash download failed: HTTP ${res.status}`);
    const buffer = await boundedBuffer(res);
    return { buffer, originalName: `${result.id}.jpg`, alt: result.altText, credit: result.credit };
  },
};

// Only fetch from the provider's own CDN host - the insert endpoint receives the
// result object back from the client, so the download URL must be re-validated.
const MAX_DOWNLOAD_BYTES = 30 * 1024 * 1024;
async function boundedBuffer(res) {
  const len = Number(res.headers.get('content-length') || 0);
  if (len > MAX_DOWNLOAD_BYTES) throw new Error('image download too large');
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > MAX_DOWNLOAD_BYTES) throw new Error('image download too large');
  return buffer;
}

function assertProviderUrl(url, host) {
  let parsed;
  try { parsed = new URL(String(url || '')); } catch { throw new Error('invalid image url'); }
  if (parsed.protocol !== 'https:' || parsed.host !== host) throw new Error('image url is not on the provider host');
  return parsed.toString();
}

// --- Pexels (free tier, needs the user's own key) ----------------------------
const pexels = {
  name: 'pexels',
  configured: Boolean(process.env.PEXELS_API_KEY),
  async search(query, { fetchImpl = fetch } = {}) {
    const url = `https://api.pexels.com/v1/search?per_page=12&query=${encodeURIComponent(query)}`;
    const res = await fetchImpl(url, { headers: { Authorization: process.env.PEXELS_API_KEY } });
    if (!res.ok) throw new Error(`pexels failed: HTTP ${res.status}`);
    const data = await res.json();
    return (data.photos || []).map((p) => ({
      id: String(p.id), provider: 'pexels',
      description: p.alt || query,
      altText: autoAlt(p.alt, query),
      credit: p.photographer || 'Pexels photographer',
      creditUrl: p.photographer_url || 'https://www.pexels.com',
      width: p.width, height: p.height,
      previewUrl: p.src && p.src.medium,
      _url: p.src && (p.src.large2x || p.src.large || p.src.original),
    }));
  },
  async fetch(result, { fetchImpl = fetch } = {}) {
    const res = await fetchImpl(assertProviderUrl(result._url, 'images.pexels.com'));
    if (!res.ok) throw new Error(`pexels download failed: HTTP ${res.status}`);
    const buffer = await boundedBuffer(res);
    return { buffer, originalName: `${result.id}.jpg`, alt: result.altText, credit: result.credit };
  },
};

function provider() {
  if (unsplash.configured) return unsplash;
  if (pexels.configured) return pexels;
  return dryRun;
}

async function searchPhotos(query, opts = {}) {
  const clean = String(query || '').trim();
  if (!clean) return { provider: provider().name, configured: provider().configured, results: [] };
  const key = `stock:${provider().name}:${clean.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  const results = await provider().search(clean, opts);
  const value = { provider: provider().name, configured: provider().configured, results };
  cache.set(key, { at: Date.now(), value });
  return value;
}

// Insert-time fetch. Dry-run results regenerate deterministically from query+index;
// real-provider results re-validate the download URL against the provider host.
async function fetchPhoto(result, opts = {}) {
  if (!result || !result.provider) throw new Error('missing stock photo result');
  if (result.provider === 'demo') {
    const regen = dryRunResult(String(result.query || result.description || 'blog photo').toLowerCase(), Number(result.index) || 0);
    // Never trust client-supplied dimensions: the SVG is rasterized at these
    // sizes, so an oversized width/height would be a memory-DoS. Regenerated
    // values win; clamp for good measure.
    const merged = { ...regen, ...result, width: regen.width, height: regen.height, _palette: regen._palette };
    merged.width = Math.min(Math.max(Number(merged.width) || 1600, 1), 2048);
    merged.height = Math.min(Math.max(Number(merged.height) || 900, 1), 2048);
    merged.altText = autoAlt(result.altText || regen.description, regen.query);
    return dryRun.fetch(merged, opts);
  }
  const p = { unsplash, pexels }[result.provider];
  if (!p) throw new Error(`unknown stock provider: ${result.provider}`);
  return p.fetch(result, opts);
}

module.exports = { searchPhotos, provider, fetchPhoto, autoAlt, dryRunResult, assertProviderUrl };
