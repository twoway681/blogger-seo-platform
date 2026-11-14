// LinkedIn share posting. Free self-serve: create an app at developer.linkedin.com,
// add the "Share on LinkedIn" product -> w_member_social scope, OAuth 2.0.
// Uses the versioned Posts API (ugcPosts is legacy). Dry-run without a token.

export async function createLinkedInPost(text, { token = process.env.LINKEDIN_ACCESS_TOKEN, personUrn = process.env.LINKEDIN_PERSON_URN, dryRun = !process.env.LINKEDIN_ACCESS_TOKEN, fetchImpl = fetch } = {}) {
  const payload = {
    author: personUrn, // urn:li:person:XXX from OpenID Connect userinfo
    commentary: text,
    visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  };
  if (dryRun) return { dryRun: true, wouldPost: payload };
  const res = await fetchImpl('https://api.linkedin.com/rest/posts', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'x-restli-protocol-version': '2.0.0',
      'linkedin-version': '202601',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`linkedin ${res.status}: ${await res.text()}`);
  return { id: res.headers.get('x-restli-id') };
}
