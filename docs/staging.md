---
title: "Staging flow"
description: "The integration-branch pattern the struct family shares: staging is permanent, CI covers it, deploy is gated to main, and the post-promotion sync keeps the two level. The reference implementation, with proof."
author: "Creadev.org"
lang: "en"
date: 2026-10-29
last_modified_at: 2026-10-29
nav_order: 8
layout: default
version: 0.9.0
permalink: /staging
---

# Staging flow

This repo is the reference implementation for the integration-branch
pattern the struct family shares (filed as poststruct#31, documented as
poststruct#32). This page is the one canonical description the rest of the
fleet can point at.

The pattern is four rules. Three are easy to state and easy to follow. The
fourth is the one that bites, because it is mechanical rather than a
mistake, and it only shows up once you actually run a promotion.

## The four rules

1. **The integration branch is permanent.** `staging` is never deleted, at
   any point, for any reason. Work branches off it, pull requests target it,
   and promotion to `main` is the only path out.
2. **CI covers `staging` as well as `main`**, on both `push` and
   `pull_request`.
3. **Any deploy job is gated to `main`** by an explicit `if`, not by the
   trigger list. See below: this is the load-bearing rule.
4. **After every promotion, fast-forward `staging` to `main`.**

## Rule 3 is the load-bearing one

Once `staging` appears in a workflow's trigger list, the trigger is no
longer what keeps unreleased content out of production. The deploy job
itself has to say so:

```yaml
  deploy:
    needs: build
    if: github.ref == 'refs/heads/main'
```

On a `staging` push `github.ref` is `refs/heads/staging`, so the job skips.
On a `pull_request` it is `refs/pull/N/merge`, so it skips there too. Only a
`main` push deploys.

In this repo `docs.yml` publishes `docs.creadev.org/poststruct`. Before the
fix, the trigger list alone was the only thing preventing a `staging` push
from deploying unreleased docs. Adding `staging` to the trigger without the
guard would have published to production on every `staging` commit. The
trigger and the guard are a pair: adding the first without the second turns
the integration branch into a production branch.

## Rule 4: the drift is mechanical, not a mistake

A merge-commit promotion puts a commit on `main` that `staging` does not
have. Merging #31 with a merge commit (this repo's convention) left the two
branches one apart immediately:

```text
staging-only: 0   main-only: 1     <- the #31 merge commit
```

That shape appears on **every** promotion, even when the flow is followed
exactly. So the sync is a required step, not a repair:

```bash
git push origin origin/main:staging     # fast-forward, non-destructive
```

There are two ways to handle it, and one should be chosen deliberately:

- **Keep merge-commit promotions** and run the sync after every promotion.
  The sync is a required step. This is what poststruct does.
- **Promote by fast-forward** so the drift cannot happen at all. This only
  works if nothing ever lands on `main` directly.

The earlier reading of a sibling repo's divergence was that it was a process
failure. Reproducing the identical shape here while following the flow
exactly corrected that: it is mechanical, and the sync is the step that
closes the loop.

## Proof, on real runners

The deploy guard confirmed in production in both directions. A `staging`
push builds and skips the deploy; a `main` push builds and publishes.

| workflow | branch | build | deploy |
| --- | --- | --- | --- |
| docs `40837958959` | staging | success | **skipped** |
| docs `40835057130` | main | success | **success** |
| test `40837958937` | staging | success | n/a |

Neither behavior is assumed. The guard publishes on `main` and skips on
`staging`, verified on the runners.

## Where this repo records it

`AGENTS.md` carries a `Git flow` section with the same four rules and the
sync command, so an agent session picks them up without reading this page.
The two are kept in step: this page is the fleet-facing description,
`AGENTS.md` is the in-repo one.
