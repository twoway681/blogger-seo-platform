'use strict';
// Offline fake Blogger provider: simulates Google OAuth + Blogger API v3 with zero
// network, zero spend and zero live publishing. Powers demo mode and the test suite.

let seq = 1000;

function demoBlogs() {
  return [
    { id: 'fake-blog-1', name: 'My Demo Blog', url: 'https://my-demo-blog.blogspot.com', posts: { totalItems: 3 } },
    { id: 'fake-blog-2', name: 'Photography Notes', url: 'https://photography-notes.blogspot.com', posts: { totalItems: 7 } },
  ];
}

function fakeAuthUrl(state, baseUrl) {
  return `${baseUrl}/auth/google/callback?code=fake-demo-code&state=${encodeURIComponent(state)}`;
}

async function fakeExchangeCode() {
  return { access_token: 'fake-access-token', expires_in: 3600, refresh_token: 'fake-refresh-token' };
}

async function fakeUserinfo() {
  return { sub: 'fake-user-1', email: 'demo.creator@gmail.com', name: 'Demo Creator', picture: '' };
}

function insertPost(blogId, payload) {
  seq += 1;
  const slug = (payload.title || 'post').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'post';
  const blog = demoBlogs().find((b) => b.id === blogId) || demoBlogs()[0];
  const isDraft = Boolean(payload.isDraft);
  const scheduled = payload.published && new Date(payload.published) > new Date();
  return {
    kind: 'blogger#post',
    id: `fake-post-${seq}`,
    blog: { id: blogId },
    title: payload.title,
    content: payload.content,
    labels: payload.labels || [],
    status: isDraft ? 'DRAFT' : scheduled ? 'SCHEDULED' : 'LIVE',
    published: payload.published || new Date().toISOString(),
    url: isDraft ? null : `${blog.url.replace(/\/$/, '')}/2026/11/${slug}.html`,
  };
}

function listPosts(blogId) {
  const blog = demoBlogs().find((b) => b.id === blogId) || demoBlogs()[0];
  return {
    kind: 'blogger#postList',
    items: [
      { id: 'fake-post-901', blog: { id: blog.id }, title: 'Welcome to my blog', url: `${blog.url}/2026/10/welcome-to-my-blog.html`, published: '2026-10-02T09:00:00.000Z',
        content: '<p>Welcome! This blog is where I share everything I learn. Start with my story.</p>' },
      { id: 'fake-post-902', blog: { id: blog.id }, title: 'Beginner mistakes I made', url: `${blog.url}/2026/10/beginner-mistakes.html`, published: '2026-10-20T15:30:00.000Z',
        content: `<p>When I started, I got almost everything wrong. Read <a href="${blog.url}/2026/10/welcome-to-my-blog.html">my welcome post</a> for context, and this <a href="https://example.com/guide">external guide</a>.</p>` },
      // Deliberately orphaned in the demo set: nothing links to it, so the
      // orphan detector has something real to show in demo mode.
      { id: 'fake-post-903', blog: { id: blog.id }, title: 'Hidden gems no one links to', url: `${blog.url}/2026/11/hidden-gems.html`, published: '2026-11-05T11:00:00.000Z',
        content: '<p>A quiet list of overlooked favorites. This post never got linked from anywhere else.</p>' },
    ],
  };
}

// Mirror of the real two-step scheduling flow: a future publishDate yields a
// SCHEDULED post; no date (or a past one) publishes immediately.
const lastInserted = () => ({ id: `fake-post-${seq}` });
function publishPost(blogId, postId, publishDate) {
  const blog = demoBlogs().find((b) => b.id === blogId) || demoBlogs()[0];
  const scheduled = publishDate && new Date(publishDate) > new Date();
  const when = publishDate || new Date().toISOString();
  return {
    kind: 'blogger#post',
    id: postId || lastInserted().id,
    blog: { id: blogId },
    status: scheduled ? 'SCHEDULED' : 'LIVE',
    published: when,
    url: `${blog.url.replace(/\/$/, '')}/2026/11/post-${String(postId || seq).replace(/[^a-z0-9]+/gi, '-')}.html`,
  };
}


// Static pages (About / Privacy / Disclosure). Demo blogs start with none -
// that is the realistic state the monetization kit fixes.
const fakePages = [];
function listPages() {
  return { kind: 'blogger#pageList', items: fakePages.slice() };
}
function insertPage(blogId, payload) {
  seq += 1;
  const blog = demoBlogs().find((b) => b.id === blogId) || demoBlogs()[0];
  const slug = (payload.title || 'page').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'page';
  const page = {
    kind: 'blogger#page',
    id: `fake-page-${seq}`,
    blog: { id: blogId },
    title: payload.title,
    content: payload.content,
    status: 'LIVE',
    url: `${blog.url.replace(/\/$/, '')}/p/${slug}.html`,
  };
  fakePages.push(page);
  return page;
}

module.exports = { demoBlogs, fakeAuthUrl, fakeExchangeCode, fakeUserinfo, insertPost, publishPost, listPosts, listPages, insertPage };
