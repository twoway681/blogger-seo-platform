import test from 'node:test';
import assert from 'node:assert/strict';
import { repurposePost, makeIntentUrls } from '../src/repurpose.mjs';

const post = {
  title: 'Complete Beginner Guide to Mobile Photography',
  url: 'https://myblog.blogspot.com/2026/11/mobile-photography-guide.html',
  html: `<p>Mobile photography is the fastest way to start shooting without buying a camera. This guide covers everything.</p>
         <h2>Lighting Tips</h2><p>Shoot during golden hour.</p>
         <h2>Composition Basics</h2><p>Use the rule of thirds.</p>
         <h2>Editing Apps</h2><p>Snapseed is free.</p>
         <script>var x = 1;</script>`,
  imageUrl: 'https://cdn.example.com/mobile-photo.webp',
};

test('repurposePost builds all three formats plus intent urls', () => {
  const r = repurposePost(post);
  assert.ok(r.pinterestPin.title.length <= 100);
  assert.ok(r.pinterestPin.description.length <= 500);
  assert.equal(r.pinterestPin.imageUrl, post.imageUrl);
  assert.ok(r.xThread.length >= 3);
  for (const tweet of r.xThread) assert.ok(tweet.length <= 280, `tweet too long: ${tweet.length}`);
  assert.ok(r.xThread.at(-1).includes(post.url));
  assert.ok(r.xThread[0].includes(post.title));
  assert.ok(!r.xThread.join(' ').includes('var x'), 'scripts stripped');
  assert.ok(r.linkedinPost.includes('Lighting Tips'));
  assert.ok(r.linkedinPost.includes(post.url));
  assert.ok(r.linkedinPost.length <= 3000);
  assert.ok(r.intentUrls.x.startsWith('https://twitter.com/intent/post?'));
  assert.ok(r.intentUrls.pinterest.includes(encodeURIComponent(post.url)));
});

test('intent urls encode title and url', () => {
  const urls = makeIntentUrls({ title: 'A & B', url: 'https://x.blogspot.com/p?a=1&b=2' });
  assert.ok(urls.x.includes('A%20%26%20B'));
  assert.ok(urls.reddit.includes(encodeURIComponent('https://x.blogspot.com/p?a=1&b=2')));
});
