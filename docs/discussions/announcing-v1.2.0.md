---
version: 1.2.0
permalink: /discussions/announcing-v1.2.0/
layout: default
title: Announcing v1.2.0
nav_order: 24
description: v1.2.0 makes the check-profile pack lane real - runAudit executes a pack's checks, the first check-profile pack ships, and the campaign runner and status emitter learn the profile.
---

# Announcing v1.2.0

poststruct is the audit half of the struct family: it reads a tree and reports what is wrong, so a site or a pack can be graded before it ships. v1.2.0 is a minor on the 1.1.0 line - the audit verbs and the finding shape are unchanged; the check-profile pack lane, which the SPEC declared but nothing ran, is now real. This post ships with the v1.2.0 tag: npm has the tarball by the time you read it.

```bash
npm i -g poststruct
```

## What landed

**The check-profile pack lane is real: `runAudit` now executes a pack's `checks[]`.** The check profile (packstruct SPEC v1, section 3) was declared in the SPEC, `profiles/check.md`, the PRD, and `docs/packs.md`, but nothing ran it: `runAudit` ran only the built-in modules, and the campaign runner only ever called `run(ctx)` verdict packs. An armed check-profile pack was inert - a green light wired to nothing. `src/check-packs.mjs` now realizes the host side: it shape-validates each check (kebab-case id, unique within the pack, a `run(ctx)` returning findings), runs it over a ctx the host owns, and folds the findings into the audit under the pack-namespaced id (`<pack>/<check>`), so config `checks` overrides and `--module packs` both reach them for free. A check reads the tree only through ctx (`ctx.docs` plus `ctx.prose`, `ctx.text`, `ctx.readdir`, `ctx.exists`), never the filesystem directly, so the profile's no-transport boundary holds by construction. The config gains a `packs:` arm (the config-is-the-arm lifecycle the profile declares), and `--module packs` is a valid filter that runs only that lane.

**First shipped check-profile pack: `voice-negative-echo` (`negative-echo`).** It flags a garden path in Q and A copy: a negative-polarity question answered by a bare verdict sentence (a lone `Yes.` or `No.`) whose next sentence restates a content word from the question, so the answer reads as taking back what it just said (`Do you only work in Pennsylvania? No. We are based in NW Pennsylvania and work worldwide.`). The fix joins the verdict to its subject (`No, we work with clients worldwide.` form), which never fires. WARN by default, promotable to FAIL through config. Tested through the real `runAudit` path: the old copy flags exactly once under the namespaced id, the fix and the sibling shapes stay silent, and the source prose view is graded too.

**The campaign runner and the status emitter learn the check profile.** `scripts/run-packs.mjs` no longer refuses a committed pack for lacking `run(ctx)` when it declares `checks[]` (it is the audit lane's pack, not the campaign's), so a conforming check-profile pack can ship in `packs/public/` without tripping the campaign. `web/scripts/build-status.mjs` counts a check-profile pack by its declared checks instead of refusing it for zero ledger rows, while still refusing a campaign pack that has none.

## Also in this round

The family floors move: the `prestruct` declaration floor is `^1.3.0` (the SSRF-guard security round), refused below by `scripts/check-prestruct-pins.cjs`, and the family devDependency pins advance (`eyestruct` `1.0.0 -> 1.1.0`, `packstruct` `1.0.0 -> 1.1.0`, `crashtest` `1.1.0 -> 1.3.0`). The `.gitignore` docs block carries the in-tree Jekyll and pagefind products, and `.github/workflows/staging-ff-sync.yml` keeps `main == staging` after every promote.

## Links

- Repo and docs: https://github.com/dhaupin/poststruct / https://docs.creadev.org/poststruct
- Release posts: https://docs.creadev.org/poststruct/discussions
- Changelog: https://github.com/dhaupin/poststruct/blob/main/CHANGELOG.md
- Issues: https://github.com/dhaupin/poststruct/issues
