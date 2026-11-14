# Template library drop-in directory

Curated, SEO-clean, mobile-first Blogger XML themes live here (blueprint Phase 2).

Each template = a folder holding `theme.xml` plus its own README, and an entry in
`manifest.json`:

```json
{
  "file": "slate/theme.xml",
  "name": "Slate",
  "description": "Clean minimal sans-serif on light. The default pick for general blogging.",
  "version": "1.0.0",
  "author": "Blogsmith",
  "guide": "slate/README.md"
}
```

The app serves this directory at `/templates/` and lists the manifest at
`GET /api/templates`; new entries appear in the dashboard automatically.
Install instructions are rendered by the app from `INSTALL.md`.
