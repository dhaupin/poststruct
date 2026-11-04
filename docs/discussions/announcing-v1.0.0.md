---
version: 1.0.0
permalink: /discussions/announcing-v1.0.0
layout: default
title: Announcing v1.0.0
nav_order: 22
description: v1.0.0 ships the pack-carrying tarball and the family release ladder - the verdict packs ride the published artifact, and the publish lane runs the three-job OIDC ladder.
---

# Announcing v1.0.0

poststruct is the auditor that walks the HTML that actually ships. v1.0.0 is the line where the auditor's own verdict packs travel with it: the npm tarball now carries `packs/`, so the shape checks that grade a baked tree arrive with the tool that grades it. The publish lane also moves to the family release ladder, OIDC only, with the served tarball re-proved after the cut.

## Install

```shell
npm install --save-dev poststruct
```

Then the first audit:

```text
npx poststruct audit dist/
npx poststruct audit dist/ --json
```

## What ships

- **The verdict packs ride the tarball (poststruct#79).** `package.json` now whitelists `packs/` alongside `src/`, `bin/`, and `LICENSE`, so the packs under `packs/public/` ship in the published artifact and the release ladder proves they are present before the publish fires. The pack loader resolves them from the installed package the same way it resolves a local path.
- **The family release ladder (eyestruct@4e2b552).** `publish.yml` is now the three-job ladder. `publish` refuses a 0.x version and any tag that does not equal the packaged version, then runs `npm publish --provenance` over OIDC (the `NPM_TOKEN` secret is dropped, the family law is OIDC only). `release` extracts the release body from the changelog's own `[version]` section and attaches the served tarball. `verify` re-asserts the served tarball's sha512 against the registry integrity, the provenance, the full pack ladder, and the release object.
- **One release-notes extractor across the family.** `scripts/release-notes.cjs` reads the Keep-a-Changelog heading, the older bare and v-prefixed forms, and closes the version token so `[1.2.0]` never matches `[1.2.0-rc.1]`.
- **The release ladder is dry-run safe.** An `npm publish --dry-run` rehearsal no longer trips the ladder's nested `npm pack` and `npm install`, so a rehearsal verdict equals a real-publish verdict.

## What the tarball carries

`bin/`, `src/`, `packs/`, and `LICENSE` ship in the npm tarball. The ladder makes 0.x the manual path while `publish.yml` refuses 0.x at the gate, and 1.0.0 rides npm Trusted Publishing (`id-token: write`).

## Where to go next

- [Check catalog](/checks) - every check and its id
- [Packs](/packs) - the packstruct pack lane over this audit
- The repo with the full CHANGELOG is [dhaupin/poststruct](https://github.com/dhaupin/poststruct)
