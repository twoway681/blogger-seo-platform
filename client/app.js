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
      <img class="logo" src="/logo.svg" alt="Blogsmith logo" />
      <h1>Blogsmith</h1>
      <p class="tagline">The SEO studio for Blogger.</p>
      <div class="login-feats">
        <div class="feat"><span class="tick">&#10003;</span>Live SEO checklist while you write, score included</div>
        <div class="feat"><span class="tick">&#10003;</span>Images auto-compressed to fast WebP with responsive markup</div>
        <div class="feat"><span class="tick">&#10003;</span>Article schema and canonical tags injected on publish</div>
        <div class="feat"><span class="tick">&#10003;</span>One-click publishing, scheduling and social repurposing</div>
      </div>
      <button class="btn-primary" id="connect">Connect Google Blogger</button>
      <p class="fine">Made for blogs on Blogger. Without Google credentials configured, Blogsmith runs in demo mode with a simulated Blogger - no real blog is touched.</p>
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
        <div class="brand"><img src="/logo.svg" alt="Blogsmith logo" />Blogsmith</div>
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
  const onFreeSubdomain = state.blogs.some((b) => /\.blogspot\.com\/?$/i.test(String(b.url || '')));
  v.innerHTML = `
    ${onFreeSubdomain ? `<div class="notice" id="domain-nudge">
      <div class="icon">&#9888;</div>
      <div>
        <h3>Your blog is on a free .blogspot.com subdomain - the #1 Blogger SEO mistake</h3>
        <p>Free subdomains earn Google's trust slowly and look less credible to readers and AI answers. A custom domain (about $10-12/year) is the single highest-impact upgrade for a Blogger blog.</p>
        <ol>
          <li>Buy a domain - Cloudflare Registrar sells at cost with free DNS (no markup renewals); any registrar works.</li>
          <li>In Blogger: <strong>Settings &gt; Publishing &gt; Custom domain</strong>, enter your new domain.</li>
          <li>Add the two CNAME records Blogger shows you at your DNS provider, wait a few minutes, retry.</li>
          <li>Turn on <strong>HTTPS availability + HTTPS redirect</strong> in the same settings page.</li>
        </ol>
        <p class="hint">Your posts, SEO scores and Search Console setup carry over - this platform works the same either way, and the sitemap resubmits itself on the next publish.</p>
      </div></div>` : ''}
    <div class="section-title">Connected blogs</div>
    <div class="blog-grid" id="blogs"></div>
    <div class="section-title">Your drafts & posts <button class="btn-ghost" id="batch-publish" style="float:right;display:none">Publish selected</button></div>
    <div id="posts"></div>
    <div class="section-title">Content refresh queue</div>
    <div id="refresh"></div>
    <div class="section-title">Search traffic (last 28 days)</div>
    <div id="traffic"></div>
    <div class="section-title">SEO-clean Blogger templates</div>
    <div id="templates"></div>`;
  const blogWrap = v.querySelector('#blogs');
  if (!state.blogs.length) blogWrap.innerHTML = '<div class="empty">No blogs found on this account.</div>';
  for (const b of state.blogs) {
    const card = el(`<div class="blog-card">
      <h3>${esc(b.name)}</h3><div class="url">${esc(b.url || '')}</div>
      <div class="hint sc-status" style="margin-top:0.5rem">Search Console: ...</div>
      <div style="display:flex;gap:0.5rem;margin-top:0.7rem">
        <button class="btn-primary">New post</button>
        <button class="btn-ghost sc-setup">Set up Search Console</button>
        <button class="btn-ghost llms-btn">llms.txt</button>
      </div></div>`);
    card.querySelector('.btn-primary').onclick = () => newPost(b);
    card.querySelector('.llms-btn').onclick = () => showLlmsTxt(b);
    const statusEl = card.querySelector('.sc-status');
    const refreshSc = async () => {
      try {
        const scs = await api(`/searchconsole/${b.id}`);
        statusEl.textContent = scs.status === 'verified'
          ? `Search Console: verified - sitemap submitted ${scs.sitemapSubmittedAt || ''}`
          : scs.status === 'error' ? `Search Console: setup error` : 'Search Console: not set up';
        card.querySelector('.sc-setup').style.display = scs.status === 'verified' ? 'none' : '';
      } catch { statusEl.textContent = 'Search Console: status unavailable'; }
    };
    refreshSc();
    card.querySelector('.sc-setup').onclick = async () => {
      statusEl.textContent = 'Search Console: verifying + submitting sitemap...';
      try {
        const r = await api(`/searchconsole/${b.id}/setup`, { method: 'POST', body: {} });
        toast(`Search Console ready - sitemap submitted: ${r.sitemapUrl}`);
      } catch (e) { toast(`Setup failed: ${e.message}`); }
      refreshSc();
    };
    blogWrap.appendChild(card);
  }
  const postWrap = v.querySelector('#posts');
  if (!state.posts.length) { postWrap.innerHTML = '<div class="empty">No drafts yet - pick a blog above and start writing.</div>'; return; }
  const table = el(`<table class="post-table"><thead><tr>
    <th></th><th>Title</th><th>Blog</th><th>Status</th><th>SEO</th><th>Updated</th><th></th></tr></thead><tbody></tbody></table>`);
  const tbody = table.querySelector('tbody');
  for (const p of state.posts) {
    const blogName = (state.blogs.find((b) => String(b.id) === String(p.blogId)) || {}).name || p.blogId;
    const seo = p.seoJson ? JSON.parse(p.seoJson).score : null;
    const tr = el(`<tr>
      <td onclick="event.stopPropagation()"><input type="checkbox" class="rowpick" value="${esc(p.id)}" title="Select for batch publish" /></td>
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
  const batchBtn = document.getElementById('batch-publish');
  const refreshBatchBtn = () => {
    const n = table.querySelectorAll('.rowpick:checked').length;
    batchBtn.style.display = n ? '' : 'none';
    batchBtn.textContent = n > 1 ? `Publish ${n} selected` : 'Publish selected';
  };
  table.querySelectorAll('.rowpick').forEach((cb) => { cb.onchange = refreshBatchBtn; });
  batchBtn.onclick = async () => {
    const ids = [...table.querySelectorAll('.rowpick:checked')].map((cb) => cb.value);
    if (!ids.length) return;
    batchBtn.disabled = true;
    try {
      const r = await api('/posts/batch/publish', { method: 'POST', body: { ids } });
      const okCount = r.results.filter((x) => x.ok).length;
      toast(r.ok ? `Published ${okCount} post${okCount === 1 ? '' : 's'}` : `Published ${okCount}/${ids.length} - check failures`);
    } catch (e) { toast(`Batch publish failed: ${e.message}`); }
    loadDashboard();
  };
  loadTemplates();
  loadRefreshQueue();
  loadTraffic();
}

// Content refresh queue: AI citations decay in about a month - old live posts
// get flagged here, and one click re-publishes (fresh sitemap hint + new date).
async function loadRefreshQueue() {
  const wrap = document.getElementById('refresh');
  if (!wrap) return;
  try {
    const data = await api('/refresh-queue');
    if (!data.items.length) {
      wrap.innerHTML = `<div class="empty">Nothing stale. Live posts older than ${data.refreshAfterDays} days without an update will appear here - freshness is the one signal AI engines and Google both reward.</div>`;
      return;
    }
    const table = el(`<table class="post-table"><thead><tr>
      <th>Post</th><th>Stale for</th><th></th></tr></thead><tbody></tbody></table>`);
    const tbody = table.querySelector('tbody');
    for (const p of data.items) {
      const tr = el(`<tr>
        <td>${esc(p.title || '(untitled)')}</td>
        <td><span class="status scheduled">${p.daysSinceUpdate} days</span></td>
        <td style="white-space:nowrap"><button class="btn-primary">Refresh now</button> <button class="btn-ghost">Open</button></td></tr>`);
      const [refreshBtn, openBtn] = tr.querySelectorAll('button');
      refreshBtn.onclick = async () => {
        refreshBtn.disabled = true;
        try {
          await api(`/posts/${p.id}/publish`, { method: 'POST', body: { mode: 'publish' } });
          toast(`Refreshed: ${p.title || 'post'} re-published with a fresh date`);
        } catch (e) { toast(`Refresh failed: ${e.message}`); }
        loadDashboard();
      };
      openBtn.onclick = () => openEditor(p.id);
      tbody.appendChild(tr);
    }
    wrap.innerHTML = '';
    wrap.appendChild(table);
  } catch { wrap.innerHTML = '<div class="empty">Could not load the refresh queue.</div>'; }
}

// Search traffic: observed Search Console performance matched to posts.
async function loadTraffic() {
  const wrap = document.getElementById('traffic');
  if (!wrap) return;
  const blocks = [];
  for (const b of state.blogs) {
    try {
      const data = await api(`/searchconsole/${b.id}/performance`);
      if (!data.items.length) continue;
      blocks.push({ blog: b, items: data.items });
    } catch { /* blog without SC access is skipped */ }
  }
  if (!blocks.length) {
    wrap.innerHTML = '<div class="empty">Publish a post and its real clicks, impressions and average position will appear here (observed Search Console data).</div>';
    return;
  }
  wrap.innerHTML = '';
  for (const { blog, items } of blocks) {
    const table = el(`<table class="post-table" style="margin-bottom:1rem"><thead><tr>
      <th>${esc(blog.name || 'Blog')}</th><th>Clicks</th><th>Impressions</th><th>CTR</th><th>Avg position</th></tr></thead><tbody></tbody></table>`);
    const tbody = table.querySelector('tbody');
    for (const it of items.slice(0, 10)) {
      tbody.appendChild(el(`<tr>
        <td>${esc(it.title)}</td><td>${it.clicks}</td><td>${it.impressions}</td>
        <td>${it.ctr}%</td><td>${it.position === null ? '-' : it.position}</td></tr>`));
    }
    wrap.appendChild(table);
  }
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
      card.querySelector('.btn-ghost').onclick = () => showInstallSteps(t.guide ? `/templates/${t.guide}` : data.installGuideUrl);
      grid.appendChild(card);
    }
    wrap.innerHTML = '';
    wrap.appendChild(grid);
  } catch { wrap.innerHTML = '<div class="empty">Could not load templates.</div>'; }
}

async function showLlmsTxt(blog) {
  const modal = el(`<div class="modal-backdrop"><div class="modal">
    <h3>llms.txt - ${esc(blog.name || 'blog')}</h3>
    <p class="hint">A standard file that describes this blog to AI crawlers (ChatGPT, Gemini, Claude, Perplexity), generated live from your published posts. Honest expectation: studies find most llms.txt files get few or no crawler requests yet - treat it as a free maybe, not a traffic driver. Blogger can't host root files, so serve it from wherever Blogsmith is deployed, or paste it into any static host.</p>
    <pre style="white-space:pre-wrap" id="llms-body">Loading...</pre>
    <div class="row">
      <button class="btn-ghost" id="llms-copy">Copy</button>
      <button class="btn-primary" id="llms-dl">Download llms.txt</button>
      <button class="btn-ghost" id="close-modal">Close</button>
    </div></div></div>`);
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.querySelector('#close-modal').onclick = close;
  modal.onclick = (e) => { if (e.target === modal) close(); };
  let text = '';
  try {
    const res = await fetch(`/api/blogs/${encodeURIComponent(blog.id)}/llms.txt`);
    text = await res.text();
    if (!res.ok) throw new Error(text);
  } catch (e) { text = `Could not generate llms.txt: ${e.message}`; }
  modal.querySelector('#llms-body').textContent = text;
  modal.querySelector('#llms-copy').onclick = async () => { try { await navigator.clipboard.writeText(text); toast('llms.txt copied'); } catch { toast('Copy failed - select the text manually'); } };
  modal.querySelector('#llms-dl').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = 'llms.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  };
}

async function showInstallSteps(url) {
  const md = await fetch(url || '/templates/INSTALL.md').then((r) => r.text()).catch(() => 'Install guide unavailable.');
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
          <button class="btn-ghost" id="qa-suggest">Suggest Q&amp;A block</button>
          <button class="btn-ghost" id="repurpose">Repurpose for social</button>
          <button class="btn-ghost" id="view-payload">View payload</button>
          <span class="save-state" id="save-state"></span>
        </div>
        <div class="hint" style="margin-top:0.5rem" id="pub-hint"></div>
      </div>
      <div class="seo-panel">
        <div class="seo-score" id="seo-score"></div>
        <div id="seo-checks"></div>
        <div class="section-title" style="margin-top:1rem">Writing quality</div>
        <div id="lint-list"></div>
        <div class="section-title" style="margin-top:1rem">Keyword ideas</div>
        <button class="btn-ghost" id="kw-ideas" style="width:100%">Get ideas for focus keyword</button>
        <button class="btn-ghost" id="kw-research" style="width:100%;margin-top:0.4rem">Deep research (scored, slower)</button>
        <button class="btn-ghost" id="kw-questions" style="width:100%;margin-top:0.4rem">Find questions people ask</button>
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
  document.getElementById('qa-suggest').onclick = qaSuggest;
  document.getElementById('repurpose').onclick = repurposeModal;
  document.getElementById('kw-ideas').onclick = keywordIdeas;
  document.getElementById('kw-research').onclick = keywordResearch;
  document.getElementById('kw-questions').onclick = questionIdeas;

  analyze();
  lint();
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
    ['Stock photo', stockPicker, () => false],
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

// ---------- stock photo picker ----------
function stockPicker() {
  const modal = el(`<div class="modal-backdrop"><div class="modal modal-wide">
    <h3>Stock photos</h3>
    <p class="hint" id="stock-provider-hint"></p>
    <div class="row" style="margin-bottom:0.8rem">
      <input id="stock-q" placeholder="Search photos, e.g. misty forest hike" style="flex:1" value="${esc(document.getElementById('f-keyword').value.trim() || document.getElementById('f-title').value.trim())}" />
      <button class="btn-primary" id="stock-go">Search</button>
      <button class="btn-ghost" id="close-modal">Close</button>
    </div>
    <div id="stock-grid"><div class="hint" style="padding:0.4rem 0">Search to see photos. Alt text is written automatically from the photo description and inserted with the image.</div></div>
  </div></div>`);
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.querySelector('#close-modal').onclick = close;
  modal.onclick = (e) => { if (e.target === modal) close(); };
  const grid = modal.querySelector('#stock-grid');
  const search = async () => {
    const q = modal.querySelector('#stock-q').value.trim();
    if (!q) return toast('Type what the photo should show');
    grid.innerHTML = '<div class="hint" style="padding:0.4rem 0">Searching...</div>';
    try {
      const data = await api(`/stock/search?q=${encodeURIComponent(q)}`);
      modal.querySelector('#stock-provider-hint').textContent = data.provider === 'demo'
        ? 'Demo placeholders - add a free Unsplash or Pexels API key in .env to search real photos (see README). The picker, alt text and optimization work identically either way.'
        : `Photos by ${data.provider === 'unsplash' ? 'Unsplash' : 'Pexels'} (your own free API key). Photographer credit is kept with the image.`;
      grid.innerHTML = '';
      if (!data.results.length) { grid.innerHTML = '<div class="empty">No photos found - try different words.</div>'; return; }
      const tiles = el('<div class="stock-grid"></div>');
      for (const photo of data.results) {
        const tile = el(`<div class="stock-tile">
          <img src="${esc(photo.previewUrl || '')}" alt="${esc(photo.altText)}" loading="lazy" />
          <div class="stock-alt">${esc(photo.altText)}</div>
        </div>`);
        tile.onclick = () => pickStockPhoto(modal, photo);
        tiles.appendChild(tile);
      }
      grid.appendChild(tiles);
    } catch (e) { grid.innerHTML = `<div class="hint" style="padding:0.4rem 0">Stock search failed: ${esc(e.message)}</div>`; }
  };
  modal.querySelector('#stock-go').onclick = search;
  modal.querySelector('#stock-q').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } };
  if (modal.querySelector('#stock-q').value.trim()) search();
}

function pickStockPhoto(modal, photo) {
  const grid = modal.querySelector('#stock-grid');
  grid.innerHTML = `<div class="stock-picked">
    <img src="${esc(photo.previewUrl || '')}" alt="${esc(photo.altText)}" />
    <label>Alt text (auto-written - edit freely)</label>
    <input id="stock-alt" value="${esc(photo.altText)}" />
    ${photo.credit ? `<div class="hint">Photo: ${esc(photo.credit)}</div>` : ''}
    <div class="row">
      <button class="btn-primary" id="stock-insert">Optimize &amp; insert</button>
      <button class="btn-ghost" id="stock-back">Back</button>
    </div></div>`;
  grid.querySelector('#stock-back').onclick = () => modal.querySelector('#stock-go').onclick();
  grid.querySelector('#stock-insert').onclick = async () => {
    const alt = grid.querySelector('#stock-alt').value.trim();
    toast('Downloading and optimizing photo...');
    try {
      const img = await api('/stock/insert', { method: 'POST', body: { photo, alt } });
      state.editor.chain().focus().insertContent(img.html + '<p></p>').run();
      markDirty(); scheduleAnalyze();
      const saved = Math.max(0, 100 - Math.round((img.variants.reduce((a, v) => a + v.bytes, 0) / Math.max(1, img.bytesIn)) * 100));
      toast(`Photo optimized to WebP (${saved}% smaller) and inserted with alt text.`);
      modal.remove();
    } catch (e) { toast(`Insert failed: ${e.message}`); }
  };
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
  state.analyzeTimer = setTimeout(() => { analyze(); lint(); }, 300);
}
async function lint() {
  const f = currentFields();
  const list = document.getElementById('lint-list');
  if (!list) return;
  if (!f.html || f.html.replace(/<[^>]+>/g, '').trim().split(/\s+/).filter(Boolean).length < 20) {
    list.innerHTML = '<div class="hint" style="padding:0.2rem 0">Write a bit more body text - local readability and grammar checks appear here. No external API, everything runs on your own text.</div>';
    return;
  }
  try {
    const data = await api('/seo/lint', { method: 'POST', body: { title: f.title, html: f.html } });
    list.innerHTML = '';
    if (!data.issues.length) {
      list.appendChild(el(`<div class="check"><span class="dot pass"></span>
        <div><div class="label">Clean writing</div><div class="detail">No readability or grammar issues found in ${data.stats.sentences} sentences.</div></div></div>`));
      return;
    }
    for (const issue of data.issues) {
      list.appendChild(el(`<div class="check"><span class="dot ${issue.severity === 'fail' ? 'fail' : 'warn'}"></span>
        <div><div class="label">${esc(issue.label)}</div><div class="detail">${esc(issue.detail)}</div></div></div>`));
    }
  } catch { list.innerHTML = '<div class="hint" style="padding:0.2rem 0">Writing lint unavailable.</div>'; }
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
  const GROUPS = [
    ['Foundations', ['title-length', 'word-count', 'h1-count', 'h2-usage', 'readability']],
    ['Focus keyword', ['focus-keyword', 'kw-title', 'kw-intro', 'kw-heading', 'kw-meta', 'kw-density']],
    ['Meta & snippet', ['meta-length']],
    ['Images', ['images', 'img-alt', 'img-responsive']],
    ['Links', ['internal-links', 'external-links']],
    ['AI search (GEO)', ['geo-answer-first', 'geo-question-headings', 'geo-freshness']],
  ];
  const byId = new Map(checks.map((c) => [c.id, c]));
  const seen = new Set();
  const renderCheck = (c) => {
    seen.add(c.id);
    list.appendChild(el(`<div class="check"><span class="dot ${c.status}"></span>
      <div><div class="label">${esc(c.label)}</div><div class="detail">${esc(c.detail)}</div></div></div>`));
  };
  for (const [name, ids] of GROUPS) {
    const group = ids.map((id) => byId.get(id)).filter(Boolean);
    if (!group.length) continue;
    const passing = group.filter((c) => c.status === 'pass').length;
    list.appendChild(el(`<div class="check-group-title"><span>${esc(name)}</span><span class="count">${passing}/${group.length}</span></div>`));
    group.forEach(renderCheck);
  }
  const rest = checks.filter((c) => !seen.has(c.id));
  if (rest.length) {
    list.appendChild(el(`<div class="check-group-title"><span>Other</span></div>`));
    rest.forEach(renderCheck);
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
        <div class="detail">${esc(s.source)}${s.score != null ? ' - opportunity ' + s.score + '/100' : ''}</div></div></div>`);
      item.onclick = () => {
        document.getElementById('f-keyword').value = s.keyword;
        markDirty(); scheduleAnalyze();
        toast(`Focus keyword set to "${s.keyword}"`);
      };
      list.appendChild(item);
    }
  } catch (e) { list.innerHTML = `<div class="hint" style="padding:0.4rem 0">Keyword provider error: ${esc(e.message)}</div>`; }
}

// Question mining: the exact phrasing people ask Google and AI engines, with a
// coverage badge showing whether an existing post already answers it.
async function questionIdeas() {
  const seed = document.getElementById('f-keyword').value.trim() || document.getElementById('f-title').value.trim();
  if (!seed) return toast('Set a focus keyword or title first');
  const list = document.getElementById('kw-list');
  list.innerHTML = '<div class="hint" style="padding:0.4rem 0">Mining question phrasing...</div>';
  try {
    const data = await api(`/keywords/questions?q=${encodeURIComponent(seed)}`);
    if (!data.questions.length) { list.innerHTML = '<div class="hint" style="padding:0.4rem 0">No question phrasing found for that seed.</div>'; return; }
    list.innerHTML = '';
    for (const q of data.questions.slice(0, 15)) {
      const covered = Boolean(q.coveredBy);
      const item = el(`<div class="check" style="cursor:pointer"><span class="dot ${covered ? 'pass' : 'warn'}"></span>
        <div><div class="label" style="font-weight:500">${esc(q.question)}</div>
        <div class="detail">${covered ? `Covered by "${esc(q.coveredBy)}"` : 'No post answers this yet - strong candidate'}</div></div></div>`);
      item.onclick = () => {
        document.getElementById('f-keyword').value = q.question;
        markDirty(); scheduleAnalyze();
        toast(`Focus keyword set to "${q.question}"`);
      };
      list.appendChild(item);
    }
  } catch (e) { list.innerHTML = `<div class="hint" style="padding:0.4rem 0">Question mining failed: ${esc(e.message)}</div>`; }
}

async function keywordResearch() {
  const seed = document.getElementById('f-keyword').value.trim() || document.getElementById('f-title').value.trim();
  if (!seed) return toast('Set a focus keyword or title first');
  const list = document.getElementById('kw-list');
  list.innerHTML = '<div class="hint" style="padding:0.4rem 0">Researching across ~50 query variations - takes up to a minute...</div>';
  try {
    const data = await api(`/keywords/research?q=${encodeURIComponent(seed)}`);
    if (!data.results.length) { list.innerHTML = '<div class="hint" style="padding:0.4rem 0">No opportunities found for that seed.</div>'; return; }
    list.innerHTML = '';
    for (const r of data.results.slice(0, 15)) {
      const color = r.score >= 60 ? 'pass' : r.score >= 35 ? 'warn' : 'fail';
      const item = el(`<div class="check" style="cursor:pointer"><span class="dot ${color}"></span>
        <div><div class="label" style="font-weight:500">${esc(r.keyword)} <span class="hint">(${r.score})</span></div>
        <div class="detail">${esc((r.reasons || []).slice(0, 2).join('; '))}</div></div></div>`);
      item.onclick = () => {
        document.getElementById('f-keyword').value = r.keyword;
        markDirty(); scheduleAnalyze();
        toast(`Focus keyword set to "${r.keyword}"`);
      };
      list.appendChild(item);
    }
  } catch (e) { list.innerHTML = `<div class="hint" style="padding:0.4rem 0">Research failed: ${esc(e.message)}</div>`; }
}

async function qaSuggest() {
  const f = currentFields();
  if (!f.html || f.html.replace(/<[^>]+>/g, '').trim().split(/\s+/).length < 30) return toast('Write a bit more body text first');
  const modal = el(`<div class="modal-backdrop"><div class="modal">
    <h3>Q&amp;A block - how readers ask AI</h3>
    <p class="hint">Question-and-answer pairs written from your own sections, phrased the way people ask ChatGPT and Gemini. Inserted as visible content (no FAQ schema - Google retired it). Readers and featured snippets benefit directly; recent studies are mixed on whether Q&amp;A blocks earn AI citations, so write them for readers first.</p>
    <div id="qa-list"><div class="hint" style="padding:0.4rem 0">Thinking...</div></div>
    <div class="row">
      <button class="btn-primary" id="qa-insert" disabled>Insert at end of post</button>
      <button class="btn-ghost" id="close-modal">Close</button>
    </div></div></div>`);
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.querySelector('#close-modal').onclick = close;
  modal.onclick = (e) => { if (e.target === modal) close(); };
  let suggestions = [];
  try {
    const data = await api('/qa/suggest', { method: 'POST', body: f });
    suggestions = data.suggestions || [];
  } catch (e) { /* fall through to empty state */ }
  const list = modal.querySelector('#qa-list');
  list.innerHTML = '';
  if (!suggestions.length) {
    list.innerHTML = '<div class="empty">No Q&amp;A pairs found yet - add an answer-first opening and a few H2 sections with real paragraphs.</div>';
    return;
  }
  for (const s of suggestions) {
    list.appendChild(el(`<div class="check"><span class="dot pass"></span>
      <div><div class="label">${esc(s.question)}</div><div class="detail">${esc(s.answer)}</div></div></div>`));
  }
  const insertBtn = modal.querySelector('#qa-insert');
  insertBtn.disabled = false;
  insertBtn.onclick = () => {
    const block = '<h2>Questions readers ask</h2>' + suggestions.map((s) => `<h3>${esc(s.question)}</h3><p>${esc(s.answer)}</p>`).join('');
    state.editor.chain().focus().insertContentAt(state.editor.state.doc.content.size, block).run();
    markDirty(); scheduleAnalyze();
    close();
    toast('Q&A block added at the end of the post');
  };
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

async function repurposeModal() {
  await save();
  try {
    const d = await api(`/posts/${state.post.id}/repurpose`, { method: 'POST', body: {} });
    const modal = el(`<div class="modal-backdrop"><div class="modal">
      <h3>Share this post everywhere</h3>
      ${d.preview ? '<p class="hint">Post is not published yet - content below uses a preview URL. Publish first for the real link.</p>' : `<p class="hint">Built from the live URL: ${esc(d.url)}</p>`}
      <div id="rep-body"></div>
      <div class="row"><button class="btn-ghost" id="close-modal">Close</button></div></div></div>`);
    const body = modal.querySelector('#rep-body');
    const section = (title, text, intentUrl) => {
      const sec = el(`<div style="margin-bottom:1rem">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.3rem">
          <strong>${esc(title)}</strong>
          <span style="display:flex;gap:0.4rem">
            <button class="btn-ghost" style="padding:0.2rem 0.6rem;font-size:0.75rem">Copy</button>
            ${intentUrl ? `<a href="${esc(intentUrl)}" target="_blank" rel="noopener"><button class="btn-primary" style="padding:0.2rem 0.6rem;font-size:0.75rem">Open & post</button></a>` : ''}
          </span></div>
        <pre style="white-space:pre-wrap;font-size:0.8rem">${esc(text)}</pre></div>`);
      sec.querySelector('button').onclick = () => { navigator.clipboard.writeText(text).then(() => toast(`${title} copied`)); };
      return sec;
    };
    body.appendChild(section('Pinterest pin', `${d.pinterestPin.title}\n\n${d.pinterestPin.description}`, d.intentUrls.pinterest));
    body.appendChild(section('X thread', d.xThread.map((t, i) => `[${i + 1}/${d.xThread.length}] ${t}`).join('\n\n'), d.intentUrls.x));
    body.appendChild(section('LinkedIn post', d.linkedinPost, d.intentUrls.linkedin));
    const wa = section('WhatsApp / Reddit', `WhatsApp: ${d.intentUrls.whatsapp}\nReddit: ${d.intentUrls.reddit}`, null);
    body.appendChild(wa);
    modal.querySelector('#close-modal').onclick = () => modal.remove();
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    document.body.appendChild(modal);
  } catch (e) { toast(`Repurpose failed: ${e.message}`); }
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
      toast(`Published: ${res.result.url}${res.indexing && res.indexing.coverageState ? ' - sitemap hint sent, observed status: ' + res.indexing.coverageState : ''}`);
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
