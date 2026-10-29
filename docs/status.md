---
title: "Family status"
description: "The family-status@1 contract: poststruct serves /status.json generated from its committed ledgers, and the /status page reads the family's files back honestly."
author: "Creadev.org"
lang: "en"
date: 2026-10-29
last_modified_at: 2026-10-29
nav_order: 9
layout: default
version: 0.9.0
permalink: /status
---

# Family status

Four repos in the struct family - eyestruct, crashtest, poststruct,
packstruct - each carry adversarial legs whose verdicts live in
**committed ledger files**, reconciled by CI on every push. The
`family-status@1` contract makes those files readable *across* the family,
without a server, without a dashboard product, and without any trust beyond
"the committing repo's own CI ran its own battery":

1. every member serves a machine-readable status file at the fixed path
   `/status.json` on its site;
2. that file is **generated, never hand-edited**, by the member's own web
   build, straight from the committed ledgers;
3. every member's status page reads the others' files and renders their
   numbers (or their absence) honestly.

Humans read `/status`; agents and machines read `/status.json`. Both get the
same numbers, because both read the same generated file.

## The file

poststruct's own file lives at
[`/status.json`](https://poststruct.creadev.org/status.json). It is written
by [`web/scripts/build-status.mjs`](https://github.com/dhaupin/poststruct/blob/main/web/scripts/build-status.mjs),
wired FIRST in the web build (`npm --prefix web run build`), and gitignored -
regeneration is the freshness.

| field | shape | meaning |
|--------|---------|-------------|
| `schema` | `1` | the dialect's schema pin, additive-first |
| `contract` | `"family-status@1"` | the contract name a reader matches |
| `repo` | string | the GitHub repo the file describes |
| `site` | URL | the member's own status page |
| `docs` | URL | this page |
| `asOf` | short sha | the commit the generator last saw (`worktree` when no git context - never a fake sha) |
| `legs` | array | one row per adversarial leg |
| `packs` | array | one row per committed pack |

A leg row carries `leg` (slug), `verdict` (`PASS` or `RED`), `cases`,
`counts` (verdict-tallied), and `ledger` (the committed file the numbers
came from). A pack row carries `name`, `spec` (`packstruct@1`), `manifest`,
and `cases`.

## poststruct's legs

| leg | ledger | what it counts |
|------|---------|----------------|
| `packs` | `packs/eye-ledger.json` | every pack's check rows over the tree the campaign fires at, reconciled by `scripts/run-packs.mjs` (a new EXPLOITED fails CI; a verdict change fails until re-baselined) |
| `battery` | `labs/battery.json` | the fixture corpus's refusal contract: the exact FAIL ids the bad fixture must produce, the same list `test/run.mjs` reconciles against |

`labs/battery.json` is the single source of truth for the battery's expected
findings: `test/run.mjs` reads it, and the emitter reads it, so the served
count can never drift from the test.

## The verdict rule

Every case verdict is `REFUSED`, `PASSED`, or `BOUNDED` -> the leg is
`PASS`. Anything else (`EXPLOITED`, `FAILED`, a verdict the dialect has never
met) degrades the leg to `RED`. The emitter refuses - never guesses - when a
mandated input is unreadable, when a committed pack has zero ledger rows, or
when ledger rows name a pack that is not exported.

## Reading the family back

The `/status` page mounts a `family-status` island that fetches each
sibling's served `/status.json` at load. A sibling that is not serving the
contract yet renders as "not serving the dialect yet" - never a guessed row,
never a default `PASS`. One bad sibling degrades only its own row. The
behavior is pinned by `test/status.test.cjs` (temp-dir fixtures, no network),
the same law every test in this repo runs.

The reader has a second half the file shape alone does not carry: those
sibling fetches are **cross-origin**, so the member's own `connect-src` must
allow every family origin. The served `/status.json` carries
`Access-Control-Allow-Origin: *` (miss path included), but a `connect-src`
that omits the origins makes the browser refuse the request **before** CORS is
consulted, and the row degrades to an opaque `Failed to fetch` instead of the
honest absence above. Both halves are required: ACAO on the served file, and
the family origins in `connect-src` (this repo's live in
`web/public/_headers`). The drift is pinned the same way - the battery leg
asserts every origin the island declares is present in the shipped
`connect-src`.
