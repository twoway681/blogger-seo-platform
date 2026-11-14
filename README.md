# BloggerSEO — Smart SEO Editor & Automated Publishing Platform for Blogger

A web platform that gives free `.blogspot.com` creators the on-page SEO tooling Blogger
lacks: a distraction-free editor with a **real-time SEO checklist**, **automatic image
compression with responsive tag injection**, **JSON-LD Article schema + canonical
injection**, and **one-click publishing through the Blogger API v3** (publish now,
save as Blogger draft, or schedule).

Built from the 6-page blueprint "Blogger SEO & Automated Publishing Platform".
This repository implements **Phase 1 (Core MVP)** of the blueprint's roadmap.

## Quick start

```bash
npm install
npm run build        # bundles the TipTap editor -> client/bundle.js
npm start            # http://localhost:3000
```

With no Google credentials configured the app runs in **demo mode**: sign-in is an
instant offline flow against a **simulated Blogger** (two fake `.blogspot.com` blogs),
and "publishing" exercises the full pipeline and stores the exact API payload for
review — nothing touches a real blog and nothing costs anything.

Run the test suite (12 tests: SEO engine, payload composition, sanitizer, image
pipeline, full API flow):

```bash
npm test
```

## Connecting a real Blogger account (Google OAuth 2.0)

Free, no spend. You need your own Google Cloud OAuth client:

1. [Google Cloud Console](https://console.cloud.google.com/) → create a project (free).
2. **APIs & Services → Library**: enable **Blogger API v3** and **Google Search Console API**.
3. **OAuth consent screen**: External, fill in app name + your email. The app stays in
   "Testing" mode, which is fine — add your own Gmail under **Test users**.
4. **Credentials → Create Credentials → OAuth client ID → Web application** with
   authorized redirect URI: `http://localhost:3000/auth/google/callback`
5. Copy `.env.example` to `.env` and set:

   ```
   PROVIDER=google
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   ```

6. Restart. "Connect Google Blogger" now runs the real consent flow with the scopes
   `blogger` (read/write) and `webmasters.readonly` (Search Console, used in Phase 2).

### Publishing safety gate

Real API calls are additionally gated:

```
PUBLISH_MODE=dry_run   # default: build + validate + store the exact payload, never send
PUBLISH_MODE=live      # actually POST/PUT to the Blogger API
```

Even with Google credentials, `dry_run` means **nothing is sent to Blogger** — the
composed payload is stored and viewable in the editor via **View payload**.

## What the MVP does (Phase 1 checklist)

| Blueprint requirement | Implementation |
| --- | --- |
| Google OAuth 2.0 login, Blogger API v3 + Search Console scopes | `server/blogger/googleClient.js` (plain `fetch`, offline-refresh tokens, auto refresh) |
| Clean rich-text editor | TipTap v3 (H2/H3/H4, lists, quotes, links, images), bundled with esbuild — no runtime CDN |
| Real-time on-page SEO checklist | `server/seo/analyzer.js` — title length, focus-keyword placement (title/intro/H2/meta), keyword density, search-description length, word count, single-H1 guard, H2 usage, image alt/srcset/lazy checks, internal/external links, Flesch readability → 0-100 score |
| Auto image compression + CDN hosting + responsive `<img>` injection | `server/images/pipeline.js` — sharp → WebP at 480/800/1200/1600w, `srcset`/`sizes`, `loading="lazy"`, escaped alt text; storage driver abstraction (`server/images/storage.js`) |
| JSON-LD Article schema on publish | `server/seo/schema.js` — headline, description, image, author, publisher, dates, wordCount, mainEntityOfPage |
| Canonical tag injection | `<link rel="canonical">` embedded in the payload + JSON-LD `mainEntityOfPage` (see caveat below) |
| Drafts & scheduling | `isDraft=true` for Blogger drafts; future ISO timestamp in `published` for scheduling |

### The `?m=1` duplicate-URL caveat (from the blueprint)

Blogger's own templates already emit a proper `<link rel="canonical">` in `<head>`
pointing at the post URL, which is what actually resolves the `?m=1` mobile duplication
in Search Console for standard themes. The payload-embedded canonical we add is a
belt-and-braces hint; Google's John Mueller has confirmed body-embedded canonicals are
weak signals. The durable fix for broken themes is a clean template — that's Phase 2's
template library.

## Architecture

```
client/            TipTap SPA (dashboard, editor + live SEO sidebar, publish bar)
server/
  index.js         Express 5 app, sessions (httpOnly cookie), static hosting
  routes/auth.js   OAuth start/callback/logout (+ fake round-trip in demo mode)
  routes/api.js    blogs, local drafts, /seo/analyze, /images, /posts/:id/publish, payload audit
  blogger/         provider switch: googleClient.js (real) | fakeProvider.js (offline)
  seo/             analyzer.js, schema.js, compose.js (sanitize + normalize + payload build)
  images/          pipeline.js (sharp), storage.js (CDN abstraction)
data/              node:sqlite database (users, sessions, blogs, posts, images)
public/uploads/    locally-hosted image variants (stand-in for the CDN)
```

Deliberate stack simplifications vs. the blueprint's "recommended" column, all
reversible: no Next.js (plain SPA + Express ships the MVP sooner), node:sqlite instead
of Postgres, local disk instead of R2, no job queue yet (scheduling is delegated to
Blogger's own future-publish).

## Connecting paid/production services later (none required now)

| Blueprint component | Free/local equivalent used here | Production upgrade path |
| --- | --- | --- |
| Image CDN | Local disk served at `/uploads` | Cloudflare R2 (free 10 GB, zero egress) or Cloudinary free tier: implement `put()` in `server/images/storage.js`, set `IMAGE_STORAGE=r2` |
| Database | node:sqlite file | Supabase/Neon Postgres free tier: swap `server/db.js` queries |
| Background jobs (sitemap pings, social cross-posting) | Not in Phase 1 | BullMQ + free Upstash Redis, or a cron endpoint |
| Hosting | `localhost` | Any free Node host (Render/Fly free tiers); set `BASE_URL` + OAuth redirect to match |

## What's left (blueprint roadmap)

**Phase 2 — Discovery & Indexing Engine (weeks 5-8)**
- Search Console property verification + automatic `sitemap.xml` submission on onboarding
- Existing-post crawler → contextual internal-link suggestions while drafting
- Library of 3-5 fast, clean, mobile-first Blogger XML templates

**Phase 3 — Growth & Monetization (weeks 9-12)**
- Long-tail low-competition keyword finder (Google Trends / keyword data APIs)
- Auto-repurposing to Pinterest pins / X threads / LinkedIn posts
- Public "Featured Blogs Directory" backlink hub

**Freemium gating** (blueprint §8): 1 blog / 5 posts per month free; Pro tier unlocks
unlimited posts, CDN hosting, AI meta/schema generation and social auto-posting.
