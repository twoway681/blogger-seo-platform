// Google Trends momentum, free tier reality (verified 2026-11-14):
// - Official Trends API is alpha-only, no public signup.
// - pytrends is archived; trends/api/explore 429s; interest-over-time is not
//   reliably available without a key.
// - The trending searches RSS works from any server (no key, no CORS issue):
//   https://trends.google.com/trending/rss?geo=IN
// We use it as a momentum bonus and a "trending now" discovery feed.

export async function fetchTrending(geo = 'US', { fetchImpl = fetch } = {}) {
  const res = await fetchImpl(`https://trends.google.com/trending/rss?geo=${encodeURIComponent(geo)}`);
  if (!res.ok) throw new Error(`trends rss ${res.status}`);
  return parseTrendingRss(await res.text());
}

export function parseTrendingRss(xml) {
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = m[1];
    const pick = (tag) => (block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1] || '').replace(/<!\[CDATA\[|\]\]>/g, '');
    items.push({ query: pick('title'), traffic: pick('ht:approx_traffic'), started: pick('pubDate') });
  }
  return items;
}

export function trendingSet(items) {
  return new Set(items.map((i) => i.query.trim().toLowerCase()));
}
