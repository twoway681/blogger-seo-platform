'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bsp-lint-'));
process.env.PROVIDER = 'fake';

const { lintHtml, splitSentences, isPassive } = require('../server/seo/lint');
const { createApp } = require('../server/index');

test('splitSentences splits on terminal punctuation and keeps content', () => {
  const s = splitSentences('One two three. Four five! Six? Seven eight');
  assert.deepEqual(s, ['One two three.', 'Four five!', 'Six?', 'Seven eight']);
});

test('isPassive detects be-verb + participle + by', () => {
  assert.ok(isPassive('The trail was covered by mist.'));
  assert.ok(isPassive('The photos were taken by my brother.'));
  assert.ok(!isPassive('The mist covered the trail.'));
  assert.ok(!isPassive('She is happy.'));
});

test('lint flags repeated words and misspellings as fails', () => {
  const { issues, stats } = lintHtml({
    title: '',
    html: '<p>The the trail was was beautifull and we will definately return.</p>',
  });
  const ids = issues.map((i) => i.id);
  assert.ok(ids.includes('repeated-word'));
  assert.ok(ids.includes('misspelling'));
  const repeat = issues.find((i) => i.id === 'repeated-word');
  assert.equal(repeat.severity, 'fail');
  assert.ok(stats.misspellings >= 2, 'beautifull and definately both flagged');
});

test('lint flags long sentences with a fix suggestion', () => {
  const long = 'This sentence ' + 'keeps going '.repeat(20) + 'forever.';
  const { issues } = lintHtml({ title: '', html: `<p>${long}</p>` });
  const ls = issues.find((i) => i.id === 'long-sentence');
  assert.ok(ls);
  assert.ok(ls.detail.includes('25 words'));
});

test('lint flags double spaces and space before punctuation', () => {
  const { issues } = lintHtml({ title: '', html: '<p>Two  spaces here. And one , there.</p>' });
  const ids = issues.map((i) => i.id);
  assert.ok(ids.includes('double-space'));
  assert.ok(ids.includes('space-punctuation'));
});

test('clean prose produces no issues', () => {
  const html = '<p>The trail climbs gently through the trees. Mist hangs low in the morning. ' +
    'Carry water and start early. The ridge opens up after an hour.</p>';
  const { issues, stats } = lintHtml({ title: '', html });
  assert.deepEqual(issues, []);
  assert.equal(stats.sentences, 4);
});

test('lint endpoint returns issues and stats', async () => {
  const app = createApp();
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const start = await fetch(`${base}/auth/google`, { redirect: 'manual' });
    const cb = new URL(start.headers.get('location'));
    const cbRes = await fetch(`${base}${cb.pathname}${cb.search}`, { redirect: 'manual' });
    const cookie = cbRes.headers.get('set-cookie').split(';')[0];
    const res = await fetch(`${base}/api/seo/lint`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '', html: '<p>The the trail is very very nice.</p>' }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.issues));
    assert.ok(data.issues.some((i) => i.id === 'repeated-word'));
    assert.ok(data.stats.sentences >= 1);
  } finally {
    server.close();
  }
});
