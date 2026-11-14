# Template library drop-in directory

Curated, SEO-clean, mobile-first Blogger XML themes live here (blueprint Phase 2).

Each template = one `.xml` file plus an entry in `manifest.json`:

```json
{
  "file": "clean-start.xml",
  "name": "Clean Start",
  "description": "Minimal single-column theme, zero render-blocking JS.",
  "version": "1.0.0",
  "author": "BloggerSEO",
  "previewUrl": "https://clean-start-demo.blogspot.com"
}
```

The app serves this directory at `/templates/` and lists the manifest at
`GET /api/templates`; new entries appear in the dashboard automatically.
Install instructions are rendered by the app from `INSTALL.md`.
