'use strict';
// Keyword provider interface (blueprint Phase 3 seam).
//
//   suggestKeywords(seed, opts?) -> Promise<[{ keyword, source, score? }]>
//
// MVP implementation: Google Autocomplete (free, no API key, no spend) with
// alphabet-soup expansion - the classic zero-cost long-tail source.
// Extension point for the keyword-finder work: add providers that attach a
// competition/difficulty `score` (0-100, lower = easier) and search-volume
// estimates, then register them in PROVIDERS below. Results from all providers
// are merged and de-duplicated.

const cache = new Map(); // key -> { at, value }
const CACHE_TTL_MS = 3600_000;

async function autocompleteSuggestions(query, fetchImpl = fetch) {
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query)}`;
  const res = await fetchImpl(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`autocomplete failed: HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) && Array.isArray(data[1]) ? data[1] : [];
}

const EXPANSIONS = ['', ' for beginners', ' tips', ' ideas', ' a', ' b', ' c', ' how to', ' best', ' free'];

async function suggestKeywords(seed, { fetchImpl = fetch, expansions = EXPANSIONS } = {}) {
  const clean = String(seed || '').trim().toLowerCase();
  if (!clean) return [];
  const key = `ac:${clean}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const seen = new Set();
  const out = [];
  for (const suffix of expansions) {
    try {
      const suggestions = await autocompleteSuggestions(clean + suffix, fetchImpl);
      for (const s of suggestions) {
        const kw = String(s).toLowerCase().trim();
        if (!kw || seen.has(kw) || kw === clean) continue;
        seen.add(kw);
        out.push({ keyword: kw, source: 'google-autocomplete' });
      }
    } catch {
      // A failed expansion is skipped, not fatal: partial results are still useful.
    }
  }
  cache.set(key, { at: Date.now(), value: out });
  return out;
}

module.exports = { suggestKeywords };
