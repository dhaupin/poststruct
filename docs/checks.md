---
title: "Check catalog"
description: "Every poststruct check by module - head, site, links, i18n, a11y-lite, language, feeds, frontmatter - each individually disableable, scoped to the file-on-disk contract."
author: "Creadev.org"
lang: "en"
date: 2026-10-23
last_modified_at: 2026-10-23
nav_order: 3
layout: default
version: 0.9.0
permalink: /checks
---

# Check catalog

Every check is individually disableable via config (`poststruct.config.js`/`.mjs`/`.json`) and
scoped to the file-on-disk contract - poststruct only ever reads files.

| Module | Status | Enforces |
|---|---|---|
| head | shipped | title/meta description/canonical/OG(7)/Twitter(4) sets, og:image raster-format, JSON-LD parses |
| site | shipped | sitemap.xml parity, robots.txt sitemap pointer, 404 noindex contract |
| links | shipped | internal link graph vs files present, `_redirects` rule targets, anchor targets; `links/external-broken` (opt-in `--check-external`, WARN by default) probes absolute links |
| i18n | shipped | `<html lang>` present, `content-language`/`og:locale` agreement (primary subtag), same-origin hreflang targets resolve, reciprocal pairs |
| a11y-lite | shipped | informative-image `alt` (decorative `alt=""` respected), form controls labeled, `viewport` present, skip link (WARN) |
| language | shipped | dash classes (FAIL), AI-cliche lexicon (WARN), config/voice-pack banned terms, lorem ipsum, whitespace disasters, malformed frontmatter. Runs over baked HTML and the source text profile (md/yaml/json/txt); findings carry `count` + `snippet` |
| feeds | shipped | RSS/Atom well-formed + root element, feed alternates resolve, item links resolve, empty feed + missing `rel="self"` (WARN) |
| frontmatter | shipped | parsed YAML frontmatter key/type surface: a required key absent (`key-missing`), a value of the wrong declared type (`type-mismatch`), a matched file with no block (`block-missing`). Per-file-glob rules in config (`frontmatter.rules`); inert until configured. Source-tree lane (`--module frontmatter`) |

<div class="crosslinks">
<p><strong>More in these docs:</strong>
<a href="{{ '/' | relative_url }}">home</a> ·
<a href="{{ '/packs' | relative_url }}">packs</a> ·
<a href="{{ '/search' | relative_url }}">search</a></p>
</div>
