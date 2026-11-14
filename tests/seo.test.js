'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { analyzePost } = require('../server/seo/analyzer');

const goodHtml = `
<p>Mobile photography tips help beginners shoot sharp, well-lit photos with any smartphone. This updated guide covers the lighting, composition and editing basics you can learn in one afternoon and use on every shoot this year.</p>
<h2>How do I master light with these mobile photography tips?</h2><p>Use natural light. Golden hour gives soft tones that flatter every subject and scene you shoot outdoors.</p>
<h2>Composition basics</h2><p>Rule of thirds. Keep horizons level. Move your feet instead of zooming to keep details sharp.</p>
<h2>Editing on your phone</h2><p>Small adjustments to exposure and contrast go a long way. Avoid heavy filters that destroy detail.</p>
<p>See our <a href="https://myblog.blogspot.com/2026/10/welcome.html">welcome post</a> and <a href="https://example.com/photo-guide">this external guide</a>.</p>
<img src="https://cdn.example.com/a.webp" srcset="https://cdn.example.com/a-480w.webp 480w" alt="Smartphone camera capturing sunset light" loading="lazy" />
`.repeat(6);

test('strong post scores high with passes across the checklist', () => {
  const r = analyzePost({
    title: 'Mobile Photography Tips: 10 Beginner Tricks for 2026',
    html: goodHtml,
    metaDescription: 'Master mobile photography tips with this beginner guide covering lighting, composition and editing on any smartphone camera today.',
    focusKeyword: 'mobile photography tips',
    siteUrl: 'https://myblog.blogspot.com',
  });
  const byId = Object.fromEntries(r.checks.map((c) => [c.id, c.status]));
  assert.equal(byId['title-length'], 'pass');
  assert.equal(byId['kw-title'], 'pass');
  assert.equal(byId['kw-heading'], 'pass');
  assert.equal(byId['kw-meta'], 'pass');
  assert.equal(byId['meta-length'], 'pass');
  assert.equal(byId['h2-usage'], 'pass');
  assert.equal(byId['img-alt'], 'pass');
  assert.equal(byId['img-responsive'], 'pass');
  assert.equal(byId['internal-links'], 'pass');
  assert.equal(byId['external-links'], 'pass');
  assert.equal(byId['geo-answer-first'], 'pass');
  assert.equal(byId['geo-question-headings'], 'pass');
  assert.equal(byId['geo-freshness'], 'pass');
  assert.ok(r.score >= 80, `expected score >= 80, got ${r.score}`);
});

test('AI search (GEO) checks flag content AI engines cannot quote', () => {
  const r = analyzePost({
    title: 'Some Thoughts On Stuff',
    html: '<p>Hi.</p><h2>Chapter one</h2><p>Things happened and I have opinions about them.</p>'.repeat(3),
    metaDescription: '', focusKeyword: '',
  });
  const byId = Object.fromEntries(r.checks.map((c) => [c.id, c.status]));
  assert.equal(byId['geo-answer-first'], 'warn');
  assert.equal(byId['geo-question-headings'], 'warn');
  assert.equal(byId['geo-freshness'], 'warn');
});

test('empty post fails the essentials', () => {
  const r = analyzePost({ title: '', html: '', metaDescription: '', focusKeyword: '' });
  const byId = Object.fromEntries(r.checks.map((c) => [c.id, c.status]));
  assert.equal(byId['title-length'], 'fail');
  assert.equal(byId['focus-keyword'], 'fail');
  assert.equal(byId['meta-length'], 'fail');
  assert.equal(byId['word-count'], 'fail');
  assert.equal(byId['h2-usage'], 'fail');
  assert.ok(r.score < 40);
});

test('keyword stuffing warns on density', () => {
  const html = `<p>${'best running shoes '.repeat(60)}</p>`;
  const r = analyzePost({ title: 'Best running shoes', html, metaDescription: 'x'.repeat(140), focusKeyword: 'best running shoes' });
  const density = r.checks.find((c) => c.id === 'kw-density');
  assert.equal(density.status, 'warn');
});

test('missing alt text fails image check', () => {
  const r = analyzePost({
    title: 'A decent length title for the test post', html: '<p>hello world this is a post</p><img src="x.webp">',
    metaDescription: 'm'.repeat(140), focusKeyword: '',
  });
  assert.equal(r.checks.find((c) => c.id === 'img-alt').status, 'fail');
});
