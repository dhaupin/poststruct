#!/usr/bin/env node
// test/freestruct-shapes-run.mjs - the freestruct-shapes negative test is
// permanent: the good bake must be clean (zero EXPLOITED) and each bad bake
// must produce EXACTLY the expected EXPLOITED check id. If a refactor
// deletes a check, this fails. Fixtures are SCAFFOLDED, not committed: the
// battery builds a good bake in a temp dir and derives each bad fixture from
// it with one honest mutation.
//
// The shape mirrors real freestruct 1.1.0 output (learned by baking the docs
// tree): one build hash on every page AND every ?v= param, a noindex 404
// that got the full pass, absolute canonicals on one origin.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import pack from '../packs/public/freestruct-shapes/index.mjs'

const BASE = fs.mkdtempSync(path.join(os.tmpdir(), 'freestruct-shapes-'))
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

const HASH = 'abc12345'

function page(slug, url) {
  return `<!DOCTYPE html>
<html lang="en"><head>
<title>${slug || 'home'}</title>
<link rel="stylesheet" href="/docs/assets/style.css?v=${HASH}" />
<link rel="icon" href="/docs/icon.svg?v=${HASH}" />
<meta name="freestruct-build" content="${HASH}" />
<meta name="description" content="a docs page" />
<link rel="canonical" href="${url}" />
<meta property="og:title" content="${slug || 'home'}" />
<meta property="og:url" content="${url}" />
<meta property="og:image" content="https://docs.example.com/og.png" />
<meta name="twitter:card" content="summary" />
</head>
<body><h1>${slug || 'home'}</h1></body>
</html>
`
}

function notFound() {
  return `<!DOCTYPE html>
<html lang="en"><head>
<title>404</title>
<meta name="robots" content="noindex, nofollow" />
<meta name="freestruct-build" content="${HASH}" />
<meta name="description" content="not found" />
<meta property="og:title" content="404" />
<meta property="og:url" content="https://docs.example.com/404" />
<meta property="og:image" content="https://docs.example.com/og.png" />
<meta name="twitter:card" content="summary" />
</head>
<body><h1>404</h1></body>
</html>
`
}

function scaffoldGoodBake(root) {
  fs.mkdirSync(path.join(root, 'guide'), { recursive: true })
  fs.writeFileSync(path.join(root, 'index.html'), page('', 'https://docs.example.com/'))
  fs.writeFileSync(path.join(root, 'guide/index.html'), page('guide', 'https://docs.example.com/guide'))
  fs.writeFileSync(path.join(root, '404.html'), notFound())
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
  derive('bad-build-drift', (d) => {
    const p = path.join(d, 'guide/index.html')
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(`content="${HASH}"`, 'content="deadbeef"'))
  }),
  derive('bad-cache-bust', (d) => {
    const p = path.join(d, 'index.html')
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(`style.css?v=${HASH}`, 'style.css?v=stale99'))
  }),
  derive('bad-double-inject', (d) => {
    const p = path.join(d, 'index.html')
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('<body>', '<meta name="description" content="a second one" />\n<body>'))
  }),
  derive('bad-canonical-relative', (d) => {
    const p = path.join(d, 'guide/index.html')
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('href="https://docs.example.com/guide"', 'href="/guide"'))
  }),
  derive('bad-canonical-origin', (d) => {
    const p = path.join(d, 'guide/index.html')
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('https://docs.example.com/guide', 'https://other.example.com/guide'))
  }),
  derive('bad-404-noindex', (d) => {
    const p = path.join(d, '404.html')
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('<meta name="robots" content="noindex, nofollow" />', '<meta name="robots" content="index, follow" />'))
  }),
  derive('bad-404-pipeline', (d) => {
    const p = path.join(d, '404.html')
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('<meta name="description" content="not found" />', ''))
  }),
]

const fails = []
const assert = (cond, label) => { if (!cond) fails.push(label) }

// 1. run-level contracts: an un-armed tree dockets BOUNDED; an empty tree
//    dockets BOUNDED; an un-armed context is refused loudly.
{
  const outNull = pack.run({ freestructTree: { root: null } })
  assert(outNull.ok === true, 'null tree: BOUNDED docket stays ok')
  assert(outNull.rows.length === 1 && outNull.rows[0].id === 'freestruct/baked-site-absent' && outNull.rows[0].verdict === 'BOUNDED', 'null tree: exactly one baked-site-absent BOUNDED row')
  const empty = path.join(SHAPES, 'empty')
  fs.mkdirSync(empty, { recursive: true })
  const outEmpty = pack.run({ freestructTree: treeFs(empty) })
  assert(outEmpty.ok === true && outEmpty.rows[0]?.verdict === 'BOUNDED', 'empty tree: docketed, not faked')
  let refused = false
  try { pack.run({}) } catch (err) {
    refused = err instanceof TypeError && /missing/.test(err.message)
  }
  assert(refused, 'un-armed context: run refuses loudly (TypeError, module contract)')
}

// 2. the good bake is clean across all five checks.
{
  const out = pack.run({ freestructTree: treeFs(GOOD) })
  const bad = out.rows.filter((r) => r.verdict === 'EXPLOITED')
  assert(bad.length === 0, `good bake: zero EXPLOITED (got ${JSON.stringify(bad)})`)
  const ids = new Set(out.rows.map((r) => r.id))
  for (const id of [
    'freestruct/build-drift', 'freestruct/cache-bust-drift',
    'freestruct/injection-duplicated', 'freestruct/canonical-absolute',
    'freestruct/404-contract',
  ]) assert(ids.has(id), `good bake: check ${id} produced a row`)
}

// 3. each bad bake must hit EXACTLY its expected id (no missing, no bleed).
const cases = [
  ['bad-build-drift', 'freestruct/build-drift', 'two freestruct-build ids -> a partial bake refused'],
  ['bad-cache-bust', 'freestruct/cache-bust-drift', 'a ?v= param from another build -> refused'],
  ['bad-double-inject', 'freestruct/injection-duplicated', 'a doubled head tag -> the missing-only gate failed'],
  ['bad-canonical-relative', 'freestruct/canonical-absolute', 'a root-relative canonical on a sub-path install -> refused'],
  ['bad-canonical-origin', 'freestruct/canonical-absolute', 'two canonical origins -> refused'],
  ['bad-404-noindex', 'freestruct/404-contract', 'a 404 without noindex -> refused'],
  ['bad-404-pipeline', 'freestruct/404-contract', 'a 404 that missed the post-render pass -> refused'],
]
for (const [name, id, label] of cases) {
  const out = pack.run({ freestructTree: treeFs(path.join(SHAPES, name)) })
  assert(out.rows.length > 0, `${name}: the harness must produce rows`)
  const hit = out.rows.find((r) => r.id === id && r.verdict === 'EXPLOITED')
  assert(hit, `${name}: ${label} (got ${JSON.stringify(out.rows.map((r) => `${r.id}=${r.verdict}`))})`)
  const others = out.rows.filter((r) => r.verdict === 'EXPLOITED' && r.id !== id)
  assert(others.length === 0, `${name}: no cross-check bleed (got ${JSON.stringify(others)})`)
}

fs.rmSync(BASE, { recursive: true, force: true })
if (fails.length) {
  console.error(`freestruct-shapes self-test FAIL:\n  ${fails.join('\n  ')}`)
  process.exit(1)
}
console.log(`freestruct-shapes self-test: docket levels + good bake 5/5 + ${cases.length}/${cases.length} bad bakes exact - PASS`)
process.exit(0)
