// Keyless autocomplete fetchers. Verified live 2026-11-14.
// google:  GET https://suggestqueries.google.com/complete/search?client=firefox&q=...&hl=en&gl=us  (add &ds=yt for YouTube)
// duckduckgo: GET https://duckduckgo.com/ac/?q=...&type=list
// bing osjson (api.bing.com/osjson.aspx) returned empty responses on 2026-11-14 - treat as dead.
// All take an injectable fetch for offline testing.

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, fetchImpl) {
  const res = await fetchImpl(url, { headers: { 'user-agent': 'keyword-finder/0.1' } });
  if (!res.ok) throw new Error(`suggest ${res.status} for ${url}`);
  return res.json();
}

export async function googleSuggest(query, { fetchImpl = fetch, hl = 'en', gl = 'us', yt = false } = {}) {
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&hl=${hl}&gl=${gl}${yt ? '&ds=yt' : ''}&q=${encodeURIComponent(query)}`;
  const [, suggestions] = await getJson(url, fetchImpl);
  return suggestions || [];
}

export async function duckduckgoSuggest(query, { fetchImpl = fetch } = {}) {
  const url = `https://duckduckgo.com/ac/?type=list&q=${encodeURIComponent(query)}`;
  const [, suggestions] = await getJson(url, fetchImpl);
  return (suggestions || []).map((s) => (typeof s === 'string' ? s : s.phrase)).filter(Boolean);
}
