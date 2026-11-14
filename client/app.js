import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';

const app = document.getElementById('app');
const state = { me: null, blogs: [], posts: [], post: null, editor: null, analyzeTimer: null, saveTimer: null, dirty: false };

// ---------- tiny framework ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

async function api(path, { method = 'GET', body, form } = {}) {
  const opts = { method, headers: {} };
  if (form) opts.body = form;
  else if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const res = await fetch(`/api${path}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.message || data.error || `HTTP ${res.status}`); e.status = res.status; e.data = data; throw e; }
  return data;
}

function toast(msg) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const t = el(`<div class="toast">${esc(msg)}</div>`);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

// ---------- boot ----------
init();
async function init() {
  try {
    state.me = await api('/me');
    renderShell();
    await loadDashboard();
  } catch (e) {
    if (e.status === 401) renderLogin();
    else app.innerHTML = `<div class="loading">Failed to load: ${esc(e.message)}</div>`;
  }
}

function renderLogin() {
  app.innerHTML = '';
  app.appendChild(el(`
    <div class="login-wrap"><div class="login-card">
      <h1>Blogger<span style="color:var(--accent)">SEO</span></h1>
      <p>The smart SEO editor for free .blogspot.com blogs. Write with a live SEO checklist, auto-optimized images, schema injection, and one-click publishing through the Blogger API.</p>
      <button class="btn-primary" id="connect">Connect Google Blogger</button>
      <p class="hint" style="margin-top:1rem">Without Google credentials configured, this runs in demo mode with a simulated Blogger - no real blog is touched.</p>
    </div></div>`));
  document.getElementById('connect').onclick = () => { window.location.href = '/auth/google'; };
}

// ---------- shell ----------
function renderShell() {
  const demo = state.me.provider === 'fake';
  app.innerHTML = '';
  app.appendChild(el(`
    <div>
      <div class="topbar">
        <div class="brand">Blogger<span>SEO</span></div>
        <span class="badge ${demo ? 'demo' : 'live'}">${demo ? 'DEMO MODE' : 'GOOGLE CONNECTED'}</span>
        <span class="badge ${state.me.livePublishingEnabled ? 'live' : 'dry'}">${state.me.livePublishingEnabled ? 'LIVE PUBLISHING' : 'DRY RUN - nothing sent live'}</span>
        <div class="spacer"></div>
        <button class="btn-ghost" id="nav-dash">Dashboard</button>
        <div class="userchip">${esc(state.me.user.name || state.me.user.email)}</div>
        <button class="btn-ghost" id="logout">Sign out</button>
      </div>
      <div class="container" id="view"></div>
    </div>`));
  document.getElementById('logout').onclick = async () => { await api('/logout', { method: 'POST' }).catch(() => {}); location.href = '/'; };
  document.getElementById('nav-dash').onclick = () => loadDashboard();
}
const view = () => document.getElementById('view');

// ---------- dashboard ----------
async function loadDashboard() {
  const [blogs, posts] = await Promise.all([api('/blogs'), api('/posts')]);
  state.blogs = blogs.items || [];
  state.posts = posts.items || [];
  renderDashboard();
}

function renderDashboard() {
  const v = view();
  v.innerHTML = `
    <div class="section-title">Connected blogs</div>
    <div class="blog-grid" id="blogs"></div>
    <div class="section-title">Your drafts & posts</div>
    <div id="posts"></div>
    <div class="section-title">SEO-clean Blogger templates</div>
    <div id="templates"></div>`;
  const blogWrap = v.querySelector('#blogs');
  if (!state.blogs.length) blogWrap.innerHTML = '<div class="empty">No blogs found on this account.</div>';
  for (const b of state.blogs) {
    const card = el(`<div class="blog-card">
      <h3>${esc(b.name)}</h3><div class="url">${esc(b.url || '')}</div>
      <button class="btn-primary">New post</button></div>`);
    card.querySelector('button').onclick = () => newPost(b);
    blogWrap.appendChild(card);
  }
  const postWrap = v.querySelector('#posts');
  if (!state.posts.length) { postWrap.innerHTML = '<div class="empty">No drafts yet - pick a blog above and start writing.</div>'; return; }
  const table = el(`<table class="post-table"><thead><tr>
    <th>Title</th><th>Blog</th><th>Status</th><th>SEO</th><th>Updated</th><th></th></tr></thead><tbody></tbody></table>`);
  const tbody = table.querySelector('tbody');
  for (const p of state.posts) {
    const blogName = (state.blogs.find((b) => String(b.id) === String(p.blogId)) || {}).name || p.blogId;
    const seo = p.seoJson ? JSON.parse(p.seoJson).score : null;
    const tr = el(`<tr>
      <td>${esc(p.title || '(untitled)')}</td><td>${esc(blogName)}</td>
      <td><span class="status ${esc(p.status)}">${esc(p.status.replace('_', ' '))}</span></td>
      <td>${seo === null ? '-' : seo + '/100'}</td>
      <td>${esc((p.updatedAt || '').replace('T', ' ').slice(0, 16))}</td>
      <td><button class="btn-danger" title="Delete">Delete</button></td></tr>`);
    tr.onclick = (e) => { if (e.target.tagName !== 'BUTTON') openEditor(p.id); };
    tr.querySelector('button').onclick = async (e) => {
      e.stopPropagation();
      if (!confirm(`Delete "${p.title || 'untitled'}"? This only removes the local draft.`)) return;
      await api(`/posts/${p.id}`, { method: 'DELETE' });
      loadDashboard();
    };
    tbody.appendChild(tr);
  }
  postWrap.appendChild(table);
  loadTemplates();
}

async function loadTemplates() {
  const wrap = document.getElementById('templates');
  if (!wrap) return;
  try {
    const data = await api('/templates');
    if (!data.items.length) {
      wrap.innerHTML = '<div class="empty">Template library is being curated - fast, mobile-first Blogger themes will appear here.</div>';
      return;
    }
    const grid = el('<div class="blog-grid"></div>');
    for (const t of data.items) {
      const card = el(`<div class="blog-card">
        <h3>${esc(t.name)}</h3><div class="url">${esc(t.description || '')}</div>
        <div class="hint" style="margin-top:0.4rem">v${esc(t.version || '1')} by ${esc(t.author || 'unknown')}</div>
        <div style="display:flex;gap:0.5rem;margin-top:0.7rem">
          <a href="${esc(t.downloadUrl)}" download><button class="btn-primary" ${t.available ? '' : 'disabled'}>Download XML</button></a>
          <button class="btn-ghost">Install steps</button>
        </div></div>`);
      card.querySelector('.btn-ghost').onclick = showInstallSteps;
      grid.appendChild(card);
    }
    wrap.innerHTML = '';
    wrap.appendChild(grid);
  } catch { wrap.innerHTML = '<div class="empty">Could not load templates.</div>'; }
}

async function showInstallSteps() {
  const md = await fetch('/templates/INSTALL.md').then((r) => r.text()).catch(() => 'Install guide unavailable.');
  const modal = el(`<div class="modal-backdrop"><div class="modal">
    <h3>Installing a template</h3>
    <pre style="white-space:pre-wrap">${esc(md)}</pre>
    <div class="row"><button class="btn-ghost" id="close-modal">Close</button></div></div></div>`);
  modal.querySelector('#close-modal').onclick = () => modal.remove();
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  document.body.appendChild(modal);
}

async function newPost(blog) {
  const post = await api('/posts', { method: 'POST', body: { blogId: blog.id, title: '' } });
  openEditor(post.id);
}

// ---------- editor ----------
async function openEditor(id) {
  const post = await api(`/posts/${id}`);
  state.post = post;
  state.dirty = false;
  const v = view();
  v.innerHTML = `
    <div class="editor-layout">
      <div class="editor-main">
        <input class="editor-title" id="f-title" placeholder="Post title - this becomes the H1" value="${esc(post.title)}" />
        <div class="toolbar" id="toolbar"></div>
        <div id="editor"></div>
        <label>Focus keyword</label>
        <input id="f-keyword" placeholder="e.g. mobile photography tips" value="${esc(post.focusKeyword)}" />
        <label>Search description (meta description)</label>
        <textarea id="f-meta" rows="2" placeholder="120-160 characters shown in Google results">${esc(post.metaDescription)}</textarea>
        <label>Labels</label>
        <input id="f-labels" placeholder="Comma separated, e.g. Photography, Guides" value="${esc(JSON.parse(post.labels || '[]').join(', '))}" />
        <div class="publish-bar">
          <button class="btn-primary" id="pub-now">Publish now</button>
          <button class="btn-ghost" id="pub-draft">Save as Blogger draft</button>
          <input type="datetime-local" id="schedule-at" title="Schedule date/time" />
          <button class="btn-ghost" id="pub-schedule">Schedule</button>
          <button class="btn-ghost" id="suggest-links">Suggest links</button>
          <button class="btn-ghost" id="view-payload">View payload</button>
          <span class="save-state" id="save-state"></span>
        </div>
        <div class="hint" style="margin-top:0.5rem" id="pub-hint"></div>
      </div>
      <div class="seo-panel">
        <div class="seo-score" id="seo-score"></div>
        <div id="seo-checks"></div>
        <div class="section-title" style="margin-top:1rem">Keyword ideas</div>
        <button class="btn-ghost" id="kw-ideas" style="width:100%">Get ideas for focus keyword</button>
        <div id="kw-list"></div>
      </div>
    </div>`;

  document.getElementById('pub-hint').textContent = state.me.livePublishingEnabled
    ? 'LIVE publishing is enabled: Publish now posts directly to your Blogger blog.'
    : state.me.provider === 'fake'
      ? 'Demo mode: publishing simulates the Blogger API - you can review the exact payload that would be sent.'
      : 'Dry run: the full Blogger payload is built and stored for review, but nothing is sent (set PUBLISH_MODE=live to enable).';

  buildToolbar();
  state.editor = new Editor({
    element: document.getElementById('editor'),
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] } }),
      Image.configure({ inline: false }),
      Placeholder.configure({ placeholder: 'Start writing... drop images anywhere. H2/H3 subheadings, links and lists all count toward your SEO score.' }),
    ],
    content: post.html || '',
    onUpdate: () => { markDirty(); scheduleAnalyze(); refreshToolbar(); },
    onSelectionUpdate: refreshToolbar,
    editorProps: {
      handleDrop: (view, event) => {
        const file = event.dataTransfer && [...event.dataTransfer.files].find((f) => f.type.startsWith('image/'));
        if (file) { event.preventDefault(); uploadImage(file); return true; }
        return false;
      },
      handlePaste: (view, event) => {
        const file = event.clipboardData && [...event.clipboardData.files].find((f) => f.type.startsWith('image/'));
        if (file) { uploadImage(file); return true; }
        return false;
      },
    },
  });

  ['f-title', 'f-keyword', 'f-meta', 'f-labels'].forEach((fid) => {
    document.getElementById(fid).addEventListener('input', () => { markDirty(); scheduleAnalyze(); });
  });

  document.getElementById('pub-now').onclick = () => publish('publish');
  document.getElementById('pub-draft').onclick = () => publish('draft');
  document.getElementById('pub-schedule').onclick = () => {
    const when = document.getElementById('schedule-at').value;
    if (!when) return toast('Pick a date/time to schedule first');
    publish('schedule', when);
  };
  document.getElementById('view-payload').onclick = showPayload;
  document.getElementById('suggest-links').onclick = suggestLinks;
  document.getElementById('kw-ideas').onclick = keywordIdeas;

  analyze();
}

function buildToolbar() {
  const bar = document.getElementById('toolbar');
  const items = [
    ['Bold', (e) => e.chain().focus().toggleBold().run(), (e) => e.isActive('bold')],
    ['Italic', (e) => e.chain().focus().toggleItalic().run(), (e) => e.isActive('italic')],
    ['H2', (e) => e.chain().focus().toggleHeading({ level: 2 }).run(), (e) => e.isActive('heading', { level: 2 })],
    ['H3', (e) => e.chain().focus().toggleHeading({ level: 3 }).run(), (e) => e.isActive('heading', { level: 3 })],
    ['Quote', (e) => e.chain().focus().toggleBlockquote().run(), (e) => e.isActive('blockquote')],
    ['List', (e) => e.chain().focus().toggleBulletList().run(), (e) => e.isActive('bulletList')],
    ['1. List', (e) => e.chain().focus().toggleOrderedList().run(), (e) => e.isActive('orderedList')],
    ['Link', setLink, (e) => e.isActive('link')],
    ['Image', pickImage, () => false],
  ];
  bar.innerHTML = '';
  for (const [label, run, active] of items) {
    const b = el(`<button type="button">${esc(label)}</button>`);
    b._activeFn = active;
    b.onclick = (ev) => { ev.preventDefault(); run(state.editor); refreshToolbar(); };
    bar.appendChild(b);
  }
}
function refreshToolbar() {
  const bar = document.getElementById('toolbar');
  if (!bar || !state.editor) return;
  bar.querySelectorAll('button').forEach((b) => {
    try { b.classList.toggle('active', !!(b._activeFn && b._activeFn(state.editor))); } catch { /* noop */ }
  });
}

function setLink(editor) {
  const prev = editor.getAttributes('link').href || '';
  const url = prompt('Link URL (https://...)', prev);
  if (url === null) return;
  if (url === '') editor.chain().focus().unsetLink().run();
  else editor.chain().focus().setLink({ href: url }).run();
}
function pickImage() {
  const input = el('<input type="file" accept="image/*" style="display:none" />');
  document.body.appendChild(input);
  input.onchange = () => { if (input.files[0]) uploadImage(input.files[0]); input.remove(); };
  input.click();
}

async function uploadImage(file) {
  const alt = prompt('Describe this image for alt text (SEO + accessibility):', file.name.replace(/\.[a-z]+$/i, '').replace(/[-_]+/g, ' '));
  if (alt === null) return;
  toast('Compressing and uploading image...');
  const form = new FormData();
  form.append('image', file);
  form.append('alt', alt);
  try {
    const img = await api('/images', { method: 'POST', form });
    state.editor.chain().focus().insertContent(img.html + '<p></p>').run();
    const saved = Math.max(0, 100 - Math.round((img.variants.reduce((a, v) => a + v.bytes, 0) / Math.max(1, img.bytesIn)) * 100));
    toast(`Image optimized to WebP (${saved}% smaller) and inserted responsively.`);
  } catch (e) {
    toast(`Image upload failed: ${e.message}`);
  }
}

// ---------- SEO panel ----------
function currentFields() {
  return {
    title: document.getElementById('f-title')?.value || '',
    html: state.editor ? state.editor.getHTML() : '',
    metaDescription: document.getElementById('f-meta')?.value || '',
    focusKeyword: document.getElementById('f-keyword')?.value || '',
    blogId: state.post?.blogId,
    labels: (document.getElementById('f-labels')?.value || '').split(',').map((s) => s.trim()).filter(Boolean),
  };
}
function scheduleAnalyze() {
  clearTimeout(state.analyzeTimer);
  state.analyzeTimer = setTimeout(analyze, 300);
}
async function analyze() {
  const f = currentFields();
  const res = await api('/seo/analyze', { method: 'POST', body: f });
  renderSeo(res);
}
function renderSeo({ score, checks, stats }) {
  const wrap = document.getElementById('seo-score');
  const color = score >= 80 ? 'var(--pass)' : score >= 55 ? 'var(--warn)' : 'var(--fail)';
  const R = 24, C = 2 * Math.PI * R;
  wrap.innerHTML = `
    <svg class="score-ring" viewBox="0 0 58 58">
      <circle class="bg" cx="29" cy="29" r="${R}"></circle>
      <circle class="fg" cx="29" cy="29" r="${R}" stroke="${color}" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - score / 100)}"></circle>
    </svg>
    <div><div class="score-num" style="color:${color}">${score}</div><div class="hint">SEO score</div></div>
    <div class="hint" style="margin-left:auto;text-align:right">${stats.wordCount} words<br>${stats.images} images<br>${stats.internalLinks} int links</div>`;
  const list = document.getElementById('seo-checks');
  list.innerHTML = '';
  for (const c of checks) {
    list.appendChild(el(`<div class="check"><span class="dot ${c.status}"></span>
      <div><div class="label">${esc(c.label)}</div><div class="detail">${esc(c.detail)}</div></div></div>`));
  }
}

async function keywordIdeas() {
  const seed = document.getElementById('f-keyword').value.trim() || document.getElementById('f-title').value.trim();
  if (!seed) return toast('Set a focus keyword or title first');
  const list = document.getElementById('kw-list');
  list.innerHTML = '<div class="hint" style="padding:0.4rem 0">Thinking...</div>';
  try {
    const data = await api(`/keywords/suggest?q=${encodeURIComponent(seed)}`);
    if (!data.suggestions.length) { list.innerHTML = '<div class="hint" style="padding:0.4rem 0">No ideas found for that seed.</div>'; return; }
    list.innerHTML = '';
    for (const s of data.suggestions.slice(0, 12)) {
      const item = el(`<div class="check" style="cursor:pointer"><span class="dot pass"></span>
        <div><div class="label" style="font-weight:500">${esc(s.keyword)}</div>
        <div class="detail">${esc(s.source)}${s.score != null ? ' - difficulty ' + s.score : ''}</div></div></div>`);
      item.onclick = () => {
        document.getElementById('f-keyword').value = s.keyword;
        markDirty(); scheduleAnalyze();
        toast(`Focus keyword set to "${s.keyword}"`);
      };
      list.appendChild(item);
    }
  } catch (e) { list.innerHTML = `<div class="hint" style="padding:0.4rem 0">Keyword provider error: ${esc(e.message)}</div>`; }
}

async function suggestLinks() {
  await save();
  try {
    const data = await api('/links/suggest', { method: 'POST', body: { blogId: state.post.blogId, html: state.editor.getHTML() } });
    const modal = el(`<div class="modal-backdrop"><div class="modal">
      <h3>Internal link suggestions</h3>
      <p class="hint">Older posts on this blog that match what you're writing. Insert as a link to fix orphaned pages.</p>
      <div id="link-list"></div>
      <div class="row"><button class="btn-ghost" id="close-modal">Close</button></div></div></div>`);
    const list = modal.querySelector('#link-list');
    if (!data.suggestions.length) list.innerHTML = '<div class="empty">No strong matches yet - write more body text or publish more posts first.</div>';
    for (const sug of data.suggestions) {
      const row = el(`<div class="check"><span class="dot pass"></span>
        <div style="flex:1"><div class="label">${esc(sug.title)}</div>
        <div class="detail">${esc(sug.url)} - ${sug.score}% match</div></div>
        <button class="btn-primary" style="flex-shrink:0">Insert link</button></div>`);
      row.querySelector('button').onclick = () => {
        state.editor.chain().focus().insertContent(`<a href="${sug.url}">${sug.anchor}</a> `).run();
        modal.remove();
        toast('Internal link inserted');
      };
      list.appendChild(row);
    }
    modal.querySelector('#close-modal').onclick = () => modal.remove();
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    document.body.appendChild(modal);
  } catch (e) { toast(`Link suggestions failed: ${e.message}`); }
}

// ---------- saving + publishing ----------
function markDirty() {
  state.dirty = true;
  clearTimeout(state.saveTimer);
  const s = document.getElementById('save-state');
  if (s) s.textContent = 'Saving...';
  state.saveTimer = setTimeout(save, 1200);
}
async function save() {
  if (!state.dirty || !state.post) return;
  const f = currentFields();
  const saved = await api(`/posts/${state.post.id}`, { method: 'PUT', body: f });
  state.post = saved;
  state.dirty = false;
  const s = document.getElementById('save-state');
  if (s) s.textContent = `Saved ${new Date().toLocaleTimeString()}`;
}

async function publish(mode, when) {
  await save();
  if (!confirm(confirmText(mode))) return;
  try {
    const res = await api(`/posts/${state.post.id}/publish`, { method: 'POST', body: { mode, scheduledAt: when } });
    if (res.dryRun) {
      toast('Dry run complete - payload built, nothing sent. Use View payload to inspect it.');
    } else if (res.result && res.result.url) {
      toast(`Published: ${res.result.url}`);
    } else {
      toast(mode === 'draft' ? 'Saved as a Blogger draft.' : `Status: ${res.status}`);
    }
    renderSeo(res.seo);
    state.post.status = res.status;
  } catch (e) {
    toast(`Publish failed: ${e.message}`);
  }
}
function confirmText(mode) {
  if (mode === 'draft') return 'Save this post as a draft on Blogger?';
  if (mode === 'schedule') return 'Schedule this post on Blogger for the selected time?';
  return state.me.livePublishingEnabled
    ? 'Publish NOW to your live blog? This will be publicly visible.'
    : 'Build the publish payload now? (Dry run - nothing is sent to Blogger.)';
}

async function showPayload() {
  await save();
  let data = await api(`/posts/${state.post.id}/payload`);
  if (!data) {
    await api(`/posts/${state.post.id}/publish`, { method: 'POST', body: { mode: 'draft' } }).catch(() => {});
    data = await api(`/posts/${state.post.id}/payload`);
  }
  const modal = el(`<div class="modal-backdrop"><div class="modal">
    <h3>Exact Blogger API payload</h3>
    <p class="hint">This JSON is what goes to <code>POST /blogger/v3/blogs/{blogId}/posts/</code> - including the injected JSON-LD Article schema and canonical tag.</p>
    <pre>${esc(JSON.stringify(data.payload || data, null, 2))}</pre>
    <div class="row"><button class="btn-ghost" id="close-modal">Close</button></div>
  </div></div>`);
  modal.querySelector('#close-modal').onclick = () => modal.remove();
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  document.body.appendChild(modal);
}
