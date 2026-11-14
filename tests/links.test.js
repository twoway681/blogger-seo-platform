'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { suggestInternalLinks } = require('../server/links/suggest');

const posts = [
  { title: 'Welcome to my blog', url: 'https://b.blogspot.com/2026/10/welcome.html' },
  { title: 'Beginner mistakes with phone cameras', url: 'https://b.blogspot.com/2026/10/mistakes.html' },
  { title: 'Advanced studio lighting rigs', url: 'https://b.blogspot.com/2026/10/studio.html' },
];

test('ranks posts by title-term coverage and skips already-linked URLs', () => {
  const html = `<p>Many beginner mistakes happen with phone cameras in low light.
    Welcome to my <a href="https://b.blogspot.com/2026/10/welcome.html">blog journey</a>.</p>`;
  const out = suggestInternalLinks({ html, posts });
  assert.equal(out.length, 1, 'welcome post is already linked; studio rigs does not match');
  assert.equal(out[0].url, 'https://b.blogspot.com/2026/10/mistakes.html');
  assert.ok(out[0].score >= 50);
  assert.deepEqual(out[0].matchedTerms.sort(), ['beginner', 'cameras', 'mistakes', 'phone']);
});

test('no matches returns empty, max limits results', () => {
  assert.deepEqual(suggestInternalLinks({ html: '<p>zzz qqq</p>', posts }), []);
  const many = Array.from({ length: 10 }, (_, i) => ({ title: `photo tips part ${i}`, url: `https://b.blogspot.com/p${i}` }));
  const out = suggestInternalLinks({ html: '<p>photo tips for everyone</p>', posts: many, max: 3 });
  assert.equal(out.length, 3);
});
