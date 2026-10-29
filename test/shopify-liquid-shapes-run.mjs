#!/usr/bin/env node
// test/shopify-liquid-shapes-run.mjs - the shopify-liquid-shapes negative
// test is permanent: the good bake must be clean (zero EXPLOITED) and each
// bad bake must produce EXACTLY the expected EXPLOITED check id. Fixtures
// are SCAFFOLDED, not committed.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import pack from '../packs/public/shopify-liquid-shapes/index.mjs'

const BASE = fs.mkdtempSync(path.join(os.tmpdir(), 'shopify-shapes-'))
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

function page({ title, canonical, extraHead = '', body = '' }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <link rel="canonical" href="${canonical}" />
  <meta property="og:type" content="website" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta property="og:image" content="https://cdn.shopify.com/s/files/1/card.png" />
  ${extraHead}
</head>
<body><main><h1>${title}</h1><p>${body}</p></main>
<script>window.Shopify = { theme: { name: 'Dawn' } }</script>
</body>
</html>
`
}

function writePage(root, rel, opts) {
  const full = path.join(root, rel)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, page(opts))
}

function scaffoldGoodBake(root) {
  writePage(root, 'index.html', { title: 'Home', canonical: 'https://shop.example.com/' })
  writePage(root, 'products/widget/index.html', { title: 'Widget', canonical: 'https://shop.example.com/products/widget' })
  writePage(root, 'collections/all/index.html', { title: 'All', canonical: 'https://shop.example.com/collections/all' })
  writePage(root, 'collections/all/page/2/index.html', { title: 'All p2', canonical: 'https://shop.example.com/collections/all/page/2' })
  return root
}

const GOOD = scaffoldGoodBake(path.join(SHAPES, 'good-bake'))
function derive(name, mutate) { const dir = path.join(SHAPES, name); scaffoldGoodBake(dir); mutate(dir); return dir }

const fails = []
const assert = (cond, msg) => { if (!cond) fails.push(msg) }

// 1. good bake clean.
{
  const out = pack.run({ shopifyTree: treeFs(GOOD) })
  const exploited = out.rows.filter((r) => r.verdict === 'EXPLOITED')
  assert(exploited.length === 0, `good bake must be clean, got ${JSON.stringify(exploited)}`)
  assert(out.ok, 'good bake must report ok')
}

// 2. missing key refuses.
{
  let threw = false
  try { pack.run({}) } catch (e) { threw = /shopifyTree/.test(e.message) }
  assert(threw, 'a missing shopifyTree key must refuse loudly')
}

// 3. no target -> BOUNDED.
{
  const out = pack.run({ shopifyTree: treeFs(path.join(SHAPES, 'nope')) })
  assert(out.rows.every((r) => r.verdict === 'BOUNDED'), 'an empty target must docket BOUNDED')
}

const cases = [
  ['bad-liquid-comment', 'shopify/liquid-leak', 'a {% comment %} block survived -> refused',
    (dir) => fs.writeFileSync(path.join(dir, 'index.html'), fs.readFileSync(path.join(dir, 'index.html'), 'utf8').replace('<p></p>', '<p></p>{% comment %} internal note {% endcomment %}'))],
  ['bad-liquid-output', 'shopify/liquid-leak', 'a {{ output }} expression survived -> refused',
    (dir) => fs.writeFileSync(path.join(dir, 'products/widget/index.html'), fs.readFileSync(path.join(dir, 'products/widget/index.html'), 'utf8').replace('<h1>Widget</h1>', '<h1>{{ product.title }}</h1>'))],
  ['bad-app-meta', 'shopify/app-meta-duplicated', 'a platform meta ships twice with different values -> refused',
    (dir) => fs.writeFileSync(path.join(dir, 'index.html'), fs.readFileSync(path.join(dir, 'index.html'), 'utf8').replace('</head>', '<meta property="og:type" content="product" /></head>'))],
  ['bad-pagination-canonical', 'shopify/pagination-canonical', 'a page-2 canonical drops the page param -> refused',
    (dir) => fs.writeFileSync(path.join(dir, 'collections/all/page/2/index.html'), fs.readFileSync(path.join(dir, 'collections/all/page/2/index.html'), 'utf8').replace('href="https://shop.example.com/collections/all/page/2"', 'href="https://shop.example.com/collections/all"'))],
]
for (const [name, id, label, mutate] of cases) {
  const dir = derive(name, mutate)
  const out = pack.run({ shopifyTree: treeFs(dir) })
  const hit = out.rows.find((r) => r.id === id && r.verdict === 'EXPLOITED')
  assert(hit, `${name}: ${label} (got ${JSON.stringify(out.rows.map((r) => `${r.id}=${r.verdict}`))})`)
  const others = out.rows.filter((r) => r.verdict === 'EXPLOITED' && r.id !== id)
  assert(others.length === 0, `${name}: no cross-check bleed (got ${JSON.stringify(others)})`)
}

// 5. a non-Shopify tree dockets the app-meta check BOUNDED.
{
  const dir = path.join(SHAPES, 'not-shopify')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'index.html'), '<!DOCTYPE html><html lang="en"><head><title>x</title><meta property="og:type" content="website"></head><body>plain</body></html>')
  const out = pack.run({ shopifyTree: treeFs(dir) })
  const row = out.rows.find((r) => r.id === 'shopify/app-meta-duplicated')
  assert(row.verdict === 'BOUNDED', `a non-Shopify tree: app-meta check is BOUNDED (got ${JSON.stringify(row)})`)
}

fs.rmSync(BASE, { recursive: true, force: true })
if (fails.length) { console.error(`shopify-liquid-shapes self-test FAIL:\n  ${fails.join('\n  ')}`); process.exit(1) }
console.log(`shopify-liquid-shapes self-test: docket levels + good bake 3/3 + ${cases.length}/${cases.length} bad bakes exact + not-shopify scope - PASS`)
process.exit(0)
