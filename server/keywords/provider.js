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

// Question mining: the exact phrasing people type (and ask AI engines). Question
// prefixes around the seed, filtered to genuine question-shaped suggestions.
const QUESTION_TEMPLATES = [
  (q) => `how to ${q}`, (q) => `what is ${q}`, (q) => `what are ${q}`,
  (q) => `which ${q}`, (q) => `why ${q}`, (q) => `when ${q}`,
  (q) => `where ${q}`, (q) => `can ${q}`, (q) => `is ${q}`, (q) => `${q} questions`,
];
const QUESTION_WORDS = ['how', 'what', 'why', 'when', 'where', 'which', 'who', 'can', 'is', 'are', 'does', 'should'];

async function suggestQuestions(seed, { fetchImpl = fetch, templates = QUESTION_TEMPLATES } = {}) {
  const clean = String(seed || '').trim().toLowerCase();
  if (!clean) return [];
  const key = `qq:${clean}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const seen = new Set();
  const out = [];
  for (const t of templates) {
    try {
      const suggestions = await autocompleteSuggestions(t(clean), fetchImpl);
      for (const s of suggestions) {
        const q = String(s).toLowerCase().trim();
        if (!q || seen.has(q)) continue;
        if (!QUESTION_WORDS.includes(q.split(/\s+/)[0]) && !q.includes('?')) continue;
        seen.add(q);
        out.push({ question: q, source: 'google-autocomplete' });
      }
    } catch { /* partial results are still useful */ }
  }
  cache.set(key, { at: Date.now(), value: out });
  return out;
}

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

// Deep research path: the blogger-growth-modules keyword finder (ESM) runs a wide
// fan-out (50+ modified queries), dedupes across sources, and scores each result
// for opportunity (0-100, HIGHER = better target for a low-authority domain) with
// human-readable reasons. Slower than suggestKeywords - used by /api/keywords/research.
let finderPromise = null;
function loadFinder() {
  if (!finderPromise) finderPromise = import('../../blogger-growth-modules/src/keywordFinder.mjs');
  return finderPromise;
}

async function researchKeywords(seed, opts = {}) {
  const clean = String(seed || '').trim();
  if (!clean) return [];
  const { findKeywords } = await loadFinder();
  const results = await findKeywords(clean, opts);
  return results.map((r) => ({ keyword: r.keyword, source: 'keyword-finder', score: r.score, reasons: r.reasons }));
}

module.exports = { suggestKeywords, suggestQuestions, researchKeywords };
