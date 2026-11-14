# blogger-growth-modules

Phase 2/3 groundwork for the Blogger SEO & Automated Publishing Platform (see the blueprint PDF): the pieces that do not touch the core app codebase.

## What's here

1. **Low-Competition Keyword Finder** (`src/keywordFinder.mjs`, spec: `docs/keyword-finder-spec.md`) - working prototype. Expands a seed keyword through keyless Google/DuckDuckGo autocomplete fan-out, dedupes, and scores for low competition (long-tail + intent heuristics + Trends momentum). No API keys, no spend.
2. **Social repurposing** (`src/repurpose.mjs`, providers in `src/providers/`, spec: `docs/social-distribution-spec.md`) - turns a published post into a Pinterest pin, an X thread, a LinkedIn post, and one-click intent-URL shares. Pinterest/LinkedIn providers are real API clients in dry-run mode until the user's free app tokens exist. X has no free API tier (since Feb 2026), so X ships as intent URLs.
3. **Featured Blogs Directory** (`docs/featured-blogs-directory-spec.md`) - concept spec for the member backlink hub.

## Run it

```
node --test test/*.test.mjs     # 7 offline tests
node demo.mjs "blogger seo" IN  # live keyword finder demo (seed, Trends geo)
```

No dependencies beyond Node 22+.

## Needs the user (reported to main)

- Pinterest app + OAuth token (free, needs their Pinterest account; Standard access needs a video demo)
- LinkedIn app + OAuth token (free, needs their LinkedIn account)
- X API is pay-per-use - recommend intent-URL flow unless the user wants to pay
- Directory needs a platform domain (~$10/yr) - product decision for later

## Integration

The main app calls `findKeywords(seed)` server-side for the research panel and `repurposePost(post)` after each publish. See the specs for the exact hooks.
