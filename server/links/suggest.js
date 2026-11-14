'use strict';
// Internal-link suggester (blueprint Phase 2 seam).
// Scores the current draft against the blog's existing posts (from the Blogger
// post-list API) and returns the best posts to link to, with anchor text.
// Pure functions; the route layer fetches the posts via the active provider.

const STOPWORDS = new Set(('a,an,the,and,or,but,if,then,else,for,to,of,in,on,at,by,with,from,as,is,are,was,were,be,been,it,its,this,that,these,those,you,your,i,we,they,he,she,how,what,why,when,where,which,who,can,will,do,does,did,not,no,so,my,our,their,his,her,me,him,us,them,about,into,over,after,before,between,through,during,without,within,along,among,per,via,vs,your,yours').split(','));

function tokens(text) {
  const m = String(text || '').toLowerCase().match(/[a-z0-9]+/g) || [];
  return m.filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function stripHtml(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function alreadyLinkedUrls(html) {
  const urls = new Set();
  const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) urls.add(m[1]);
  return urls;
}

/**
 * suggestInternalLinks({ html, posts, max = 5 })
 * posts: [{ title, url }]
 * -> [{ title, url, anchor, score, matchedTerms }]
 */
function suggestInternalLinks({ html, posts, max = 5 }) {
  const draftTokens = new Set(tokens(stripHtml(html)));
  const linked = alreadyLinkedUrls(html);
  const suggestions = [];
  for (const post of posts || []) {
    if (!post.url || linked.has(post.url)) continue;
    const titleTokens = tokens(post.title);
    if (!titleTokens.length) continue;
    const matched = [...new Set(titleTokens.filter((t) => draftTokens.has(t)))];
    const coverage = matched.length / new Set(titleTokens).size;
    if (coverage < 0.34) continue; // need at least a third of the title terms in the draft
    suggestions.push({
      title: post.title,
      url: post.url,
      anchor: post.title,
      score: Math.round(coverage * 100),
      matchedTerms: matched,
    });
  }
  return suggestions.sort((a, b) => b.score - a.score).slice(0, max);
}

module.exports = { suggestInternalLinks };
