---
title: "Packs"
description: "poststruct packs follow the shared packstruct SPEC v1 - the check profile, slug-namespaced ids, config-as-the-arm, the first-class shape-pack catalog, and the check-profile packs the audit lane runs."
author: "Creadev.org"
lang: "en"
date: 2026-10-23
last_modified_at: 2026-10-28
nav_order: 5
layout: default
version: 0.9.0
permalink: /packs
---

# Packs

poststruct packs follow the shared [packstruct SPEC v1](https://github.com/dhaupin/packstruct): `packs/public/<name>/pack.json` + entry, the `check` profile (default export `{ checks: [...] }`), ids namespaced by pack slug, and the config `packs:` entry as the arm. Lint with `npx packstruct lint packs/`.

A pack declares ONE profile. The `run(ctx)` verdict profile is the shape-pack catalog below: the campaign runner (`npm run packs`) fires each pack over a baked tree and reconciles its rows against the committed ledger. The `check` profile is the audit lane: the config `packs:` arm loads the pack and `runAudit` runs each declared check over the same prose view the language module grades, so a check's findings land in the ordinary audit output under the pack-namespaced id (`<pack>/<check>`) and honor the same config `checks` overrides. `poststruct audit --module packs` runs only that lane. A check reads the tree through the host's ctx (`ctx.docs` plus the extracted prose, `ctx.text`/`readdir`/`exists`), never the filesystem directly, so the profile's "no transport, no network" boundary holds by construction.

Shipped first-class shape packs: `eyes-reference` (the eye companion: every og/twitter image a baked page declares must be real pixels the scrapers see), `eyestruct-shapes` (file checks over an eyestruct-shaped lab's .eyes canon tree: ledger honesty, dangling rows, the manifest pin + route matrix including the slot jail, reason-table drift, verdict coverage, receipt provenance, note safety), and `prestruct-shapes` (the engine's own contract: the SSR marker on every app mount, one deploy-id across the tree, og:url in step with rel=canonical, one home canonical across the index, the sitemap home loc and the 404, and no shell placeholder surviving the inject pass), `freestruct-shapes` (the docs layer's contract: one build hash across the tree and on every cache-bust param, no head tag doubled by a cache-hit rebuild, canonicals absolute on one origin for sub-path installs, a site-local share image resolving under the page canonical's base path, and the 404 noindex + full-pipeline contract), `jekyll-shapes` (the Jekyll ecosystem shape: a post shipping its rendered first paragraph as the meta description through jekyll-seo-tag's excerpt fallback, head tags doubled by hand meta alongside `{% raw %}{% seo %}{% endraw %}`, and hreflang links pointing at language siblings that were never built), and `wp-seo-shapes` (the WordPress ecosystem shape: an SEO plugin and a theme/plugin both emitting head SEO so description / og:title / the JSON-LD schema graph ship twice, attachment pages inheriting the front page canonical while staying indexable, and paginated archives canonicalising away from their own page), and `wp-static` (the WordPress static-EXPORT consumer shape: a 404 inheriting the theme head with og:/twitter:/canonical reads instead of a bare noindex, an rss/atom alternate resolving to a feed the export never shipped, the wp-json / RSD / wlwmanifest discovery links surviving the bake, a plugin-stamped generator tag, a `/page/N/` archive whose canonical the exporter rewrote to the site root, and the wp-emoji rig or a lost `html lang` surviving the export). `prestruct-shapes`, `freestruct-shapes`, `jekyll-shapes`, `wp-seo-shapes`, and `wp-static` ship the PRD's catalog. The M2 ecosystem shapes now ship too: `astro-shapes` (a hydration island or module script stranded in `<head>`, a canonical written for the other `build.format` trailing-slash shape, and a same-origin link to a dynamic route `getStaticPaths` never emitted), `shopify-liquid-shapes` (an unrendered Liquid construct surviving the bake - a comment block, a raw block, or an output expression - a platform meta shipped twice by an installed app, and a paginated collection canonicalising away from its own page), `gatsby-shapes` (a base64 data-URI placeholder wired into `og:image`, a sitemap-listed page left with `noindex`, and a duplicate `<loc>` in the sitemap), `hugo-shapes` (a list page shipping its `.Summary` as the meta description, a paginated taxonomy page canonicalising to page 1, and an og partial wired twice), and `eleventy-shapes` (a canonical to a page `pagination.href` never built, a `relativeTo`-built canonical off the deployed origin, and two files claiming one URL). Each ecosystem pack dockets BOUNDED when no tree of its shape is armed, never a fabricated pass.

The cache-staleness, modulepreload, og:image-dims, and sitemap/robots checks land as the engines expose their surfaces. Queued shape packs for M3: the Next.js static, SvelteKit/Nuxt, and docs-suite (docusaurus/vitepress) shapes.

## Check-profile packs (the audit lane)

The first shipped check-profile pack is `voice-negative-echo` (id `negative-echo`). It flags a garden path in Q and A copy: a negative-polarity question answered by a BARE verdict sentence (a lone `Yes.` or `No.` on its own) whose next sentence then restates a content word from the question, so the answer reads as taking back what it just said. The classic shape:

```text
Do you only work with businesses in Pennsylvania?
No. We are based in NW Pennsylvania and work with clients worldwide.
```

`No` denies the whole question, then `NW Pennsylvania` seems to revoke the denial. The fix joins the verdict to its subject, so the answer leads with the fact instead of the echo: `No, we work with clients worldwide.` A comma-joined verdict never fires, and neither does a bare verdict whose next sentence moves on to new terms. The check is WARN by default; a project that wants it to gate promotes it through config (`checks: { "voice-negative-echo/negative-echo": "fail" }`), which is the same override surface every built-in check uses. It reads the baked prose and any configured `language.textDirs`, so the same copy is graded whether it ships as HTML or as source.

Arm it like any pack:

```json
{ "packs": ["./packs/public/voice-negative-echo"] }
```

```bash
poststruct audit dist --module packs
```

## Sources: local paths and npm packages

A pack is armed explicitly (SPEC section 4, no auto-download) from either a local path or an installed npm package. The campaign runner (`node scripts/run-packs.mjs`, or `npm run packs`) takes the arms:

```bash
node scripts/run-packs.mjs --pack ./packs/wp-seo-shapes      # a local path
node scripts/run-packs.mjs --pack @poststruct/wp-seo-shapes  # an npm package
```

The runner also reads a `packs:` array from `poststruct.config.json` and the `POSTSTRUCT_PACKS` env knob (comma or space separated), and still scans `packs/public/` for the committed shape packs. An npm source resolves from the nearest `node_modules` carrying a `pack.json`; if it is not installed the load REFUSES with the fix named (`npm i -D <name>`) and never fetches. A pack name that resolves from two sources refuses to start rather than silently deduping. `poststruct lint-packs` remains the author-time lint lane over the repo's own packstruct install.

<div class="crosslinks">
<p><strong>More in these docs:</strong>
<a href="{{ '/' | relative_url }}">home</a> ·
<a href="{{ '/checks' | relative_url }}">check catalog</a> ·
<a href="{{ '/search' | relative_url }}">search</a></p>
</div>
