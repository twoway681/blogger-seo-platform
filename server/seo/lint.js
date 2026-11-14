'use strict';
// Local readability & grammar lint (research build-now item: writing-quality lint).
// Pure functions, no external API - everything runs server-side (or could run in
// the browser): sentence length, passive voice, repeated words, spacing typos,
// common misspellings and filler words. Complements the SEO checklist's single
// Flesch score with issue-level, fixable detail.

const { stripHtml, words } = require('./analyzer-helpers');

const MAX_SENTENCE_WORDS = 25;   // beyond this, readers start dropping off
const MAX_PARAGRAPH_WORDS = 120; // beyond this, the paragraph should be split
const PASSIVE_WARN_RATIO = 0.2;  // >20% passive sentences reads flat

// Common misspellings -> correction. Deliberately conservative: only entries that
// are never correct English, so the lint never flags a valid word.
const MISSPELLINGS = new Map(Object.entries({
  recieve: 'receive', recieved: 'received', recieving: 'receiving',
  seperate: 'separate', seperated: 'separated', definately: 'definitely',
  occured: 'occurred', occurence: 'occurrence', accomodate: 'accommodate',
  untill: 'until', teh: 'the', adress: 'address', beleive: 'believe',
  calender: 'calendar', enviroment: 'environment', goverment: 'government',
  neccessary: 'necessary', neccessarily: 'necessarily', independant: 'independent',
  arguement: 'argument', maintainance: 'maintenance', persistant: 'persistent',
  posession: 'possession', refering: 'referring', succesful: 'successful',
  successfull: 'successful', tommorrow: 'tomorrow', wierd: 'weird',
  writting: 'writing', beggining: 'beginning', exsist: 'exist', existance: 'existence',
  greatful: 'grateful', happyness: 'happiness', immediatly: 'immediately',
  knowlege: 'knowledge', liasion: 'liaison', noticable: 'noticeable',
  publically: 'publicly', recomend: 'recommend', remeber: 'remember',
  beautifull: 'beautiful', beautifly: 'beautifully', freind: 'friend', freinds: 'friends',
}));

// Whitespace-preserving text extraction (spacing-typo checks need the raw gaps).
function stripHtmlKeepSpaces(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

// Filler/weasel words - fine in moderation, flagged when frequent.
const FILLERS = new Set(['very', 'really', 'just', 'quite', 'actually', 'basically', 'literally', 'simply']);

const BE_VERBS = new Set(['is', 'are', 'was', 'were', 'be', 'been', 'being']);
const AUX_PASSIVE = new Set(['get', 'gets', 'got', 'gotten', 'getting']);

function splitSentences(text) {
  const out = [];
  const re = /[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g;
  let m;
  while ((m = re.exec(String(text))) !== null) {
    const s = m[0].trim();
    if (s) out.push(s);
  }
  return out;
}

function isPassive(sentence) {
  const w = words(sentence);
  for (let i = 0; i < w.length - 1; i++) {
    if ((BE_VERBS.has(w[i]) || AUX_PASSIVE.has(w[i])) && /(ed|en)$/.test(w[i + 1]) && w[i + 1].length > 4) {
      // "is excited" etc. are borderline but acceptable; require a 'by' nearby OR
      // a clearly participial form to keep precision high.
      if (w.slice(i + 2, i + 6).includes('by')) return true;
      if (/(ated|ited|uted|ized|ised|aken|oken|itten|own|wn)$/.test(w[i + 1])) return true;
    }
  }
  return false;
}

/**
 * lintHtml({ title, html })
 * -> { issues: [{ id, severity: 'warn'|'fail', label, detail }], stats }
 * severity 'warn' = worth fixing, 'fail' = almost certainly a mistake.
 */
function lintHtml({ title = '', html = '' } = {}) {
  const text = [title, stripHtml(html)].filter(Boolean).join('. ');
  const sentences = splitSentences(stripHtml(html));
  const issues = [];
  const add = (id, severity, label, detail) => issues.push({ id, severity, label, detail });
  const clip = (s, n = 70) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '...' : s);

  // 1. Long sentences (top 3 offenders)
  const longOnes = sentences
    .map((s) => ({ s, n: words(s).length }))
    .filter((x) => x.n > MAX_SENTENCE_WORDS)
    .sort((a, b) => b.n - a.n);
  for (const x of longOnes.slice(0, 3)) {
    add('long-sentence', 'warn', `Long sentence (${x.n} words)`,
      `"${clip(x.s)}" - aim for ${MAX_SENTENCE_WORDS} words or fewer; split it at a natural pause.`);
  }

  // 2. Passive voice ratio
  if (sentences.length >= 4) {
    const passive = sentences.filter(isPassive);
    const ratio = passive.length / sentences.length;
    if (ratio > PASSIVE_WARN_RATIO) {
      add('passive-voice', 'warn', `Passive voice in ${Math.round(ratio * 100)}% of sentences`,
        `"${clip(passive[0])}" - active voice ("X does Y") reads stronger than ("Y is done by X").`);
    }
  }

  // 3. Long paragraphs
  const paras = String(html).split(/<\/p>/i)
    .map((p) => stripHtml(p))
    .filter((p) => words(p).length > MAX_PARAGRAPH_WORDS);
  if (paras.length) {
    add('long-paragraph', 'warn', `Wall-of-text paragraph (${paras.length})`,
      `"${clip(paras[0])}" - over ${MAX_PARAGRAPH_WORDS} words; break it up for mobile readers.`);
  }

  // 4. Repeated consecutive words ("the the")
  const w = words(text);
  const repeats = [];
  for (let i = 1; i < w.length; i++) {
    if (w[i] === w[i - 1] && w[i].length > 1 && !/^\d+$/.test(w[i]) && !['had', 'that'].includes(w[i])) repeats.push(w[i]);
  }
  if (repeats.length) {
    add('repeated-word', 'fail', `Repeated word: "${[...new Set(repeats)].slice(0, 3).join('", "')}"`,
      'The same word twice in a row is almost always a typo - delete one.');
  }

  // 5. Spacing typos: double space, space before punctuation
  const raw = stripHtmlKeepSpaces(html);
  const doubleSpace = (raw.match(/\S {2,}\S/g) || []).slice(0, 2);
  if (doubleSpace.length) add('double-space', 'warn', 'Double spaces', `"${clip(doubleSpace[0], 40)}" - use a single space.`);
  const spacePunct = (raw.match(/\S [,.!?;:]/g) || []).slice(0, 2);
  if (spacePunct.length) add('space-punctuation', 'fail', 'Space before punctuation', `"${clip(spacePunct[0], 40)}" - punctuation sticks to the word before it.`);

  // 6. Misspellings
  const found = new Map();
  for (const word of w) {
    const fix = MISSPELLINGS.get(word);
    if (fix && !found.has(word)) found.set(word, fix);
  }
  for (const [bad, good] of [...found].slice(0, 4)) {
    add('misspelling', 'fail', `Misspelling: "${bad}"`, `Did you mean "${good}"?`);
  }

  // 7. Filler words
  const fillerCount = w.filter((x) => FILLERS.has(x)).length;
  if (w.length >= 150 && fillerCount / w.length > 0.02) {
    add('filler-words', 'warn', `Filler words (${fillerCount})`,
      '"very", "really", "just" and friends dilute the point - cut most of them.');
  }

  const stats = {
    sentences: sentences.length,
    longSentences: longOnes.length,
    passiveSentences: sentences.filter(isPassive).length,
    repeatedWords: repeats.length,
    misspellings: found.size,
    fillers: fillerCount,
  };
  return { issues, stats };
}

module.exports = { lintHtml, splitSentences, isPassive, MISSPELLINGS };
