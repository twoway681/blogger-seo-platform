// Pinterest API v5 pin creation. Free, but the USER must register an app at
// developers.pinterest.com (Trial access: pins visible only to creator;
// Standard access requires a video demo of the OAuth flow).
// Scopes needed: boards:read, pins:write. OAuth 2.0.
// This module runs in dry-run mode unless PINTEREST_ACCESS_TOKEN is set.

export async function createPin(pin, { token = process.env.PINTEREST_ACCESS_TOKEN, boardId = process.env.PINTEREST_BOARD_ID, dryRun = !process.env.PINTEREST_ACCESS_TOKEN, fetchImpl = fetch } = {}) {
  const payload = {
    board_id: boardId,
    title: pin.title,
    description: pin.description,
    link: pin.link,
    media_source: pin.imageUrl ? { source_type: 'image_url', url: pin.imageUrl } : undefined,
  };
  if (dryRun) return { dryRun: true, wouldPost: payload };
  const res = await fetchImpl('https://api.pinterest.com/v5/pins', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`pinterest ${res.status}: ${await res.text()}`);
  return res.json();
}
