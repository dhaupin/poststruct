# PRD: poststruct (audit what shipped)

**Status:** v0.2 - current (2026-10-29) · Owner: dhaupin
**Role:** arm - the audit arm. It owns the audit over baked output AND the family voice (the language pack).
**Package:** `poststruct` @ 0.9.0 (node >=20, ESM, zero runtime deps). NOT yet on npm (`npm view poststruct` is not found); the 0.9.x manual publish is the one outstanding M0 item.
**Core law:** files on disk only. No SPA runtime, no scraping, no source linting.
**Family:** the five arms are **govstruct** (govern), **packstruct** (spec),
**crashtest** (attack), **eyestruct** (watch), **poststruct** (audit). poststruct
owns the audit arm and, through its language module, the family's **voice**.
The forges are **monoforge** (the repo stamp) and **coreforge** (the site rig);
**railyard** is the composer that holds them. The interop law: no host imports a
sibling to check a sibling; it invokes the sibling's public CLI.

---

## 1. One-line pitch

**poststruct audits what shipped.** A zero-dependency CLI that walks a directory
of baked HTML (any generator's output) and verifies it against a head/site
contract: SEO hygiene, link integrity, i18n, accessibility-lite, feeds, and
language. FAIL-level findings exit non-zero so CI gates regressions. It is the
third leg of the struct family: prestruct puts SEO in before the build,
freestruct puts SEO in after an SSG, poststruct checks what both of them (and
everyone else) actually shipped.

## 2. Naming and identity

| field | value |
|---|---|
| Name | `poststruct` - npm name free (checked 2026-10-23); `dhaupin/poststruct` is live on GitHub, default branch `main` |
| Family | prestruct then your build then poststruct. The portfolio grid sits next to its siblings |
| License | MIT (house standard for OSS fleet) |
| Runtime | Node >= 20, ESM, **zero runtime dependencies** |

## 3. The principle (scope fence)

**poststruct only ever reads files on disk.** No SPA runtime, no headless
scraping, no source-code archaeology, no live-site fetching (beyond an
explicitly opt-in external-link pass). This fence is what makes it timeless: it
audits whether you grew up with React or Notion or hand-rolled HTML.

Everything inside scope shares one input shape: **a page = a file path + raw
HTML string + relative path from root.** Every check consumes pages and emits
findings.

## 4. First-class concepts (the core)

### 4.1 Check

The atom. A check is a pure-ish unit:

```js
export default {
  id: 'head/canonical-missing',       // stable, versioned by level not content
  module: 'head',
  level: 'fail',                       // 'fail' | 'warn'
  appliesTo: (page) => !page.is404,    // scoping hook
  run(page, ctx) -> Finding | Finding[] | null,
}
```

Findings carry `page`, `id`, `level`, `message`, and a machine-readable `detail`
object so `--json` consumers can diff runs.

### 4.2 Module

A named group of checks with a shared concern. Each is independently
disableable. The catalog:

| Module | What it enforces |
|---|---|
| **head** | title present plus sensible length, description present plus length band, canonical absolute, OG(7) plus Twitter(4) sets, og:image raster-format (SVG = FAIL), JSON-LD parses plus LocalBusiness recommended fields, h1 sanity |
| **site** | sitemap.xml exists, loc count sanity, lastmod presence, robots.txt plus `Sitemap:` pointer, 404 keeps only its noindex contract |
| **links** | internal `<a href>` graph vs files actually present (plus `_redirects`), mailto/tel excluded, broken internal = FAIL; external validation opt-in |
| **i18n** | `<html lang>` present and non-empty, hreflang pairs resolve reciprocally, no conflicting lang claims |
| **a11y-lite** | informative `<img>` without `alt` = FAIL (decorative `alt=""` respected), form controls labeled, viewport present, skip-link present (warn) |
| **feeds** | RSS/Atom well-formed, canonical match against sitemap entries |
| **language** | voice policy on rendered text AND source prose: dash-class bans, an AI-cliche starter lexicon, per-org banned-term lists via config or voice pack |
| **frontmatter** | parsed frontmatter key/type surface: required keys present, each declared key's value the declared type, per-file-glob rules |

### 4.3 Report and exit contract

- Human output: one line per finding, `FAIL page: message` grouped by module,
  count summary footer.
- `--json`: stable versioned schema (`{ version, counts: {fail, warn}, findings: [...] }`).
  Schema changes are breaking by semver rules.
- Exit: `0` clean or warns-only, `1` any FAIL, `2` usage/environment error.

### 4.4 Config (small on purpose)

```js
export default {
  dir: 'dist',
  checks: {
    'head/title-length': 'warn',     // per-check override: 'fail' | 'warn' | 'off'
    'a11y/*': 'fail',
  },
  scope: {
    is404: (path) => path === '404.html',
    skip: ['pdf-reports/**'],
  },
}
```

No config at all must still produce a sensible audit.

## 5. The family voice: the language module and the voice pack

poststruct owns the family's **voice**. This is the one surface where structure
and taste are split explicitly: mechanical bans (dash characters, lorem ipsum,
whitespace disasters) live in core where every site wants them; taste belongs in
packs. **Core enforces physics, packs enforce vibes.**

The language module's starter lexicon stays deliberately small and generic. The
flavorful part (a full house lexicon of AI tells, per-client banned words,
brand-voice law) ships as an **org voice pack** - the `org packs` category. First
one: `@poststruct/voice-house`, seeded with the standing law: no dashes, anywhere,
ever.

The honest boundary, stated the same way everywhere: govstruct enforces
**structure** (a test exists, a name matches, a comment is present); poststruct
judges **voice** (is the prose in the family's register). govstruct never reads a
sentence for tone; it invokes poststruct, the sibling that owns that leg.

## 6. Pack (the packstruct contract)

poststruct is a `check`-profile host of the shared packstruct SPEC v1. Checks
need distribution: a WordPress-shaped bundle, Astro, Shopify, org-internal
rulesets. Layout, deliberately identical to the family convention:

```
packs/public/<pack-name>/
  pack.json        # { schemaVersion: 1, name, description, version, entry }
  entry.mjs        # exports default { checks: [Check, ...] }
```

Contract rules:

- Check ids from a pack are **namespaced by pack slug**: `wp/duplicate-title`,
  `astro/static-props-in-head`. Builtins keep their module ids. Collision at
  load time refuses to start (never silently dedupe).
- `pack.json` is validated at load: a missing or wrong `schemaVersion`,
  non-dotted `version`, or missing `entry` refuses with a nameable error.
- Loading from **local paths** in M0, and **npm sources** in M2 (`packs:
  ['@poststruct/wp-seo-shapes']`); never auto-download, never implicit. An
  uninstalled npm pack refuses with the fix named (`npm i -D <name>`).
- **The config entry is the arm.** Being listed in `packs:` is opt-in; no
  separate arming ceremony.
- Packs ship a **self-audit fixture** in CI like builtins do.

### 6.1 The shapes catalog (11 public packs)

Every ecosystem that bakes HTML has its own head sins. This is the known set:

| Pack | The sins only this shape knows |
|---|---|
| `wp-seo-shapes` | Yoast/RankMath header collisions (double description, double og:title), `_yoast_wpseo` schema duplication, archive/facet pagination canonical traps, attachment-page noindex drift |
| `prestruct-shapes` | per-route injection landed, `data-server-rendered` marker, `deploy-id` meta fresh, incremental-cache staleness, modulepreload leakage on 404, og:image dims/alt, per-route og:image override, idempotent injections |
| `freestruct-shapes` | `freestruct-build` meta fresh, missing-only gate honored, cache-busting hash consistency, `basePath` correctness on sub-path installs, injected global JSON-LD intact |
| `jekyll-shapes` | excerpt-as-description collisions, jekyll-seo-tag plus hand meta double-shipping, orphan hreflang pairs |
| `astro-shapes` | islands/hydration artifacts in head, trailing-slash mismatches, `getStaticPaths` misses silently 404ing linked pages |
| `shopify-liquid-shapes` | Liquid comment leakage, theme-app prefetch injection, duplicated platform meta, currency canonical traps, pagination canonicals |
| `gatsby-shapes` | gatsby-image preload bloat (data-URI og), noindex leftovers, sitemap dupes |
| `hugo-shapes` | `.Summary` leaking into archive descriptions, taxonomy pagination canonicals, og partials wired twice |
| `eleventy-shapes` | pagination.href mis-resolves, `relativeTo` canonical bugs, collection index dupes |
| `eyestruct-shapes` | the eyes leg's own shape surface |
| `eyes-reference` | routes SVG verification through eyestruct's raster gate **by invoking eyestruct the tool** (the interop law, never by import) |

Two special properties of the engine shapes packs:

1. **Dogfooding with teeth.** `prestruct-shapes` and `freestruct-shapes` audit
   the engines' own output - engines gain their CI guarantee from the shared
   core, and every engine regression poststruct already knows about becomes a
   FAIL the engines' own CI catches.
2. **Wrappers collapse into shapes.** With shapes packs existing, the engine
   wrapper is mostly just *invoke poststruct with the right shapes enabled* -
   the scoping rules live in the pack (`appliesTo`), not a bespoke wrapper.

## 7. Ecosystem integration

Each engine ships a thin wrapper (or embeds the CLI step) that calls poststruct
with an engine-appropriate profile:

- **prestruct:** walk `dist/`, apply the 404 scoping rule, pass route count from
  ssr.config for sitemap sanity. With `prestruct-shapes`, the wrapper is one
  invocation plus a shapes flag.
- **freestruct:** same walk, plus `basePath` awareness so sub-path installs
  compute canonical/sitemap URLs correctly.
- **Neither engine hard-depends on poststruct** in its core build - the wrapper
  is an optional devDependency and CI wiring is opt-in. Engines stay lean.

## 8. The family: who poststruct works with

| sibling | the crossing |
|---|---|
| **packstruct** | poststruct is a `check` host; `packstruct lint` gates its packs |
| **prestruct / freestruct** | the audit consumers; their shapes packs are the first customers |
| **crashtest** | shares the pack convention; crashtest attacks the loader, poststruct audits the bake |
| **eyestruct** | the text leg gates first (cheaper diff); `eyes-reference` routes SVG checks through the eyestruct tool |
| **govstruct** | govstruct invokes poststruct's CLI for the voice leg; the voice is poststruct's, never govstruct's |

**The interop law:** no host imports a sibling to check a sibling; it invokes
the sibling's public CLI. poststruct owns the audit arm and the voice; it does
not attack, watch pixels, or govern the roster.

## 9. Milestones

### M0 - bootstrap (COMPLETE except the manual publish)

- [x] Pack loader in the core from day 1: manifest validation, slug-namespaced
  ids, collision refusal, local-path sources.
- [x] Create `dhaupin/poststruct` - repo live, public, default branch `main`.
- [x] Port `scripts/seo-audit.mjs` as the `head` plus `site` modules: 19 check
  ids total.
- [x] Check registry plus findings schema plus CLI entry.
- [x] Fixtures: `test/fixtures/good/` plus `test/fixtures/bad/`, asserting the
  exact FAIL id set.
- [ ] **npm publish** - the one outstanding M0 item. 0.9.0 is built and green
  but NOT on the registry. This is the manual 0.x ladder per DEPLOY.md.
- Acceptance: `npx poststruct audit dist/` gates clean on poststruct's own baked
  tree.

### M1 - links plus the engine/co-client shapes

- [x] `wp-seo-shapes`, `jekyll-shapes`, `prestruct-shapes`, `freestruct-shapes`.
- [x] Internal link graph plus `_redirects` plus anchor targets (`links/broken-internal`
  FAIL, `links/redirect-target-missing` FAIL, `links/anchor-missing` WARN).
- [x] Optional `--check-external` (network gate, concurrency limit, per-URL
  retry, results cached for CI reuse); opt-in only, the default audit stays a
  pure file reader.

### M2 - i18n plus a11y-lite plus the ecosystem shapes

- [x] npm-source pack loading with the no-auto-download rule holding.
- [x] `astro-shapes`, `shopify-liquid-shapes`, `gatsby-shapes`, `hugo-shapes`,
  `eleventy-shapes` - each with a permanent negative test.
- [x] `lang`/`hreflang` module, informative-image alt heuristic.
- [x] language module plus the text-shaped input profile (the voice surface).
- [x] parsed frontmatter key/type surface.

### M3 - feeds plus the framework trio plus polish

- [ ] `nextjs-static-shapes`, `sveltekit`/`nuxt` static packs, `docs-suite-shapes`.
- [x] RSS/Atom checks.
- [ ] `docs` URLs per check, `--format=github` annotations mode.
- [ ] Public launch: flip repo public, add to creadev.org Projects data,
  announcement post.

## 10. Non-goals

- **No JSX/TS source linting.** Different job, different tool.
- **No runtime scoring (Lighthouse-style perf).** Numbers need a browser; our
  promise is files.
- **No auto-fixing.** Findings only - fixes belong to the engines and the
  developer.
- **No nursemaided plugin governance.** Packs are explicitly configured,
  locally loaded, manifest-validated - the governance is the loading contract,
  not a review process.

## 11. Site, docs, and house onboarding

- **Landing site: built on prestruct itself** (the engine eats its own cooking,
  and its output feeds poststruct as first customer). Domain:
  `poststruct.creadev.org`. Deploy: Cloudflare Pages (`wrangler.toml`,
  `functions/` with an `/api/health` canary).
- **Docs: the fleet's own shapes.** Domain: `docs.creadev.org/poststruct`.
  Freestruct output gets poststruct-audited; triple dogfood.
- **`/labs/TASKS.md`** - the own-runner convention.
- **`/horcrux/`** - continuance stones. Brain minted: `models/public/poststruct/`
  exists in the vant workspace; the boot stone lives at
  `horcrux/poststruct-p_poststruct2026-VqT3mK.svg`.

## 12. Honest risk register

- **Fragment targets (`#foo`) in linkcheck** require in-page anchor extraction.
  Ship anchors as WARN, promote once stable.
- **The a11y "informative image" heuristic is the oldest trap in automated
  a11y.** We mark `alt=""` as decorative and everything else as informative,
  documented as a conservative policy - never claim WCAG conformance.
- **Cliche detection is lexicon-and-construction matching, not authorship
  forensics.** It catches known tells; it will miss fresh AI-isms. Never claim
  it proves human authorship - it proves the absence of named patterns.
- **Zero-dep discipline vs future HTML parsing.** The seed uses regexes and
  they have held fine. If a check needs a real parser, that is the moment one
  dependency becomes acceptable - decided then, not now.
- **Scope creep pressure is real.** The file-on-disk fence is the defense;
  every pitch that violates it goes to non-goals immediately.

## 13. Open questions

1. Package layout: multirepo `poststruct` plus wrappers-in-engines vs monorepo.
2. Do the seed `head` checks *replace* the engines' `audit` proposals rather
   than complement them? (Lean: yes, one truth source.)
3. Do we want `poststruct.dev` for the docs-URL convention now or later?
4. Do we dogfood it in creadev CI from M0, or run both in parallel one week
   first? (Lean: parallel first.)
