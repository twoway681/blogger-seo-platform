import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFanoutQueries, findKeywords } from '../src/keywordFinder.mjs';
import { scoreKeyword } from '../src/scoring.mjs';
import { parseTrendingRss, trendingSet } from '../src/trends.mjs';

// Offline fixture fetch: returns canned suggestions keyed by query substring.
const fixtureFetch = async (url) => {
  const q = new URL(url).searchParams.get('q');
  const table = {
    'blogging a': ['blogging apps for beginners', 'blogging as a student'],
    'how blogging': ['how blogging works', 'how to start blogging for free'],
    'blogging for': ['blogging for beginners step by step', 'blogging for money'],
    'blogging': ['blogging', 'blogging tips'],
  };
  const suggestions = table[q] || [];
  return { ok: true, json: async () => [q, suggestions] };
};

test('fan-out covers alphabet, questions, prepositions and dedupes', () => {
  const qs = buildFanoutQueries('crm');
  assert.ok(qs.includes('crm a') && qs.includes('z crm'));
  assert.ok(qs.includes('how crm') && qs.includes('crm vs'));
  assert.equal(new Set(qs).size, qs.length);
});

test('findKeywords dedupes, scores and sorts offline', async () => {
  const results = await findKeywords('blogging', { fetchImpl: fixtureFetch, paceMs: 0 });
  assert.ok(results.length > 0);
  const kws = results.map((r) => r.keyword);
  assert.equal(new Set(kws).size, kws.length, 'no duplicates');
  assert.ok(results[0].score >= results[results.length - 1].score, 'sorted desc');
  assert.ok(!kws.includes('blogging'), 'seed itself excluded');
  const best = results.find((r) => r.keyword === 'blogging for beginners step by step');
  assert.ok(best && best.score > 40, `long-tail beginner keyword scores well, got ${best?.score}`);
  const money = results.find((r) => r.keyword === 'blogging for money');
  assert.ok(money.score < best.score, 'commercial term scores below informational long tail');
});

test('scoring rewards long-tail question intent and penalizes head terms', () => {
  const head = scoreKeyword('shoes', { fanoutHits: 10 });
  const tail = scoreKeyword('how to clean white shoes without bleach', { fanoutHits: 2 });
  assert.ok(tail.score > head.score);
});

test('stops after 3 consecutive failures (rate-limit signal)', async () => {
  let calls = 0;
  const failing = async () => { calls++; throw new Error('429'); };
  const results = await findKeywords('x', { fetchImpl: failing, paceMs: 0 });
  assert.equal(calls, 3);
  assert.deepEqual(results, []);
});

test('trends RSS parses and feeds the trending bonus', () => {
  const xml = `<?xml version="1.0"?><rss xmlns:ht="https://trends.google.com/trending/rss"><channel>
    <item><title>cricket score</title><ht:approx_traffic>5000+</ht:approx_traffic><pubDate>Sat, 14 Nov 2026 05:00:00 -0800</pubDate></item>
    <item><title>blogging</title><ht:approx_traffic>200+</ht:approx_traffic></item></channel></rss>`;
  const items = parseTrendingRss(xml);
  assert.equal(items.length, 2);
  assert.equal(items[0].traffic, '5000+');
  const set = trendingSet(items);
  assert.ok(set.has('blogging'));
});
