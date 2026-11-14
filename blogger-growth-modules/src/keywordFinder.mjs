// Fan-out keyword expander: one seed -> ~50 modified queries -> hundreds of
// unique long-tail suggestions -> scored for low competition.
import { googleSuggest, duckduckgoSuggest, sleep } from './suggest.mjs';
import { scoreKeyword } from './scoring.mjs';

const QUESTION_PREFIXES = ['how', 'what', 'why', 'which', 'can', 'is'];
const PREP_SUFFIXES = ['for', 'vs', 'without', 'with', 'like'];
const ALPHA = 'abcdefghijklmnopqrstuvwxyz'.split('');

export function buildFanoutQueries(seed, { alpha = true, questions = true, prepositions = true } = {}) {
  const s = seed.trim().toLowerCase();
  const qs = [s];
  if (alpha) for (const c of ALPHA) { qs.push(`${s} ${c}`); qs.push(`${c} ${s}`); }
  if (questions) for (const q of QUESTION_PREFIXES) qs.push(`${q} ${s}`);
  if (prepositions) for (const p of PREP_SUFFIXES) qs.push(`${s} ${p}`);
  return [...new Set(qs)];
}

export async function findKeywords(seed, {
  fetchImpl = fetch, hl = 'en', gl = 'us', paceMs = 120, sources = ['google'],
  trendingSet = new Set(), maxQueries = Infinity,
} = {}) {
  const queries = buildFanoutQueries(seed).slice(0, maxQueries);
  const hits = new Map(); // suggestion -> fan-out hit count
  let consecutiveFailures = 0;

  for (const q of queries) {
    let suggestions = [];
    try {
      for (const source of sources) {
        const fn = source === 'google' ? googleSuggest : duckduckgoSuggest;
        suggestions.push(...await fn(q, { fetchImpl, hl, gl }));
      }
      consecutiveFailures = 0;
    } catch {
      consecutiveFailures += 1;
      if (consecutiveFailures >= 3) break; // rate-limit signal: stop, keep what we have
    }
    for (const sug of suggestions) {
      const k = sug.trim().toLowerCase();
      if (!k || k === seed.trim().toLowerCase()) continue;
      hits.set(k, (hits.get(k) || 0) + 1);
    }
    if (paceMs) await sleep(paceMs);
  }

  return [...hits.entries()]
    .map(([keyword, fanoutHits]) => scoreKeyword(keyword, { fanoutHits, trending: trendingSet.has(keyword) }))
    .sort((a, b) => b.score - a.score);
}
