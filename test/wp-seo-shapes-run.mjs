#!/usr/bin/env node
// test/wp-seo-shapes-run.mjs - the wp-seo-shapes negative test is permanent:
// the good bake must be clean (zero EXPLOITED) and each bad bake must
// produce EXACTLY the expected EXPLOITED check id. If a refactor deletes a
// check, this fails. Fixtures are SCAFFOLDED, not committed: the battery
// builds a good bake in a temp dir and derives each bad fixture from it with
// one honest mutation.
//
// The shape mirrors real WordPress 7.1.4 + Yoast SEO 28.8 output (learned by
// baking a site on SQLite): the generator meta, a single yoast-schema-graph
// block, a self-referential canonical, no plain description unless set, and
// an index,follow robots tag.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import pack from '../packs/public/wp-seo-shapes/index.mjs'

const BASE = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-seo-shapes-'))
const SHAPES = path.join(BASE, 'fixtures')

function treeFs(root) {
  const safe = (rel) => (typeof rel === 'string' && !rel.startsWith('/') && !rel.split(/[\\/]/).includes('..') ? rel : null)
  return {
    root,
    exists: (rel) => { const r = safe(rel); return r != null && fs.existsSync(path.join(root, r)) },
    text: (rel) => { const r = safe(rel); try { return r == null ? null : fs.readFileSync(path.join(root, r), 'utf8') } catch { return null } },
    readdir: (rel) => { const r = safe(rel); try { return r == null ? [] : fs.readdirSync(path.join(root, r)) } catch { return [] } },
  }
}

const SCHEMA = `{"@context":"https://schema.org","@graph":[{"@type":"WebPage","@id":"SITE#webpage"},{"@type":"BreadcrumbList","@id":"SITE#breadcrumb"},{"@type":"WebSite","@id":"SITE#website"}]}`

function page({ title, canonical, robots = "index, follow, max-image-preview:large", description = null, ogTitle = null, bodyClass = 'page', extraHead = '', schema = true }) {
  const lines = [
    '<!DOCTYPE html>', '<html lang="en-US">', '<head>',
    '<meta charset="UTF-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<meta name='robots' content='${robots}' />`,
    `<link rel="canonical" href="${canonical}" />`,
    `<meta property="og:title" content="${ogTitle ?? title}" />`,
    '<meta property="og:type" content="website" />',
    `<meta property="og:url" content="${canonical}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
  ]
  if (description != null) lines.push(`<meta name="description" content="${description}" />`)
  if (schema) lines.push(`<script type="application/ld+json" class="yoast-schema-graph">${SCHEMA}</script>`)
  lines.push(extraHead, `<title>${title}</title>`, '<meta name="generator" content="WordPress 7.1.4" />')
  lines.push('</head>', `<body class="${bodyClass} wp-singular wp-theme-twentytwentyfive">`, '<main><p>Body prose.</p></main></body>', '</html>')
  return lines.filter((l) => l !== '').join('\n')
}

function scaffoldGoodBake(root) {
  fs.mkdirSync(path.join(root, 'about'), { recursive: true })
  fs.mkdirSync(path.join(root, 'category/news/page/2'), { recursive: true })
  fs.writeFileSync(path.join(root, 'index.html'), page({
    title: 'Home - Acme WP', canonical: 'http://localhost:8080/', bodyClass: 'home page',
  }))
  fs.writeFileSync(path.join(root, 'about/index.html'), page({
    title: 'About Us - Acme WP', canonical: 'http://localhost:8080/about/', description: 'A Yoast-set description for the About page.',
  }))
  fs.writeFileSync(path.join(root, 'category/news/index.html'), page({
    title: 'news Archives - Acme WP', canonical: 'http://localhost:8080/category/news/', bodyClass: 'archive category',
  }))
  fs.writeFileSync(path.join(root, 'category/news/page/2/index.html'), page({
    title: 'news Archives - Page 2 of 2 - Acme WP', canonical: 'http://localhost:8080/category/news/page/2/', bodyClass: 'archive category paged',
  }))
  return root
}

const GOOD = scaffoldGoodBake(path.join(SHAPES, 'good-bake'))

function derive(name, mutate) {
  const dir = path.join(SHAPES, name)
  scaffoldGoodBake(dir)
  mutate(dir)
  return dir
}

const bads = [
  // the plugin + theme collision: a second description with a different value
  derive('bad-double-description', (d) => {
    const p = path.join(d, 'about/index.html')
    const s = fs.readFileSync(p, 'utf8').replace('<link rel="canonical"', '<meta name="description" content="Theme-hardcoded description." />\n<link rel="canonical"')
    fs.writeFileSync(p, s)
  }),
  // the plugin + theme collision: a second og:title with a different value
  derive('bad-double-ogtitle', (d) => {
    const p = path.join(d, 'index.html')
    const s = fs.readFileSync(p, 'utf8').replace('<link rel="canonical"', '<meta property="og:title" content="Home" />\n<link rel="canonical"')
    fs.writeFileSync(p, s)
  }),
  // the plugin + theme collision: a second JSON-LD graph
  derive('bad-double-schema', (d) => {
    const p = path.join(d, 'index.html')
    const s = fs.readFileSync(p, 'utf8').replace('</head>', '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Acme WP"}</script>\n</head>')
    fs.writeFileSync(p, s)
  }),
  // an indexable attachment page inheriting the front page canonical
  derive('bad-attachment-canonical', (d) => {
    fs.mkdirSync(path.join(d, 'tiny-image'), { recursive: true })
    fs.writeFileSync(path.join(d, 'tiny-image/index.html'), page({
      title: 'Tiny Image - Acme WP', canonical: 'http://localhost:8080/',
      bodyClass: 'attachment wp-singular single single-attachment postid-8 attachmentid-8 attachment-png',
    }))
  }),
  // a paginated archive canonicalising to page 1
  derive('bad-archive-drift', (d) => {
    const p = path.join(d, 'category/news/page/2/index.html')
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('href="http://localhost:8080/category/news/page/2/"', 'href="http://localhost:8080/category/news/"'))
  }),
]

const fails = []
const assert = (cond, label) => { if (!cond) fails.push(label) }

// 1. run-level contracts.
{
  const outNull = pack.run({ wpTree: { root: null } })
  assert(outNull.ok === true, 'null tree: BOUNDED docket stays ok')
  assert(outNull.rows.length === 1 && outNull.rows[0].id === 'wp/baked-site-absent' && outNull.rows[0].verdict === 'BOUNDED', 'null tree: exactly one baked-site-absent BOUNDED row')
  const empty = path.join(SHAPES, 'empty')
  fs.mkdirSync(empty, { recursive: true })
  const outEmpty = pack.run({ wpTree: treeFs(empty) })
  assert(outEmpty.ok === true && outEmpty.rows[0]?.verdict === 'BOUNDED', 'empty tree: docketed, not faked')
  let refused = false
  try { pack.run({}) } catch (err) {
    refused = err instanceof TypeError && /missing/.test(err.message)
  }
  assert(refused, 'un-armed context: run refuses loudly (TypeError, module contract)')
}

// 2. non-WordPress HTML dockets every check rather than judging it.
{
  const dir = path.join(SHAPES, 'not-wordpress')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'index.html'), '<!DOCTYPE html><html><head><title>x</title></head><body><p>y</p></body></html>')
  const out = pack.run({ wpTree: treeFs(dir) })
  assert(out.rows.length === 1 && out.rows[0].id === 'wp/not-a-wordpress-bake' && out.rows[0].verdict === 'BOUNDED', `non-WP tree: single BOUNDED docket (got ${JSON.stringify(out.rows.map((r) => r.id))})`)
  assert(out.ok === true, 'non-WP tree: no EXPLOITED')
}

// 3. WordPress without an SEO plugin: duplication check dockets BOUNDED.
{
  const dir = path.join(SHAPES, 'wp-no-seo-plugin')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'index.html'), page({
    title: 'Home - Acme WP', canonical: 'http://localhost:8080/', bodyClass: 'home page', schema: false,
  }))
  const out = pack.run({ wpTree: treeFs(dir) })
  const row = out.rows.find((r) => r.id === 'wp/head-seo-duplicated')
  assert(row && row.verdict === 'BOUNDED' && row.bound === 'seo-plugin-absent', `no plugin: duplication dockets BOUNDED (got ${JSON.stringify(row)})`)
}

// 4. the good bake is clean across all three checks.
{
  const out = pack.run({ wpTree: treeFs(GOOD) })
  const bad = out.rows.filter((r) => r.verdict === 'EXPLOITED')
  assert(bad.length === 0, `good bake: zero EXPLOITED (got ${JSON.stringify(bad)})`)
  const ids = new Set(out.rows.map((r) => r.id))
  for (const id of ['wp/head-seo-duplicated', 'wp/attachment-canonical', 'wp/archive-canonical-drift']) {
    assert(ids.has(id), `good bake: check ${id} produced a row`)
  }
  const att = out.rows.find((r) => r.id === 'wp/attachment-canonical')
  assert(att.verdict === 'BOUNDED', 'good bake: no attachment page -> BOUNDED, not a fake pass')
}

// 5. each bad bake must hit EXACTLY its expected id (no missing, no bleed).
const cases = [
  ['bad-double-description', 'wp/head-seo-duplicated', 'a second description with a different value -> refused'],
  ['bad-double-ogtitle', 'wp/head-seo-duplicated', 'a second og:title with a different value -> refused'],
  ['bad-double-schema', 'wp/head-seo-duplicated', 'a second JSON-LD schema block -> refused'],
  ['bad-attachment-canonical', 'wp/attachment-canonical', 'an indexable attachment inheriting the root canonical -> refused'],
  ['bad-archive-drift', 'wp/archive-canonical-drift', 'a paginated archive canonicalising to page 1 -> refused'],
]
for (const [name, id, label] of cases) {
  const out = pack.run({ wpTree: treeFs(path.join(SHAPES, name)) })
  assert(out.rows.length > 0, `${name}: the harness must produce rows`)
  const hit = out.rows.find((r) => r.id === id && r.verdict === 'EXPLOITED')
  assert(hit, `${name}: ${label} (got ${JSON.stringify(out.rows.map((r) => `${r.id}=${r.verdict}`))})`)
  const others = out.rows.filter((r) => r.verdict === 'EXPLOITED' && r.id !== id)
  assert(others.length === 0, `${name}: no cross-check bleed (got ${JSON.stringify(others)})`)
}

// 6. an attachment that IS correctly canonicalised and noindexed passes.
{
  const dir = path.join(SHAPES, 'attachment-clean')
  scaffoldGoodBake(dir)
  fs.mkdirSync(path.join(dir, 'tiny-image'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tiny-image/index.html'), page({
    title: 'Tiny Image - Acme WP', canonical: 'http://localhost:8080/tiny-image/',
    robots: 'noindex, follow',
    bodyClass: 'attachment wp-singular single single-attachment postid-8',
  }))
  const out = pack.run({ wpTree: treeFs(dir) })
  const row = out.rows.find((r) => r.id === 'wp/attachment-canonical')
  assert(row.verdict === 'PASSED', `clean attachment: self canonical + noindex passes (got ${JSON.stringify(row)})`)
}

fs.rmSync(BASE, { recursive: true, force: true })
if (fails.length) {
  console.error(`wp-seo-shapes self-test FAIL:\n  ${fails.join('\n  ')}`)
  process.exit(1)
}
console.log(`wp-seo-shapes self-test: docket levels + good bake 3/3 + ${cases.length}/${cases.length} bad bakes exact + clean-attachment scope - PASS`)
process.exit(0)
