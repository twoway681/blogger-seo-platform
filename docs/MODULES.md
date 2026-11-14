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

`server/keywords/provider.js` owns `suggestKeywords(seed) -> [{ keyword, source, score? }]`.
The working implementation uses Google Autocomplete (free, no key). To add
low-competition scoring: write a provider module that enriches each keyword with
`score` (0-100 difficulty, lower = easier) and optionally `volume`, register it in
`provider.js`, and surface it - `GET /api/keywords/suggest?q=` already returns
whatever the providers emit, and the editor's keyword-ideas panel renders any extra
fields. Free data sources only (Google Trends explore endpoints, autocomplete,
public datasets); anything needing a paid API key goes in the README's paid-services
table instead.

## 3. Internal links & distribution (Phase 2/3)

`POST /api/links/suggest { blogId, html }` returns ranked older posts to link to,
powered by `server/links/suggest.js` over the Blogger post-list API
(`provider.listPosts`). Social distribution modules (Pinterest/X/LinkedIn
repurposing) should take a published post's URL + content from the local `posts`
table after publish, and must stay stubbed behind config flags until the user
approves connecting each social account. No live posting without explicit approval,
same rule as `PUBLISH_MODE`.
