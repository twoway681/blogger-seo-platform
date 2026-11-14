// Low-competition scoring for low-authority (.blogspot.com) domains.
// No volume API exists for free, so we combine keyless demand proxies with
// long-tail/intent heuristics. See docs/keyword-finder-spec.md for the rationale.

const QUESTION_WORDS = ['how', 'what', 'why', 'which', 'can', 'when', 'where', 'who', 'is', 'are', 'does'];
const COMPARISON_WORDS = ['vs', 'versus', 'or', 'alternative', 'alternatives', 'like'];
const USECASE_WORDS = ['for', 'without', 'with', 'near', 'under', 'best', 'free', 'ideas', 'examples', 'tips', 'guide', 'template', 'checklist'];
const HARD_COMMERCIAL = ['buy', 'price', 'cheap', 'discount', 'deal', 'coupon', 'money', 'earn', 'income']; // dominated by affiliates/aggregators

export function scoreKeyword(keyword, { fanoutHits = 1, trending = false } = {}) {
  const words = keyword.trim().toLowerCase().split(/\s+/);
  const first = words[0];
  let score = 0;
  const reasons = [];

  // Demand proxy: how many distinct fan-out queries surfaced this suggestion.
  score += Math.min(40, fanoutHits * 8);
  if (fanoutHits >= 3) reasons.push(`surfaced by ${fanoutHits} different fan-out queries`);

  // Long-tail: 3-6 words is the sweet spot for low-authority domains.
  if (words.length >= 3 && words.length <= 6) { score += 25; reasons.push(`${words.length}-word long tail`); }
  else if (words.length === 2) { score += 8; }
  else if (words.length > 6) { score += 10; reasons.push('very long tail (low volume risk)'); }

  // Intent shapes a new blog can win.
  if (QUESTION_WORDS.includes(first)) { score += 15; reasons.push('question intent'); }
  if (words.some((w) => COMPARISON_WORDS.includes(w))) { score += 12; reasons.push('comparison intent'); }
  if (words.some((w) => USECASE_WORDS.includes(w))) { score += 8; reasons.push('use-case modifier'); }

  // Penalties.
  if (words.some((w) => HARD_COMMERCIAL.includes(w))) { score -= 20; reasons.push('hard commercial term: page 1 is affiliates/aggregators'); }
  if (words.length === 1) { score -= 30; reasons.push('single-word head term: not winnable'); }
  if (/^\d{4}$/.test(words[words.length - 1]) || words.includes(new Date().getFullYear().toString())) {
    score += 5; reasons.push('freshness modifier');
  }

  // Momentum: currently in Google trending searches.
  if (trending) { score += 10; reasons.push('currently trending'); }

  return { keyword, score: Math.max(0, Math.min(100, Math.round(score))), reasons };
}
