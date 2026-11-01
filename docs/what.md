---
title: "What poststruct is"
description: "One zero-dependency CLI that walks a directory of baked HTML and checks head, links, i18n, a11y-lite, language, feeds, and frontmatter against a contract. FAIL findings exit non-zero."
author: "Creadev.org"
lang: "en"
date: 2026-10-29
last_modified_at: 2026-10-29
nav_order: 8
layout: default
version: 0.9.0
permalink: /what
---

# What poststruct is

poststruct is a zero-dependency CLI. Point it at a baked tree, and it verifies
the output against a contract you can read and edit.

## The verbs

Init a contract, audit a tree, read the report.

```bash
# write a contract + empty report ledger
poststruct init

# walk the baked tree against the contract
poststruct audit ./dist

# CI: exit non-zero on the FAIL class
poststruct gate
```

## The check catalog

Every check is one module: head, site, links, i18n, a11y-lite, language, feeds,
frontmatter. Each is individually disableable, and each is scoped to the
file-on-disk contract.

Findings carry a severity, and the FAIL class sets the exit code, so the audit
is a gate rather than a report. A project tunes the live set by naming checks
in the contract, not by hoping.

## Where it sits

poststruct is the artifact-audit arm of the struct family: it reads what the
other members bake. Its blocks are the proven templates
[monoforge](https://github.com/dhaupin/monoforge) stamps from, and its packs
ride the same grammar as [crashtest](https://github.com/dhaupin/crashtest).

<div class="crosslinks">
<p><strong>Next:</strong>
<a href="{{ '/about/' | relative_url }}">about the project</a> ·
<a href="{{ '/checks/' | relative_url }}">the check catalog</a></p>
</div>
