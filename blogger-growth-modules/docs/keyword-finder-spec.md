# Low-Competition Keyword Finder - Spec (Phase 3)

Goal: surface long-tail, low-difficulty topics that a free .blogspot.com subdomain can actually rank for.

## Free data sources (verified live, 2026-11-14)

| Source | Endpoint | Key? | Status |
|---|---|---|---|
| Google Autocomplete | `https://suggestqueries.google.com/complete/search?client=firefox&q=...&hl=en&gl=us` (`&ds=yt` = YouTube) | No | Working |
| DuckDuckGo Autocomplete | `https://duckduckgo.com/ac/?q=...&type=list` | No | Working |
| Google Trends RSS | `https://trends.google.com/trending/rss?geo=XX` | No | Working (server-side; browser needs a CORS proxy) |
| Bing Autosuggest | `api.bing.com/osjson.aspx` | No | DEAD (empty responses) - do not use |
| Google Trends "interest over time" | `trends/api/explore` + widgetdata | No | Rate-limited (429 on every test). Official Trends API is alpha-only; pytrends archived 2025-04-17. Not usable for free. |

Key consequence: there is no free search-volume API. The finder uses demand PROXIES instead of volumes. Be honest about this in the UI ("popularity signal", not "monthly searches").

## Method

1. Fan-out expansion of a seed: seed + each letter a-z (both positions), question prefixes (how/what/why/which/can/is), preposition suffixes (for/vs/without/with/like). ~60 queries, 200-600 unique suggestions after dedupe.
2. Etiquette: 100-150ms between requests; stop after 3 consecutive failures (rate-limit signal); dedupe before scoring.
3. Scoring (src/scoring.mjs, 0-100):
   - Demand proxy: suggestion surfaced by N distinct fan-out queries (8 pts each, cap 40)
   - Long tail: 3-6 words (+25), 2 words (+8), 1 word (-30, never winnable)
   - Question intent (+15), comparison intent vs/alternative (+12), use-case modifier for/best/free/ideas/tips/guide (+8)
   - Hard commercial terms buy/price/cheap/money/earn (-20): page 1 is affiliates and aggregators
   - Trending now in Trends RSS (+10 momentum bonus)
4. Optional manual SERP check (recommend in UI, never auto-scrape Google - ToS): tell the user to search the keyword and look for weak page-1 results (Quora, Reddit, Pinterest, Medium, other .blogspot.com blogs, forums). Any of those = green light.

## Prototype

- `src/suggest.mjs` - keyless suggest fetchers (injectable fetch for tests)
- `src/keywordFinder.mjs` - fan-out + dedupe + rate-limit handling
- `src/scoring.mjs` - the scoring model above
- `src/trends.mjs` - Trends RSS parser + trending set
- `demo.mjs` - live CLI: `node demo.mjs "blogger seo" IN`

## Integration with the main app

- UI: a "Find keywords" panel next to the editor. User enters a seed; backend runs findKeywords server-side (avoids CORS and lets us pace requests); results table with score + reasons; one click copies the keyword into the editor's focus-keyword field so the Phase 1 SEO checklist scores the draft against it.
- Storage: keep research history per blog in the app DB (blueprint: PostgreSQL/SQLite).
- Cache results per (seed, hl, gl) for 24h - suggestions move slowly.
