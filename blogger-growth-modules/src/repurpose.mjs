// Turn a published Blogger post into per-network distribution content.
// Pure functions - no network calls - so the core app can run them at publish time.

export function htmlToText(html) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|h[1-6]|li|blockquote)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

export function extractOutline(html) {
  const headings = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].map((m) => htmlToText(m[1]));
  const firstParagraph = htmlToText((html.match(/<p[^>]*>([\s\S]*?)<\/p>/i) || [])[1] || '');
  return { headings, summary: firstParagraph.slice(0, 300) };
}

const X_LIMIT = 280;
const LINK_BUDGET = 24; // X wraps every URL in t.co at ~23 chars

export function makePinterestPin({ title, url, summary, imageUrl }) {
  // Pinterest: title <=100 chars, description <=500, first 50 chars matter most.
  return {
    title: title.slice(0, 100),
    description: `${summary || title} Read the full guide: ${url}`.slice(0, 500),
    link: url,
    imageUrl: imageUrl || null, // 1000x1500 (2:3) performs best; pull from the post's CDN pipeline
    boardSuggestion: null, // resolved per user board at post time
  };
}

export function makeXThread({ title, url, headings, summary }) {
  const tweets = [];
  const hook = `${title}\n\nA thread (${headings.length} key points). Link at the end.`;
  tweets.push(hook.slice(0, X_LIMIT));
  headings.slice(0, 8).forEach((h, i) => tweets.push(`${i + 1}/ ${h}`.slice(0, X_LIMIT)));
  const closer = `Full guide with examples: ${url}`;
  tweets.push(closer.length <= X_LIMIT ? closer : `${closer.slice(0, X_LIMIT - LINK_BUDGET - 1)} ${url}`);
  if (summary) tweets.splice(1, 0, summary.slice(0, X_LIMIT));
  return tweets;
}

export function makeLinkedInPost({ title, url, headings, summary }) {
  const lines = [
    `I just published: ${title}`, '',
    summary || '', '',
    ...headings.slice(0, 6).map((h) => `- ${h}`), '',
    `Full article: ${url}`,
  ];
  return lines.filter((l, i) => l !== '' || lines[i - 1] !== '').join('\n').slice(0, 3000);
}

// Free fallback when a network's API is paid or unapproved: one-click intent URLs.
// The platform opens these; the user hits post themselves. Zero API access needed.
export function makeIntentUrls({ title, url }) {
  const text = encodeURIComponent(title);
  const u = encodeURIComponent(url);
  return {
    x: `https://twitter.com/intent/post?text=${text}&url=${u}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
    pinterest: `https://pinterest.com/pin/create/button/?url=${u}&description=${text}`,
    whatsapp: `https://wa.me/?text=${text}%20${u}`,
    reddit: `https://www.reddit.com/submit?url=${u}&title=${text}`,
  };
}

export function repurposePost({ title, url, html, imageUrl }) {
  const { headings, summary } = extractOutline(html);
  const input = { title, url, headings, summary, imageUrl };
  return {
    pinterestPin: makePinterestPin(input),
    xThread: makeXThread(input),
    linkedinPost: makeLinkedInPost(input),
    intentUrls: makeIntentUrls({ title, url }),
  };
}
