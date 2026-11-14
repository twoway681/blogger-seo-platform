# Featured Blogs Directory - Brief Spec (Phase 3)

Goal: a public directory on the platform's own domain that lists member blogs, giving new .blogspot.com sites legitimate backlinks and their first readers.

## Concept

- One static, crawlable page per member blog: blog name, niche, description (member-written, 1-2 sentences), link to the blog, latest post title pulled via the Blogger API post-list (already connected in Phase 1).
- Category index pages per niche (photography, food, travel...) so each listing sits in a relevant link cluster - a niche hub is worth more than one flat list.
- Every listing page carries ItemList/CollectionPage JSON-LD so Google understands the directory structure.

## Why it works

A brand-new .blogspot.com subdomain has zero authority and takes 3-6 months to earn Google's trust (blueprint Category D). A followed link from an established, indexed domain plus real referral readers shortens the sandbox grind and gives beginners the early feedback loop that keeps them blogging.

## Build notes

- Static generation at build/publish time (Next.js SSG or plain HTML files) - near-zero hosting cost, fast, cacheable.
- Quality bar: manual approval or a minimum bar (3+ published posts, original content) before listing, so the directory itself does not become a spam farm that Google discounts.
- Each member opts in; listing includes their blog URL, niche and description only - no private data.
- Cost: nothing beyond the platform's existing hosting. No APIs, no spend.

## Deferred decision

Needs the platform's own domain to host it. That is a product/branding decision (and eventually a domain registration cost, ~$10/yr) - flag for the user when Phase 3 starts.
