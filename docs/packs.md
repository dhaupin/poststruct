---
title: "Packs"
description: "poststruct packs follow the shared packstruct SPEC v1 - the check profile, slug-namespaced ids, config-as-the-arm, and the first-class shape-pack catalog."
author: "Creadev.org"
lang: "en"
date: 2026-10-23
last_modified_at: 2026-10-23
nav_order: 5
layout: default
version: 0.9.0
permalink: /packs
---

# Packs

poststruct packs follow the shared [packstruct SPEC v1](https://github.com/dhaupin/packstruct):
`packs/public/<name>/pack.json` + entry, the `check` profile
(default export `{ checks: [...] }`), ids namespaced by pack slug, and the config
`packs:` entry as the arm. Lint with `npx packstruct lint packs/`.

Shipped first-class shape packs: `eyes-reference` (the eye companion: every
og/twitter image a baked page declares must be real pixels the scrapers see),
`eyestruct-shapes` (file checks over an eyestruct-shaped lab's .eyes
canon tree: ledger honesty, dangling rows, the manifest pin + route matrix
including the slot jail, reason-table drift, verdict coverage, receipt
provenance, note safety), and
`prestruct-shapes` (the engine's own contract: the SSR marker on every app
mount, one deploy-id across the tree, og:url in step with rel=canonical, and
no shell placeholder surviving the inject pass), `freestruct-shapes` (the
docs layer's contract: one build hash across the tree and on every cache-bust
param, no head tag doubled by a cache-hit rebuild, canonicals absolute on one
origin for sub-path installs, and the 404 noindex + full-pipeline contract),
`jekyll-shapes` (the Jekyll ecosystem shape: a post shipping its rendered
first paragraph as the meta description through jekyll-seo-tag's excerpt
fallback, head tags doubled by hand meta alongside `{% raw %}{% seo %}{% endraw %}`, and hreflang
links pointing at language siblings that were never built), and
`wp-seo-shapes` (the WordPress ecosystem shape: an SEO plugin and a
theme/plugin both emitting head SEO so description / og:title / the JSON-LD
schema graph ship twice, attachment pages inheriting the front page canonical
while staying indexable, and paginated archives canonicalising away from their
own page).
`prestruct-shapes`, `freestruct-shapes`, `jekyll-shapes`, and `wp-seo-shapes`
ship the PRD's catalog. The M2 ecosystem shapes now ship too: `astro-shapes`
(a hydration island or module script stranded in `<head>`, a canonical written
for the other `build.format` trailing-slash shape, and a same-origin link to a
dynamic route `getStaticPaths` never emitted), `shopify-liquid-shapes` (an
unrendered Liquid construct surviving the bake - a comment block, a raw block,
or an output expression - a platform meta shipped twice by an installed app,
and a paginated collection canonicalising away from its own page),
`gatsby-shapes` (a base64 data-URI placeholder wired into `og:image`, a
sitemap-listed page left with `noindex`, and a duplicate `<loc>` in the
sitemap), `hugo-shapes` (a list page shipping its `.Summary` as the meta
description, a paginated taxonomy page canonicalising to page 1, and an og
partial wired twice), and `eleventy-shapes` (a canonical to a page
`pagination.href` never built, a `relativeTo`-built canonical off the
deployed origin, and two files claiming one URL). Each ecosystem pack dockets
BOUNDED when no tree of its shape is armed, never a fabricated pass.

The cache-staleness, modulepreload, og:image-dims, and
sitemap/robots checks land as the engines expose their surfaces. Queued shape
packs for M3: the Next.js static, SvelteKit/Nuxt, and docs-suite
(docusaurus/vitepress) shapes.

## Sources: local paths and npm packages

A pack is armed explicitly (SPEC section 4, no auto-download) from either a
local path or an installed npm package. The campaign runner
(`node scripts/run-packs.mjs`, or `npm run packs`) takes the arms:

```bash
node scripts/run-packs.mjs --pack ./packs/wp-seo-shapes      # a local path
node scripts/run-packs.mjs --pack @poststruct/wp-seo-shapes  # an npm package
```

The runner also reads a `packs:` array from `poststruct.config.json` and the
`POSTSTRUCT_PACKS` env knob (comma or space separated), and still scans
`packs/public/` for the committed shape packs. An npm source resolves
from the nearest `node_modules` carrying a `pack.json`; if it is not installed
the load REFUSES with the fix named (`npm i -D <name>`) and never fetches.
A pack name that resolves from two sources refuses to start rather than
silently deduping. `poststruct lint-packs` remains the author-time lint lane
over the repo's own packstruct install.

<div class="crosslinks">
<p><strong>More in these docs:</strong>
<a href="{{ '/' | relative_url }}">home</a> ·
<a href="{{ '/checks' | relative_url }}">check catalog</a> ·
<a href="{{ '/search' | relative_url }}">search</a></p>
</div>
