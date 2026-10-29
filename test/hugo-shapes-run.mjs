#!/usr/bin/env node
// test/hugo-shapes-run.mjs - the hugo-shapes negative test is permanent: the
// good bake must be clean (zero EXPLOITED) and each bad bake must produce
// EXACTLY the expected EXPLOITED check id. Fixtures are SCAFFOLDED.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import pack from '../packs/public/hugo-shapes/index.mjs'

const BASE = fs.mkdtempSync(path.join(os.tmpdir(), 'hugo-shapes-'))
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

function page({ title, canonical, description, body, extraHead = '' }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <link rel="canonical" href="${canonical}" />
  ${description ? `<meta name="description" content="${description}" />` : ''}
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description || ''}" />
  ${extraHead}
</head>
<body><main><h1>${title}</h1><p>${body}</p></main></body>
</html>
`
}

function writePage(root, rel, opts) {
  const full = path.join(root, rel)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, page(opts))
}

const LONG = 'Hugo builds static sites quickly and this post explains how the summary template works in practice for authors.'

function scaffoldGoodBake(root) {
  writePage(root, 'index.html', { title: 'Home', canonical: 'https://acme.example.com/', description: 'A concise hand-written description of the home page.', body: LONG })
  writePage(root, 'posts/hello/index.html', { title: 'Hello', canonical: 'https://acme.example.com/posts/hello/', description: 'A hand-written summary that is not the body prose at all.', body: LONG })
  writePage(root, 'tags/hugo/index.html', { title: 'Tag: Hugo', canonical: 'https://acme.example.com/tags/hugo/', description: 'Posts tagged Hugo.', body: LONG })
  writePage(root, 'tags/hugo/page/2/index.html', { title: 'Tag: Hugo p2', canonical: 'https://acme.example.com/tags/hugo/page/2/', description: 'Posts tagged Hugo, page 2.', body: LONG })
  return root
}

const GOOD = scaffoldGoodBake(path.join(SHAPES, 'good-bake'))
function derive(name, mutate) { const dir = path.join(SHAPES, name); scaffoldGoodBake(dir); mutate(dir); return dir }

const fails = []
const assert = (cond, msg) => { if (!cond) fails.push(msg) }

// 1. good bake clean.
{
  const out = pack.run({ hugoTree: treeFs(GOOD) })
  const exploited = out.rows.filter((r) => r.verdict === 'EXPLOITED')
  assert(exploited.length === 0, `good bake must be clean, got ${JSON.stringify(exploited)}`)
  assert(out.ok, 'good bake must report ok')
}

// 2. missing key refuses.
{
  let threw = false
  try { pack.run({}) } catch (e) { threw = /hugoTree/.test(e.message) }
  assert(threw, 'a missing hugoTree key must refuse loudly')
}

// 3. no target -> BOUNDED.
{
  const out = pack.run({ hugoTree: treeFs(path.join(SHAPES, 'nope')) })
  assert(out.rows.every((r) => r.verdict === 'BOUNDED'), 'an empty target must docket BOUNDED')
}

const cases = [
  ['bad-summary-leak', 'hugo/summary-leak', 'the description is the first paragraph -> refused',
    (dir) => writePage(dir, 'index.html', { title: 'Home', canonical: 'https://acme.example.com/', description: LONG, body: LONG })],
  ['bad-summary-truncated', 'hugo/summary-leak', 'the description is the first paragraph truncated -> refused',
    (dir) => writePage(dir, 'index.html', { title: 'Home', canonical: 'https://acme.example.com/', description: LONG.slice(0, 80) + '…', body: LONG })],
  ['bad-taxonomy-pagination', 'hugo/taxonomy-pagination', 'a page-2 canonical drops the page segment -> refused',
    (dir) => writePage(dir, 'tags/hugo/page/2/index.html', { title: 'Tag: Hugo p2', canonical: 'https://acme.example.com/tags/hugo/', description: 'Posts tagged Hugo, page 2.', body: LONG })],
  ['bad-double-og', 'hugo/double-og', 'an og partial wired twice -> refused',
    (dir) => writePage(dir, 'posts/hello/index.html', { title: 'Hello', canonical: 'https://acme.example.com/posts/hello/', description: 'A hand-written summary that is not the body prose at all.', body: LONG, extraHead: '<meta property="og:title" content="Hello (again)" />' })],
]
for (const [name, id, label, mutate] of cases) {
  const dir = derive(name, mutate)
  const out = pack.run({ hugoTree: treeFs(dir) })
  const hit = out.rows.find((r) => r.id === id && r.verdict === 'EXPLOITED')
  assert(hit, `${name}: ${label} (got ${JSON.stringify(out.rows.map((r) => `${r.id}=${r.verdict}`))})`)
  const others = out.rows.filter((r) => r.verdict === 'EXPLOITED' && r.id !== id)
  assert(others.length === 0, `${name}: no cross-check bleed (got ${JSON.stringify(others)})`)
}

// 5. no paginated pages -> the pagination check is BOUNDED.
{
  const dir = path.join(SHAPES, 'no-pagination')
  writePage(dir, 'index.html', { title: 'Home', canonical: 'https://acme.example.com/', description: 'Hand-written.', body: LONG })
  const out = pack.run({ hugoTree: treeFs(dir) })
  const row = out.rows.find((r) => r.id === 'hugo/taxonomy-pagination')
  assert(row.verdict === 'BOUNDED', `no paginated pages: the pagination check is BOUNDED (got ${JSON.stringify(row)})`)
}

fs.rmSync(BASE, { recursive: true, force: true })
if (fails.length) { console.error(`hugo-shapes self-test FAIL:\n  ${fails.join('\n  ')}`); process.exit(1) }
console.log(`hugo-shapes self-test: docket levels + good bake 3/3 + ${cases.length}/${cases.length} bad bakes exact + no-pagination scope - PASS`)
process.exit(0)
