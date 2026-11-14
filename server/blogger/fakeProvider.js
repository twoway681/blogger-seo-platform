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
      { id: 'fake-post-901', blog: { id: blog.id }, title: 'Welcome to my blog', url: `${blog.url}/2026/10/welcome-to-my-blog.html`, published: '2026-10-02T09:00:00.000Z' },
      { id: 'fake-post-902', blog: { id: blog.id }, title: 'Beginner mistakes I made', url: `${blog.url}/2026/10/beginner-mistakes.html`, published: '2026-10-20T15:30:00.000Z' },
    ],
  };
}

module.exports = { demoBlogs, fakeAuthUrl, fakeExchangeCode, fakeUserinfo, insertPost, listPosts };
