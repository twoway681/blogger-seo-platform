# Automated Social Repurposing - Spec (Phase 3)

Goal: one click turns a published post into Pinterest pins, an X thread and a LinkedIn post.

## What is actually free (verified 2026-11-14)

| Network | Posting API | Free? | What it needs |
|---|---|---|---|
| Pinterest | API v5 `POST /v5/pins` | Yes (no spend) | User creates an app at developers.pinterest.com. Trial access: pins visible only to their creator (sandbox). Standard access needs a video demo of the OAuth flow submitted for review. Scopes: boards:read, pins:write. |
| LinkedIn | Posts API `POST /rest/posts` (ugcPosts legacy) | Yes (self-serve) | User creates an app at developer.linkedin.com, adds the free "Share on LinkedIn" product -> w_member_social scope. Needs the member's person URN (OpenID Connect userinfo). |
| X (Twitter) | X API v2 | NO. Since 2026-02-06 there is no free tier; pay-per-use credits only ($0.005/post read; writes are paid too). | Paid. Do not build on it under the no-spend constraint. |

## The free fallback that ships day one: intent URLs

`src/repurpose.mjs` generates one-click share URLs for X, LinkedIn, Pinterest, WhatsApp and Reddit (`twitter.com/intent/post`, `linkedin.com/sharing/share-offsite`, etc.). The platform prepares all the content; the user taps and hits post. Zero API access, zero spend, works for every user on day one. API posting upgrades each network to full automation later, per user, when they connect their own app credentials.

## Content templates (implemented in src/repurpose.mjs)

- Pinterest pin: title <=100 chars, description <=500 chars ending in the post URL, 2:3 image from the platform's CDN pipeline (the Phase 1 image host). Pin description front-loads the hook.
- X thread: hook tweet (title + "A thread"), one tweet per H2 (max 8), closer tweet with the post URL. Every tweet <=280 chars (URLs count ~24 via t.co).
- LinkedIn post: "I just published: {title}", summary, H2 bullets, link. <=3000 chars.

## Prototype

- `src/repurpose.mjs` - pure functions: HTML -> text/outline -> all three formats + intent URLs
- `src/providers/pinterest.mjs` - real v5 pin creation, dry-run unless PINTEREST_ACCESS_TOKEN is set
- `src/providers/linkedin.mjs` - real Posts API call, dry-run unless LINKEDIN_ACCESS_TOKEN is set

## Integration with the main app

- Hook: after a successful publish (Phase 1 flow), run repurposePost() on the published HTML + CDN image, show a "Distribute" panel with the three prepared posts and per-network buttons: "Post via API" when connected, otherwise "Open pre-filled share".
- Job queue (blueprint: BullMQ) can schedule API posts; intent-URL flow needs no queue.
- Needs from the user (flag for main): Pinterest app + token, LinkedIn app + token - both free but require the user's accounts. X API would cost money - recommend staying on intent URLs for X.
