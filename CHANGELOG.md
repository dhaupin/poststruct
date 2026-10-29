# Changelog

All notable changes to poststruct will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Config support (`poststruct.config.js`, `.mjs`, or `.json`), the PRD 4.4 contract that shipped docs had been promising with nothing behind it. Per-check level overrides (`fail`/`warn`/`off`, exact ids and `module/*` prefix globs, longest match wins so key order never decides), `scope.is404` to override the 404 heuristic, `scope.skip` globs to drop pages from the walk, and `dir` as the default target. Overrides are applied as a post-pass over findings rather than threaded into each check, so checks stay pure file readers. No config at all behaves exactly as before. A level that is not one of the three refuses loudly and names the value. Covered by `test/config-run.mjs` (wired into `npm test`).
- The `links` module (PRD M1): the internal link graph. `<a href>` targets are checked against the files that actually exist, with the same resolution order a static host uses (exact file, `<path>.html`, `<path>/index.html`, then a matching `_redirects` rule). A directory that exists without an `index.html` is a 404 on the host, so it is reported as broken rather than passed by a bare `existsSync`. Ids: `links/broken-internal` (FAIL), `links/redirect-target-missing` (FAIL, `_redirects` rules whose target is absent), `links/anchor-missing` (WARN by default, promotable via `anchorLevel: 'fail'`). `mailto:`/`tel:`, any scheme, and protocol-relative URLs are out of scope; the module never touches the network. Wired as `--module links` and into the default audit.
- `test/fixtures/good/_redirects` and `test/fixtures/bad/_redirects` carry the link fixtures; the good tree stays clean and the bad tree hits `links/broken-internal` + `links/redirect-target-missing` (FAIL) and `links/anchor-missing` (WARN), asserted in `test/run.mjs`.

### Fixed
- `publish.yml`'s ladder gate read the ref NAME, not the version: `!startsWith(github.ref_name, 'v0.')` was true for a `workflow_dispatch` run on `main` or `staging` (where `ref_name` is the branch), so a 0.x tree could publish from CI - the exact thing `DEPLOY.md` says CI blocks. The gate is now a job that reads the version out of `package.json` and feeds the `publish` job's `if:`, so nothing at 0.x can publish regardless of how the run was triggered.

### Added
- `README.md` declares the boundary against packstruct: what poststruct owns (the baked-artifact audit, its finding ids and levels, the pack loader), what it defers (manifest validation, pack naming, the `pack.json` schema, semver policy), and the shared vocabulary it consumes by version pin rather than copying. The three family house rules are named alongside it.
- `labs/TASKS.md` records the local docs-preview recipe: the Jekyll stack builds from a scratch copy of `docs/` with `BUNDLE_PATH` outside the repo, so docs tokens are verifiable pre-push and the tree is never the build root.

### Changed
- The Cloudflare Pages contract is named in one place: `DEPLOY.md`, `README.md`, and `wrangler.toml` now state the project settings (root directory empty, build command `npm run site:build`, build output directory `dist`) and record why a `web` root breaks the build (Pages resolves `pages_build_output_dir` against the root, so `dist` lands outside the repository, and the root `functions/` directory drops out of the project).

### Removed
- The scheduled `linkcheck.yml` workflow: it invoked a `linkcheck` CLI mode that does not exist in 0.9.0, so the weekly lane would have gone red on the first push. The weekly external-link gate returns with the links module + `--check-external` (M1, tracked in labs/TASKS.md).

### Fixed
- `npm run site:build` installs `web/` before building, so the verb is self-contained for the Pages build command (the prior form assumed a separate `web/` install).
- Root `dist/` and `web/.prestruct/` are gitignored: the landing build product and the prestruct build cache no longer show up as untracked files.
- The eyestruct pin drift is gone: the `run-packs.mjs` refusal text and `AGENTS.md` name the `1.0.0` pin (the stale `0.9.0` mentions are corrected), and the pack-lane row no longer claims packs are absent from the core.
- The docs lane builds again: freestruct 1.1.0's strict link checker resolves root-absolute hrefs against the artifact root with no `basePath` awareness, so the `/poststruct/...` nav failed every page (100 findings, dhaupin/freestruct#32, fixed upstream but unpublished). `linkCheck: false` suspends that one class until a pinned release carries the fix; the rest of the strict gate stays on. `scripts/check-docs-links.cjs` now reads the repo's own `SITE_PREFIX` (`/poststruct`, not the ported `/prestruct`) and catches the doubled-prefix class.
- The Cloudflare Pages build runs again: the dashboard ships the Vite preset default build command (`npm run build`), which the root had no script for, so every deploy died at `Missing script: "build"`. The root now aliases `build` to `site:build`, so the preset default and the documented contract resolve to the same verb.
- CI now verifies `staging`, not just `main`: the `test` and `docs` workflows trigger on push and pull_request for both branches, so work is checked where it lands instead of at promotion time. The `docs` deploy job is gated to `main`, so a `staging` build proves the lane without publishing to Pages.
- The promotion loop closes: a merge-commit promotion leaves `main` one commit ahead of `staging` every time, so `AGENTS.md` now names the fast-forward step that settles it.

## [0.9.0] - 2026-10-23

### Added
- Audit engine over baked HTML (`src/core.mjs` walk + page model): the **head** module (title present + length band, description present + band, canonical present + absolute, OG(7) + Twitter(4) sets, og:image raster-format FAIL on SVG + dims warn, JSON-LD parse + LocalBusiness recommended fields, h1 sanity, the 404 noindex contract) and the **site** module (sitemap.xml existence + loc entries + lastmod, robots.txt `Sitemap:` pointer).
- Findings schema `{page, id, level, message}` with `{counts, findings}` under `--json`; exit contract: 0 clean/warns, 1 any FAIL, 2 usage error.
- CLI: `poststruct audit [dir] [--json]` (`bin/cli.mjs`).
- Self-audit fixture engine: `test/fixtures/good` must audit clean, `test/fixtures/bad` must hit exactly the expected FAIL ids (+ warn list); `test/run.mjs` asserts the exact sets (`npm test`).
- `package.json` ships `bin/`, `src/`, `LICENSE` in the tarball.

### Notes
- 0.9.x is the manual npm release ladder; `publish.yml` refuses 0.x versions at the gate. 1.0.0 flips OIDC trusted publishing (`id-token: write` provenance).
- Docs run on Jekyll + Pagefind + Freestruct at `docs.creadev.org/poststruct` via `.github/workflows/docs.yml`. Landing host is `poststruct.creadev.org` (Cloudflare Pages): the landing is shipped and live (web/ prerendered, `npm run site:build` bakes it), and its output is the first dogfood target (`npx poststruct audit dist/` gates clean on it).
