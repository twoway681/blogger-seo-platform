'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { composePostPayload, sanitizeHtml } = require('../server/seo/compose');

test('payload matches Blogger API v3 shape with schema + canonical injected', () => {
  const { payload, canonicalUrl, schema } = composePostPayload({
    blogId: 'fake-blog-1', blogUrl: 'https://my-demo-blog.blogspot.com',
    title: 'Test Post', html: '<p>Body text.</p><img src="https://cdn.example.com/a.webp" alt="alt text">',
    metaDescription: 'A meta description.', labels: ['Guides', ' Beginners ', ''],
    authorName: 'Demo Creator', blogName: 'My Demo Blog',
  });
  assert.equal(payload.kind, 'blogger#post');
  assert.equal(payload.blog.id, 'fake-blog-1');
  assert.equal(payload.title, 'Test Post');
  assert.deepEqual(payload.labels, ['Guides', 'Beginners']);
  assert.ok(payload.content.includes('application/ld+json'), 'JSON-LD script injected');
  assert.ok(payload.content.includes('rel="canonical"'), 'canonical link injected');
  assert.ok(payload.content.indexOf('application/ld+json') < payload.content.indexOf('<p>Body'), 'schema comes before body');
  assert.equal(canonicalUrl, 'https://my-demo-blog.blogspot.com');
  assert.equal(schema['@type'], 'Article');
  assert.equal(schema.headline, 'Test Post');
  assert.deepEqual(schema.image, ['https://cdn.example.com/a.webp']);
  assert.equal(schema.author.name, 'Demo Creator');
});

test('draft and schedule modes set Blogger fields', () => {
  const draft = composePostPayload({ blogId: 'b', title: 't', html: '<p>x</p>', isDraft: true }).payload;
  assert.equal(draft.isDraft, true);
  const when = new Date(Date.now() + 86400000).toISOString();
  const sched = composePostPayload({ blogId: 'b', title: 't', html: '<p>x</p>', scheduledAtIso: when }).payload;
  assert.equal(sched.published, when);
  assert.ok(!sched.isDraft);
});

test('sanitizer strips scripts, handlers, js: URLs and demotes H1', () => {
  const dirty = '<h1 onclick="evil()">Title</h1><p onmouseover="x()">ok</p><script>alert(1)</script><a href="javascript:steal()">bad</a><iframe src="x"></iframe>';
  const clean = sanitizeHtml(dirty);
  assert.ok(!/<script/i.test(clean));
  assert.ok(!/on\w+\s*=/i.test(clean));
  assert.ok(!/javascript:/i.test(clean));
  assert.ok(!/<iframe/i.test(clean));
  assert.ok(!/<h1/i.test(clean));
  assert.ok(/<h2/.test(clean), 'h1 demoted to h2');
});

test('images are normalized to lazy + responsive', () => {
  const { finalHtml } = composePostPayload({ blogId: 'b', title: 't', html: '<img src="x.webp" alt="a">' });
  const img = finalHtml.match(/<img[^>]*>/)[0];
  assert.ok(/loading="lazy"/.test(img));
  assert.ok(/decoding="async"/.test(img));
  assert.ok(/max-width:100%/.test(img));
});
