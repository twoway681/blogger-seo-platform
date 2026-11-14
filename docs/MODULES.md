# Module drop-in contracts

The core app owns the OAuth flow, editor, SEO checklist, image pipeline, publish
composer, demo mode and routes. Standalone work streams plug in through these seams -
follow the contract and no core files need to change.

## 1. Template library (Phase 2)

Drop Blogger XML themes into `templates/` and add each to `templates/manifest.json`
(see `templates/README.md` for the entry shape). The app lists them at
`GET /api/templates`, serves downloads at `/templates/<file>`, and renders install
steps from `templates/INSTALL.md` in the dashboard. Templates must be:
single-file `.xml`, free of external render-blocking JS, mobile-responsive, and must
not inject footer/spam links (that's one of the failure modes this platform fixes).

## 2. Keyword providers (Phase 3)

`server/keywords/provider.js` owns two paths:
- `suggestKeywords(seed) -> [{ keyword, source }]` - fast autocomplete ideas for the editor panel.
- `researchKeywords(seed) -> [{ keyword, source, score, reasons }]` - deep, scored research,
  implemented by `blogger-growth-modules/src/keywordFinder.mjs` (wide fan-out + low-competition
  heuristics + Trends momentum). `score` is an OPPORTUNITY score, 0-100, higher = better target
  for a low-authority domain; `reasons` explains it.
Routes: `GET /api/keywords/suggest?q=` and `GET /api/keywords/research?q=`. The editor renders
both; clicking a result sets the focus keyword. Free data sources only (autocomplete endpoints,
Trends trending-RSS, public datasets); anything needing a paid API key belongs in the README's
paid-services table instead. The growth modules folder stays self-contained (own tests, ESM,
no dependencies) - `repurposePost(post)` there is the post-publish social hook.

## 3. Internal links & distribution (Phase 2/3)

`POST /api/links/suggest { blogId, html }` returns ranked older posts to link to,
powered by `server/links/suggest.js` over the Blogger post-list API
(`provider.listPosts`). Social distribution modules (Pinterest/X/LinkedIn
repurposing) should take a published post's URL + content from the local `posts`
table after publish, and must stay stubbed behind config flags until the user
approves connecting each social account. No live posting without explicit approval,
same rule as `PUBLISH_MODE`.
