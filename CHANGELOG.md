# Changelog

> **Build Snapshot** — Version v2.0.0 · 1 commits · 4536f67

> Generated from conventional commits and git tags. The historical
> changelog from the CraftCMS era is preserved in
> `docs/craftcms-changelog-history.twig`.

---

## Breaking Changes

### Initialize standalone KnitStitch Grid app

**v2.0.0** · `4536f67` · 2026-07-14

- extract app from CraftCMS into standalone Vite project
- serve from own subdomain (www.knitstitch.misssponto.me.uk)
- standalone index.html with simple header, no Craft partials
- extract CSS into public/css/app.css with design tokens and components
- update test configs for Vite dev server (no DDEV/CraftCMS needed)
- 93 unit tests passing, Playwright E2E auto-starts dev server
- KnitStitch is now a standalone app, no longer embedded in CraftCMS.
