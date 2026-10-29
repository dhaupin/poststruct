#!/usr/bin/env node
// test/astro-shapes-run.mjs - the astro-shapes negative test is permanent:
// the good bake must be clean (zero EXPLOITED) and each bad bake must
// produce EXACTLY the expected EXPLOITED check id. If a refactor deletes a
// check, this fails. Fixtures are SCAFFOLDED, not committed: the battery
// builds a good bake in a temp dir and derives each bad fixture from it with
// one honest mutation.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import pack from '../packs/public/astro-shapes/index.mjs'

const BASE = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-shapes-'))
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

// A directory-shape Astro page: about/ is about/index.html, canonical has a
// trailing slash, islands live in the body.
function page({ title, canonical, body = '', headExtra = '', bodyExtra = '' }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <link rel="canonical" href="${canonical}" />
  ${headExtra}
</head>
<body>
  <main><h1>${title}</h1><p>${body}</p></main>
  <astro-island uid="x1" component-url="/_astro/Island.js"><div>island</div></astro-island>
  ${bodyExtra}
</body>
</html>
`
}

function scaffoldGoodBake(root) {
  fs.mkdirSync(path.join(root, 'about'), { recursive: true })
  fs.mkdirSync(path.join(root, 'blog'), { recursive: true })
  fs.writeFileSync(path.join(root, 'index.html'), page({
    title: 'Home', canonical: 'https://acme.example.com/', body: 'Home body',
  }))
  fs.writeFileSync(path.join(root, 'about/index.html'), page({
    title: 'About', canonical: 'https://acme.example.com/about/', body: 'About body',
  }))
  fs.writeFileSync(path.join(root, 'blog/index.html'), page({
    title: 'Blog', canonical: 'https://acme.example.com/blog/', body: 'Blog body',
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

const fails = []
const assert = (cond, msg) => { if (!cond) fails.push(msg) }

// 1. the good bake is clean: zero EXPLOITED, all checks PASSED.
{
  const out = pack.run({ astroTree: treeFs(GOOD) })
  const exploited = out.rows.filter((r) => r.verdict === 'EXPLOITED')
  assert(exploited.length === 0, `good bake must be clean, got ${JSON.stringify(exploited)}`)
  assert(out.ok, 'good bake must report ok')
}

// 2. the contract refuses when the key is missing.
{
  let threw = false
  try { pack.run({}) } catch (e) { threw = /astroTree/.test(e.message) }
  assert(threw, 'a missing astroTree key must refuse loudly')
}

// 3. no target -> BOUNDED, never a fake pass.
{
  const out = pack.run({ astroTree: treeFs(path.join(SHAPES, 'does-not-exist')) })
  assert(out.rows.every((r) => r.verdict === 'BOUNDED'), 'an empty target must docket BOUNDED')
}

// 4. each bad bake must hit EXACTLY its expected id (no missing, no bleed).
const cases = [
  ['bad-island-in-head', 'astro/island-in-head', 'an astro-island inside <head> -> refused',
    (dir) => {
      const p = path.join(dir, 'about/index.html')
      fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('</head>', '<astro-island uid="h1" component-url="/_astro/X.js"></astro-island></head>'))
    }],
  ['bad-module-in-head', 'astro/island-in-head', 'a hydration module script inside <head> -> refused',
    (dir) => {
      const p = path.join(dir, 'index.html')
      fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('</head>', '<script type="module" src="/_astro/hydrate.js"></script></head>'))
    }],
  ['bad-trailing-slash', 'astro/trailing-slash-drift', 'a directory-shape canonical with no trailing slash -> refused',
    (dir) => {
      const p = path.join(dir, 'about/index.html')
      fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('href="https://acme.example.com/about/"', 'href="https://acme.example.com/about"'))
    }],
  ['bad-static-path-missing', 'astro/static-path-missing', 'a link to a route never built -> refused',
    (dir) => {
      const p = path.join(dir, 'blog/index.html')
      fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('<p>Blog body</p>', '<p>Blog body</p><a href="/blog/missing-post/">Missing</a>'))
    }],
]
for (const [name, id, label, mutate] of cases) {
  const dir = derive(name, mutate)
  const out = pack.run({ astroTree: treeFs(dir) })
  assert(out.rows.length > 0, `${name}: the harness must produce rows`)
  const hit = out.rows.find((r) => r.id === id && r.verdict === 'EXPLOITED')
  assert(hit, `${name}: ${label} (got ${JSON.stringify(out.rows.map((r) => `${r.id}=${r.verdict}`))})`)
  const others = out.rows.filter((r) => r.verdict === 'EXPLOITED' && r.id !== id)
  assert(others.length === 0, `${name}: no cross-check bleed (got ${JSON.stringify(others)})`)
}

// 5. a file-shape tree accepts a slashless canonical and flags a slash one.
{
  const dir = path.join(SHAPES, 'file-shape')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'index.html'), page({ title: 'Home', canonical: 'https://acme.example.com/' }))
  fs.writeFileSync(path.join(dir, 'about.html'), page({ title: 'About', canonical: 'https://acme.example.com/about' }))
  const ok = pack.run({ astroTree: treeFs(dir) })
  const row = ok.rows.find((r) => r.id === 'astro/trailing-slash-drift')
  assert(row.verdict === 'PASSED', `file-shape: a slashless canonical passes (got ${JSON.stringify(row)})`)
  fs.writeFileSync(path.join(dir, 'about.html'), page({ title: 'About', canonical: 'https://acme.example.com/about/' }))
  const bad = pack.run({ astroTree: treeFs(dir) })
  const row2 = bad.rows.find((r) => r.id === 'astro/trailing-slash-drift')
  assert(row2.verdict === 'EXPLOITED', `file-shape: a slashed canonical on a file-shape tree fails (got ${JSON.stringify(row2)})`)
}

// 6. a mixed tree (both shapes) dockets the shape check BOUNDED.
{
  const dir = path.join(SHAPES, 'mixed-shape')
  scaffoldGoodBake(dir)
  fs.writeFileSync(path.join(dir, 'contact.html'), page({ title: 'Contact', canonical: 'https://acme.example.com/contact' }))
  const out = pack.run({ astroTree: treeFs(dir) })
  const row = out.rows.find((r) => r.id === 'astro/trailing-slash-drift')
  assert(row.verdict === 'BOUNDED', `mixed tree: the shape check is BOUNDED (got ${JSON.stringify(row)})`)
}

fs.rmSync(BASE, { recursive: true, force: true })
if (fails.length) {
  console.error(`astro-shapes self-test FAIL:\n  ${fails.join('\n  ')}`)
  process.exit(1)
}
console.log(`astro-shapes self-test: docket levels + good bake 3/3 + ${cases.length}/${cases.length} bad bakes exact + file-shape + mixed-shape - PASS`)
process.exit(0)
