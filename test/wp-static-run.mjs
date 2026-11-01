#!/usr/bin/env node
// test/wp-static-run.mjs - the wp-static negative test is permanent: the good
// export must be clean (zero EXPLOITED) and each bad export must produce
// EXACTLY the expected EXPLOITED check id. If a refactor deletes a check,
// this fails. Fixtures are SCAFFOLDED, not committed: the battery builds a
// good export in a temp dir and derives each bad fixture from it with one
// honest mutation.
//
// The shape mirrors a WordPress 7.1.4 static export: the core generator
// meta, /feed/ baked as rss2, a self-canonical on every page, an html lang
// value, and no wp-json / RSD / wlwmanifest / emoji-rig residue (WP2Static
// strips them at export).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import pack from '../packs/public/wp-static/index.mjs'

const BASE = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-static-'))
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

const ORIGIN = 'http://localhost:8080'

function page({ title, canonical, lang = 'en-US', description = null, extraHead = '', body = '<main><p>Body prose.</p></main>', generator = 'WordPress 7.1.4' }) {
  const lines = [
    '<!DOCTYPE html>', `<html lang="${lang}">`, '<head>',
    '<meta charset="UTF-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    '<link rel="canonical" href="' + canonical + '" />',
    '<meta property="og:title" content="' + title + '" />',
    '<meta property="og:url" content="' + canonical + '" />',
  ]
  if (description != null) lines.push(`<meta name="description" content="${description}" />`)
  lines.push(extraHead, `<title>${title}</title>`)
  if (generator != null) lines.push(`<meta name="generator" content="${generator}" />`)
  lines.push('</head>', `<body class="wp-singular wp-theme-twentytwentyfive">`, body, '</body>', '</html>')
  return lines.filter((l) => l !== '').join('\n')
}

const FEED_ALTERNATE = `<link rel="alternate" type="application/rss+xml" title="Feed" href="${ORIGIN}/feed/" />`

function scaffoldGoodExport(root) {
  fs.mkdirSync(path.join(root, 'about'), { recursive: true })
  fs.mkdirSync(path.join(root, 'feed'), { recursive: true })
  fs.mkdirSync(path.join(root, 'category/news/page/2'), { recursive: true })
  fs.writeFileSync(path.join(root, 'index.html'), page({
    title: 'Home - Acme WP', canonical: `${ORIGIN}/`, extraHead: FEED_ALTERNATE,
  }))
  fs.writeFileSync(path.join(root, 'about/index.html'), page({
    title: 'About Us - Acme WP', canonical: `${ORIGIN}/about/`, description: 'An about page description that clears the length floor for the head module.',
  }))
  fs.writeFileSync(path.join(root, 'category/news/index.html'), page({
    title: 'news Archives - Acme WP', canonical: `${ORIGIN}/category/news/`,
  }))
  fs.writeFileSync(path.join(root, 'category/news/page/2/index.html'), page({
    title: 'news Archives - Page 2 of 2 - Acme WP', canonical: `${ORIGIN}/category/news/page/2/`,
  }))
  // 404 carries noindex ONLY (no canonical/og): the tightened contract the
  // pack pins - a 404 inherits the theme head unless the export strips it.
  fs.writeFileSync(path.join(root, '404.html'), [
    '<!DOCTYPE html>', '<html lang="en-US">', '<head>',
    '<meta charset="UTF-8" />',
    '<meta name="robots" content="noindex, follow" />',
    '<title>Page not found - Acme WP</title>',
    '<meta name="generator" content="WordPress 7.1.4" />',
    '</head>', '<body class="error404"><main><p>Not found.</p></main></body>', '</html>',
  ].join('\n'))
  // The /feed/ the alternate promises (rss2 index).
  fs.writeFileSync(path.join(root, 'feed/index.html'), '<!DOCTYPE html><html lang="en-US"><head><title>Feed</title></head><body><rss>feed</rss></body></html>')
  return root
}

const GOOD = scaffoldGoodExport(path.join(SHAPES, 'good-export'))

function derive(name, mutate) {
  const dir = path.join(SHAPES, name)
  scaffoldGoodExport(dir)
  mutate(dir)
  return dir
}

const bads = [
  // 404 inherits the theme head: og:/canonical plus no noindex
  derive('bad-404-theme-head', (d) => {
    fs.writeFileSync(path.join(d, '404.html'), page({
      title: 'Page not found - Acme WP', canonical: `${ORIGIN}/`,
      extraHead: '<meta property="og:title" content="Home - Acme WP" />',
    }))
  }),
  // a feed alternate that resolves to no file
  derive('bad-dangling-feed', (d) => {
    const p = path.join(d, 'index.html')
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(`${ORIGIN}/feed/`, `${ORIGIN}/feed/atom/`))
  }),
  // the live install's REST discovery survives the bake
  derive('bad-rest-discovery', (d) => {
    const p = path.join(d, 'about/index.html')
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('</head>', '<link rel="https://api.w.org/" href="http://localhost:8080/wp-json/" />\n</head>'))
  }),
  // a plugin stamped a second generator
  derive('bad-plugin-generator', (d) => {
    const p = path.join(d, 'about/index.html')
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('</head>', '<meta name="generator" content="Acme Builder 3.2" />\n</head>'))
  }),
  // page 2 canonical rewritten to the site root
  derive('bad-pagination-drift', (d) => {
    const p = path.join(d, 'category/news/page/2/index.html')
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(`href="${ORIGIN}/category/news/page/2/"`, `href="${ORIGIN}/"`))
  }),
  // the emoji rig survives the export
  derive('bad-emoji-rig', (d) => {
    const p = path.join(d, 'index.html')
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('</head>', '<script src="http://localhost:8080/wp-includes/js/wp-emoji-release.min.js"></script>\n</head>'))
  }),
  // the html lang value is lost
  derive('bad-lang-lost', (d) => {
    const p = path.join(d, 'about/index.html')
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('<html lang="en-US">', '<html>'))
  }),
]

const fails = []
const assert = (cond, label) => { if (!cond) fails.push(label) }

// 1. run-level contracts.
{
  const outNull = pack.run({ wpStaticTree: { root: null } })
  assert(outNull.ok === true, 'null tree: BOUNDED docket stays ok')
  assert(outNull.rows.length === 1 && outNull.rows[0].id === 'wp-static-baked-site-absent' && outNull.rows[0].verdict === 'BOUNDED', 'null tree: exactly one baked-site-absent BOUNDED row')
  const empty = path.join(SHAPES, 'empty')
  fs.mkdirSync(empty, { recursive: true })
  const outEmpty = pack.run({ wpStaticTree: treeFs(empty) })
  assert(outEmpty.ok === true && outEmpty.rows[0]?.verdict === 'BOUNDED', 'empty tree: docketed, not faked')
  let refused = false
  try { pack.run({}) } catch (err) {
    refused = err instanceof TypeError && /missing/.test(err.message)
  }
  assert(refused, 'un-armed context: run refuses loudly (TypeError, module contract)')
}

// 2. non-WordPress HTML dockets rather than judging it.
{
  const dir = path.join(SHAPES, 'not-wordpress')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'index.html'), '<!DOCTYPE html><html lang="en"><head><title>x</title></head><body><p>y</p></body></html>')
  const out = pack.run({ wpStaticTree: treeFs(dir) })
  assert(out.rows.length === 1 && out.rows[0].id === 'wp-static-not-a-wordpress-export' && out.rows[0].verdict === 'BOUNDED', `non-WP tree: single BOUNDED docket (got ${JSON.stringify(out.rows.map((r) => r.id))})`)
  assert(out.ok === true, 'non-WP tree: no EXPLOITED')
}

// 3. the good export is clean across all six checks.
{
  const out = pack.run({ wpStaticTree: treeFs(GOOD) })
  const bad = out.rows.filter((r) => r.verdict === 'EXPLOITED')
  assert(bad.length === 0, `good export: zero EXPLOITED (got ${JSON.stringify(bad)})`)
  const ids = new Set(out.rows.map((r) => r.id))
  for (const id of ['wp-404-noindex-only', 'wp-feed-alternate-resolve', 'wp-rest-discovery-stripped', 'wp-generator-tag-honest', 'wp-pagination-self-canonical', 'wp-emoji-hygiene']) {
    assert(ids.has(id), `good export: check ${id} produced a row`)
  }
}

// 4. each bad export must hit EXACTLY its expected id (no missing, no bleed).
const cases = [
  ['bad-404-theme-head', 'wp-404-noindex-only', 'a 404 inheriting the theme head -> refused'],
  ['bad-dangling-feed', 'wp-feed-alternate-resolve', 'a dangling feed alternate -> refused'],
  ['bad-rest-discovery', 'wp-rest-discovery-stripped', 'REST discovery surviving the bake -> refused'],
  ['bad-plugin-generator', 'wp-generator-tag-honest', 'a plugin-stamped generator -> refused'],
  ['bad-pagination-drift', 'wp-pagination-self-canonical', 'page 2 canonical rewritten to the root -> refused'],
  ['bad-emoji-rig', 'wp-emoji-hygiene', 'the emoji rig surviving the export -> refused'],
  ['bad-lang-lost', 'wp-emoji-hygiene', 'the html lang value lost -> refused'],
]
for (const [name, id, label] of cases) {
  const out = pack.run({ wpStaticTree: treeFs(path.join(SHAPES, name)) })
  assert(out.rows.length > 0, `${name}: the harness must produce rows`)
  const hit = out.rows.find((r) => r.id === id && r.verdict === 'EXPLOITED')
  assert(hit, `${name}: ${label} (got ${JSON.stringify(out.rows.map((r) => `${r.id}=${r.verdict}`))})`)
  const others = out.rows.filter((r) => r.verdict === 'EXPLOITED' && r.id !== id)
  assert(others.length === 0, `${name}: no cross-check bleed (got ${JSON.stringify(others.map((r) => r.id))})`)
}

// 5. a bounded scope: no /feed/ alternate -> feed check dockets BOUNDED.
{
  const dir = path.join(SHAPES, 'no-feed-alternate')
  scaffoldGoodExport(dir)
  const p = path.join(dir, 'index.html')
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(FEED_ALTERNATE, ''))
  const out = pack.run({ wpStaticTree: treeFs(dir) })
  const row = out.rows.find((r) => r.id === 'wp-feed-alternate-resolve')
  assert(row && row.verdict === 'BOUNDED' && row.bound === 'no-feed-alternates', `no alternate: feed check dockets BOUNDED (got ${JSON.stringify(row)})`)
}

fs.rmSync(BASE, { recursive: true, force: true })
if (fails.length) {
  console.error(`wp-static self-test FAIL:\n  ${fails.join('\n  ')}`)
  process.exit(1)
}
console.log(`wp-static self-test: docket levels + good export 6/6 + ${cases.length}/${cases.length} bad exports exact + no-alternate scope - PASS`)
process.exit(0)
