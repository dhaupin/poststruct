---
version: 0.9.0
permalink: /discussions
layout: default
title: Release Posts
nav_order: 20
description: The release-post system - one announcing-vX.Y.Z.md per version, the file IS the Discussion, and the index records what is live and what is staged.
---

# Release posts

One post per release, the conventions adopted across the creadev family: eyestruct's v0.9.0 post set the shape for the struct-family first releases, and poststruct follows it so approaches to the community discussion stay uniform. The post lives in `docs/discussions/` as versioned source so the release trail is in the same tree as the changelog it summarizes, and the file's raw markdown IS the GitHub Discussions announcement - view source on the file, copy, strip the frontmatter, post.

Prose on these pages flows - paragraphs keep their natural length, and nothing in the toolchain re-wraps them at commit time. Hard-wrapped prose is a commit-time artifact, and it dies at every reflow of an upstream forum renderer. Tables and frontmatter keep their own natural line lengths.

## The conventions

- **One file per release, named after it.** `announcing-vX.Y.Z.md`, matching the npm version on the day the post is drafted. Never reuse a filename; if a release gets a retry, fold the delta into the same post instead.
- **Frontmatter contract.** The five fields every docs page gates on (`version`, `permalink`, `layout`, `title`, `nav_order`) plus `description`; the permalink is `/discussions/announcing-vX.Y.Z`.
- **The file IS the post.** No wrapper prose, no nested copy block: below the frontmatter the file carries the announcement body itself, so the source of the doc is the source of the post. To publish, copy the raw markdown from GitHub, stripping ONLY the frontmatter lines at the top. The posting mechanics live in this index, never inside a post.
- **Voice and facts.** The repo's content style: direct, dry, no marketing language, no cliches, and every number and claim verified against the changelog, the test fixtures, or the npm registry before it lands. If you cannot run it, do not write it.
- **Timing.** Draft against the released version, not the dev tree: cite what shipped in the npm tarball, keep in-tree-only work out of the post. A post describing a version that is not on the registry yet is fiction by promotion.
- **Gates.** `lint:docs` runs on these files like everything else - frontmatter, headings, the style and language gates all apply. Files under `discussions/` are exempt from nav listing (copy sources, reachable by link), not from the other checks.

## The index

| post | version | live |
| --- | --- | --- |
| [Announcing poststruct v1.1.0](/poststruct/discussions/announcing-v1.1.0) | 1.1.0 | staged for the v1.1.0 tag |
| [Announcing poststruct v0.9.0](/poststruct/discussions/announcing-v0.9.0) | 0.9.0 | yes - the auditor's first release line on npm |
| [Announcing poststruct v1.0.0](/poststruct/discussions/announcing-v1.0.0) | 1.0.0 | 2026-11-03 on npm |
