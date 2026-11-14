'use strict';
// Auto Q&A block suggestions: derives question-and-answer pairs from the post's
// own structure (question-style headings and their sections), matching how people
// ask AI engines. These are inserted as VISIBLE content only - no FAQ schema,
// which Google retired for most sites.

function stripHtml(h) {
  return String(h || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&quot;/g, "'").replace(/\s+/g, ' ').trim();
}

function trimWords(text, max = 55) {
  const w = String(text || '').split(/\s+/).filter(Boolean);
  return w.length > max ? w.slice(0, max).join(' ') + '...' : w.join(' ');
}

const QUESTION_STARTS = ['how', 'what', 'why', 'when', 'where', 'which', 'who', 'can', 'is', 'are', 'does', 'should'];

function headingToQuestion(heading) {
  const h = String(heading || '').trim().replace(/[.:;!?]+$/, '');
  if (!h) return null;
  if (String(heading).trim().endsWith('?')) return String(heading).trim();
  const lower = h.toLowerCase();
  let m = h.match(/^what to (.+)$/i);
  if (m) return `What should I ${m[1]}?`;
  m = h.match(/^how to (.+)$/i);
  if (m) return `How do I ${m[1]}?`;
  const first = lower.split(/\s+/)[0];
  if (QUESTION_STARTS.includes(first)) return h.charAt(0).toUpperCase() + h.slice(1) + '?';
  m = lower.match(/^(.+?) (basics|guide|tips|tricks|checklist)$/);
  if (m) return `What are the key ${m[2]} for ${m[1]}?`;
  return `What should I know about ${lower}?`;
}

// Split the body into H2/H3 sections: heading text + the first paragraph under it.
function sections(html) {
  const out = [];
  const re = /<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi;
  let match;
  const marks = [];
  while ((match = re.exec(html))) marks.push({ heading: stripHtml(match[1]), end: re.lastIndex });
  for (let i = 0; i < marks.length; i++) {
    const nextStart = i + 1 < marks.length ? html.indexOf('<h', marks[i].end) : html.length;
    const body = html.slice(marks[i].end, nextStart === -1 ? html.length : nextStart);
    const p = body.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    out.push({ heading: marks[i].heading, para: stripHtml(p ? p[1] : '') });
  }
  return out;
}

function suggestQa({ title, html, focusKeyword } = {}) {
  const suggestions = [];
  const seen = new Set();
  const push = (q, a) => {
    const key = (q || '').toLowerCase();
    if (!q || !a || seen.has(key) || suggestions.length >= 4) return;
    seen.add(key);
    suggestions.push({ question: q, answer: trimWords(a) });
  };

  // Topic-level question from the focus keyword, answered by the opening paragraph.
  const intro = (String(html || '').match(/<p[^>]*>([\s\S]*?)<\/p>/i) || [null, ''])[1];
  const introText = stripHtml(intro);
  const kw = String(focusKeyword || '').trim();
  if (kw && introText.split(/\s+/).length >= 15) {
    push(`What is ${kw}?`, introText);
  }

  for (const s of sections(html)) {
    const q = headingToQuestion(s.heading);
    if (!q || !s.para || s.para.split(/\s+/).length < 8) continue;
    push(q, s.para);
  }
  return suggestions;
}

module.exports = { suggestQa, headingToQuestion };
