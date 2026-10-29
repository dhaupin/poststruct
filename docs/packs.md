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
ship the PRD's catalog; the cache-staleness, modulepreload, og:image-dims, and
sitemap/robots checks land as the engines expose their surfaces. Queued shape
packs for M1: the Astro and Shopify shapes.

<div class="crosslinks">
<p><strong>More in these docs:</strong>
<a href="{{ '/' | relative_url }}">home</a> ·
<a href="{{ '/checks' | relative_url }}">check catalog</a> ·
<a href="{{ '/search' | relative_url }}">search</a></p>
</div>
