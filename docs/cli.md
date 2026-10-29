---
title: "CLI reference"
description: "The poststruct command surface: the audit verb, the lint-packs verb, the verbless form, the exit contract, and the --json findings schema."
author: "Creadev.org"
lang: "en"
date: 2026-10-28
last_modified_at: 2026-10-28
nav_order: 4
layout: default
version: 0.9.0
permalink: /cli
---

# CLI reference

poststruct ships one binary with two verbs. The documented verb-first
forms are also mathematically safe to skip: only a known verb is ever
stripped from argv, so a typo'd first word can never silently become a
verb or a fantasy directory.

## `poststruct audit [dir] [--json] [--module x]`

Walks `dir` (default: `dist`) and audits every baked HTML page it
finds.

| Flag | Value |
|---|---|
| `--json` | prints `{schema: 1, counts: {fail, warn}, findings}` instead of prose |
| `--module head\|site\|links` | audits one module only, position-independent |

## Config (`poststruct.config.js`)

Optional, and small on purpose. Read from the working directory as
`poststruct.config.js`, `.mjs`, or `.json`. With no config the audit
behaves exactly as it did before there was one.

```js
export default {
  dir: 'dist',                      // default walk target
  checks: {
    'head/title-length': 'warn',    // per-check level: 'fail' | 'warn' | 'off'
    'a11y/*': 'fail',               // prefix glob; the longest match wins
  },
  scope: {
    is404: (path) => path === '404.html',   // overrides the 404 heuristic
    skip: ['pdf-reports/**'],               // globs dropped from the walk
  },
}
```

Overrides are a post-pass over findings, not a change to what checks
report: a check always reports what it sees, and the config decides the
level. `'off'` drops the finding, `'warn'` demotes a fail, `'fail'`
promotes a warn. A level that is not one of the three refuses loudly and
names the offending value rather than being ignored.

## `poststruct lint-packs [--deep] [--json] [--against <lib>] [dir]`

The pack lint lane as a discoverable verb: it runs packstruct over the
repo's own install, passes its exit codes through unchanged, and refuses
loudly with exit 2 when packstruct is not installed. `--deep` is the
packstruct deep lint; `--json` forwards its shape. `dir` is the packs
root (default: `packs/`).

## Exit contract

| Exit | Meaning |
|---|---|
| `0` | clean, or warnings only |
| `1` | at least one FAIL finding (or the lint lane's own pass-through) |
| `2` | usage or environment error: no directory to walk, a bad flag value, or packstruct missing |

## Findings schema

`--json` output is a stable schema (`schema: 1`). Fields are additive
first: new finding ids may appear, existing ids never change meaning.

```json
{
  "schema": 1,
  "counts": { "fail": 0, "warn": 2 },
  "findings": [
    { "page": "index.html", "id": "title-absent", "level": "warn", "message": "no <title> in head" }
  ]
}
```

## Programmatic use

The same engine is exportable: `runAudit(dir, { module })` from
`src/index.mjs` (`import { runAudit } from 'poststruct'` resolves it)
returns the `{hasFails, counts, findings, pagesChecked, sitemapLocs}`
the CLI prints.

<div class="crosslinks">
<p><strong>More in these docs:</strong>
<a href="{{ '/' | relative_url }}">home</a> ·
<a href="{{ '/getting-started' | relative_url }}">getting started</a> ·
<a href="{{ '/checks' | relative_url }}">check catalog</a> ·
<a href="{{ '/packs' | relative_url }}">packs</a></p>
</div>
