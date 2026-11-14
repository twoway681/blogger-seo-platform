// Live demo: node demo.mjs "your seed keyword"
import { findKeywords } from './src/keywordFinder.mjs';
import { fetchTrending, trendingSet } from './src/trends.mjs';

const seed = process.argv[2] || 'blogging for beginners';
const geo = process.argv[3] || 'US';
let trends = new Set();
try { trends = trendingSet(await fetchTrending(geo)); } catch { /* momentum bonus skipped */ }
const results = await findKeywords(seed, { trendingSet: trends });
console.log(`\nTop low-competition keywords for "${seed}":\n`);
for (const r of results.slice(0, 20)) {
  console.log(`${String(r.score).padStart(3)}  ${r.keyword}  (${r.reasons.join('; ') || 'head term'})`);
}
