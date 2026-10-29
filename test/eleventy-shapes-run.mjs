#!/usr/bin/env node
// test/eleventy-shapes-run.mjs - the eleventy-shapes negative test is
// permanent: the good bake must be clean (zero EXPLOITED) and each bad bake
// must produce EXACTLY the expected EXPLOITED check id. Fixtures SCAFFOLDED.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import pack from '../packs/public/eleventy-shapes/index.mjs'

const BASE = fs.mkdtempSync(path.join(os.tmpdir(), 'eleventy-shapes-'))
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

function page({ title, canonical }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <link rel="canonical" href="${canonical}" />
  <meta name="generator" content="Eleventy v2.0.1" />
</head>
<body><main><h1>${title}</h1></main></body>
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
  writePage(root, 'posts/hello/index.html', { title: 'Hello', canonical: 'https://acme.example.com/posts/hello/' })
  return root
}

const GOOD = scaffoldGoodBake(path.join(SHAPES, 'good-bake'))
function derive(name, mutate) { const dir = path.join(SHAPES, name); scaffoldGoodBake(dir); mutate(dir); return dir }

const fails = []
const assert = (cond, msg) => { if (!cond) fails.push(msg) }

// 1. good bake clean.
{
  const out = pack.run({ eleventyTree: treeFs(GOOD) })
  const exploited = out.rows.filter((r) => r.verdict === 'EXPLOITED')
  assert(exploited.length === 0, `good bake must be clean, got ${JSON.stringify(exploited)}`)
  assert(out.ok, 'good bake must report ok')
}

// 2. missing key refuses.
{
  let threw = false
  try { pack.run({}) } catch (e) { threw = /eleventyTree/.test(e.message) }
  assert(threw, 'a missing eleventyTree key must refuse loudly')
}

// 3. no target -> BOUNDED.
{
  const out = pack.run({ eleventyTree: treeFs(path.join(SHAPES, 'nope')) })
  assert(out.rows.every((r) => r.verdict === 'BOUNDED'), 'an empty target must docket BOUNDED')
}

const cases = [
  ['bad-pagination-href', 'eleventy/pagination-href-missing', 'a canonical to an unbuilt page -> refused',
    (dir) => writePage(dir, 'about/index.html', { title: 'About', canonical: 'https://acme.example.com/about-us/' })],
  ['bad-relative-to', 'eleventy/relative-to-drift', 'a canonical on the wrong origin -> refused',
    (dir) => writePage(dir, 'about/index.html', { title: 'About', canonical: 'https://staging.acme.example.com/about/' })],
  ['bad-collection-dupe', 'eleventy/collection-index-dupe', 'two files claim one URL -> refused',
    (dir) => fs.writeFileSync(path.join(dir, 'about.html'), page({ title: 'About alt', canonical: 'https://acme.example.com/about' }))],
]
for (const [name, id, label, mutate] of cases) {
  const dir = derive(name, mutate)
  const out = pack.run({ eleventyTree: treeFs(dir) })
  const hit = out.rows.find((r) => r.id === id && r.verdict === 'EXPLOITED')
  assert(hit, `${name}: ${label} (got ${JSON.stringify(out.rows.map((r) => `${r.id}=${r.verdict}`))})`)
  const others = out.rows.filter((r) => r.verdict === 'EXPLOITED' && r.id !== id)
  assert(others.length === 0, `${name}: no cross-check bleed (got ${JSON.stringify(others)})`)
}

// 5. no canonicals -> origin-drift check is BOUNDED.
{
  const dir = path.join(SHAPES, 'no-canonicals')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'index.html'), '<!DOCTYPE html><html lang="en"><head><title>x</title></head><body>plain</body></html>')
  const out = pack.run({ eleventyTree: treeFs(dir) })
  const row = out.rows.find((r) => r.id === 'eleventy/relative-to-drift')
  assert(row.verdict === 'BOUNDED', `no canonicals: origin-drift is BOUNDED (got ${JSON.stringify(row)})`)
}

fs.rmSync(BASE, { recursive: true, force: true })
if (fails.length) { console.error(`eleventy-shapes self-test FAIL:\n  ${fails.join('\n  ')}`); process.exit(1) }
console.log(`eleventy-shapes self-test: docket levels + good bake 3/3 + ${cases.length}/${cases.length} bad bakes exact + no-canonicals scope - PASS`)
process.exit(0)
