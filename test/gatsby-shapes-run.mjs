#!/usr/bin/env node
// test/gatsby-shapes-run.mjs - the gatsby-shapes negative test is permanent:
// the good bake must be clean (zero EXPLOITED) and each bad bake must
// produce EXACTLY the expected EXPLOITED check id. Fixtures are SCAFFOLDED.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import pack from '../packs/public/gatsby-shapes/index.mjs'

const BASE = fs.mkdtempSync(path.join(os.tmpdir(), 'gatsby-shapes-'))
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

function page({ title, canonical, ogImage = 'https://acme.example.com/card.png', robots = null }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <link rel="canonical" href="${canonical}" />
  <meta property="og:image" content="${ogImage}" />
  ${robots ? `<meta name="robots" content="${robots}" />` : ''}
</head>
<body><div id="___gatsby"><div class="gatsby-focus-wrapper"><main><h1>${title}</h1></main></div></div>
<script>window.___gatsby = true</script></body>
</html>
`
}

function writePage(root, rel, opts) {
  const full = path.join(root, rel)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, page(opts))
}

function scaffoldGoodBake(root) {
  writePage(root, 'index.html', { title: 'Home', canonical: 'https://acme.example.com/' })
  writePage(root, 'about/index.html', { title: 'About', canonical: 'https://acme.example.com/about/' })
  fs.writeFileSync(path.join(root, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://acme.example.com/</loc></url>
  <url><loc>https://acme.example.com/about/</loc></url>
</urlset>
`)
  return root
}

const GOOD = scaffoldGoodBake(path.join(SHAPES, 'good-bake'))
function derive(name, mutate) { const dir = path.join(SHAPES, name); scaffoldGoodBake(dir); mutate(dir); return dir }

const fails = []
const assert = (cond, msg) => { if (!cond) fails.push(msg) }

// 1. good bake clean.
{
  const out = pack.run({ gatsbyTree: treeFs(GOOD) })
  const exploited = out.rows.filter((r) => r.verdict === 'EXPLOITED')
  assert(exploited.length === 0, `good bake must be clean, got ${JSON.stringify(exploited)}`)
  assert(out.ok, 'good bake must report ok')
}

// 2. missing key refuses.
{
  let threw = false
  try { pack.run({}) } catch (e) { threw = /gatsbyTree/.test(e.message) }
  assert(threw, 'a missing gatsbyTree key must refuse loudly')
}

// 3. no target -> BOUNDED.
{
  const out = pack.run({ gatsbyTree: treeFs(path.join(SHAPES, 'nope')) })
  assert(out.rows.every((r) => r.verdict === 'BOUNDED'), 'an empty target must docket BOUNDED')
}

const cases = [
  ['bad-data-uri-og', 'gatsby/data-uri-og', 'a data: URI og:image -> refused',
    (dir) => writePage(dir, 'about/index.html', { title: 'About', canonical: 'https://acme.example.com/about/', ogImage: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==' })],
  ['bad-noindex-leftover', 'gatsby/noindex-leftover', 'a sitemap-listed page carries noindex -> refused',
    (dir) => writePage(dir, 'about/index.html', { title: 'About', canonical: 'https://acme.example.com/about/', robots: 'noindex, follow' })],
  ['bad-sitemap-dupe', 'gatsby/sitemap-dupe', 'the same loc appears twice -> refused',
    (dir) => fs.writeFileSync(path.join(dir, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://acme.example.com/</loc></url>
  <url><loc>https://acme.example.com/about/</loc></url>
  <url><loc>https://acme.example.com/about/</loc></url>
</urlset>
`)],
]
for (const [name, id, label, mutate] of cases) {
  const dir = derive(name, mutate)
  const out = pack.run({ gatsbyTree: treeFs(dir) })
  const hit = out.rows.find((r) => r.id === id && r.verdict === 'EXPLOITED')
  assert(hit, `${name}: ${label} (got ${JSON.stringify(out.rows.map((r) => `${r.id}=${r.verdict}`))})`)
  const others = out.rows.filter((r) => r.verdict === 'EXPLOITED' && r.id !== id)
  assert(others.length === 0, `${name}: no cross-check bleed (got ${JSON.stringify(others)})`)
}

// 5. a noindex page NOT in the sitemap is clean (a real noindex is respected).
{
  const dir = path.join(SHAPES, 'legit-noindex')
  scaffoldGoodBake(dir)
  writePage(dir, 'draft/index.html', { title: 'Draft', canonical: 'https://acme.example.com/draft/', robots: 'noindex, nofollow' })
  const out = pack.run({ gatsbyTree: treeFs(dir) })
  const row = out.rows.find((r) => r.id === 'gatsby/noindex-leftover')
  assert(row.verdict === 'PASSED', `a noindex page not in the sitemap is respected (got ${JSON.stringify(row)})`)
}

// 6. no sitemap -> both sitemap-dependent checks BOUNDED.
{
  const dir = path.join(SHAPES, 'no-sitemap')
  writePage(dir, 'index.html', { title: 'Home', canonical: 'https://acme.example.com/' })
  const out = pack.run({ gatsbyTree: treeFs(dir) })
  for (const id of ['gatsby/noindex-leftover', 'gatsby/sitemap-dupe']) {
    const row = out.rows.find((r) => r.id === id)
    assert(row.verdict === 'BOUNDED', `${id} without a sitemap is BOUNDED (got ${JSON.stringify(row)})`)
  }
}

fs.rmSync(BASE, { recursive: true, force: true })
if (fails.length) { console.error(`gatsby-shapes self-test FAIL:\n  ${fails.join('\n  ')}`); process.exit(1) }
console.log(`gatsby-shapes self-test: docket levels + good bake 3/3 + ${cases.length}/${cases.length} bad bakes exact + legit-noindex + no-sitemap scope - PASS`)
process.exit(0)
