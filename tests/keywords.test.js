'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { suggestKeywords } = require('../server/keywords/provider');

function fakeFetch(suggestionsByQuery) {
  return async (url) => {
    const q = new URL(url).searchParams.get('q');
    return { ok: true, json: async () => [q, suggestionsByQuery[q] || []] };
  };
}

test('merges expansions, dedupes, drops the seed itself', async () => {
  const fetchImpl = fakeFetch({
    'mobile photography': ['mobile photography tips', 'mobile photography course'],
    'mobile photography tips': ['mobile photography tips', 'Mobile Photography Tips for beginners'],
  });
  const out = await suggestKeywords('Mobile Photography', { fetchImpl, expansions: ['', ' tips'] });
  const kws = out.map((o) => o.keyword);
  assert.ok(kws.includes('mobile photography tips'));
  assert.ok(kws.includes('mobile photography course'));
  assert.ok(kws.includes('mobile photography tips for beginners'));
  assert.equal(new Set(kws).size, kws.length, 'no duplicates');
  assert.ok(!kws.includes('mobile photography'), 'seed itself excluded');
  assert.ok(out.every((o) => o.source === 'google-autocomplete'));
});

test('empty seed and provider failure are handled', async () => {
  assert.deepEqual(await suggestKeywords('  '), []);
  const failing = async () => ({ ok: false, status: 500 });
  assert.deepEqual(await suggestKeywords('x', { fetchImpl: failing, expansions: [''] }), []);
});
