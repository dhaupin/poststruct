#!/usr/bin/env node
// test/prestruct-shapes-run.mjs - the prestruct-shapes negative test is
// permanent: the good bake must be clean (zero EXPLOITED) and each bad bake
// must produce EXACTLY the expected EXPLOITED check id. If a refactor
// deletes a check, this fails. Fixtures are SCAFFOLDED, not committed: the
// battery builds the good bake in a temp dir and derives each bad fixture
// from it with one honest mutation - so the pack's refusal surface has a
// permanent negative test with zero fixture bytes to transport.
//
// The load-bearing case is the false-positive guard: a hand-authored shell
// page (no app mount) must NOT be flagged for the missing SSR marker, and a
// tree with no deploy-id must docket BOUNDED rather than fail.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import pack from '../packs/public/prestruct-shapes/index.mjs'

const BASE = fs.mkdtempSync(path.join(os.tmpdir(), 'prestruct-shapes-'))
const SHAPES = path.join(BASE, 'fixtures')

// A dist-rooted fsapi over one fixture dir - the same contract the runner
// arms as moduleCtx.prestructShapes.
function distFs(root) {
  const safe = (rel) => (typeof rel === 'string' && !rel.startsWith('/') && !rel.split(/[\\/]/).includes('..') ? rel : null)
  return {
    distDir: root,
    exists: (rel) => { const r = safe(rel); return r != null && fs.existsSync(path.join(root, r)) },
    text: (rel) => { const r = safe(rel); try { return r == null ? null : fs.readFileSync(path.join(root, r), 'utf8') } catch { return null } },
    readdir: (rel) => { const r = safe(rel); try { return r == null ? [] : fs.readdirSync(path.join(root, r)) } catch { return [] } },
  }
}

// One engine-rendered page: a mounted #root carrying the SSR marker, a
// deploy-id, and og:url in step with rel=canonical.
function bakedPage(slug, deployId, url) {
  return `<!DOCTYPE html>
<html lang="en"><head>
<title>${slug || 'home'}</title>
<meta name="description" content="a baked page" />
<meta name="deploy-id" content="${deployId}" />
<link rel="canonical" href="${url}" />
<meta property="og:url" content="${url}" />
</head>
<body><div id="root" data-server-rendered="true"><h1>${slug || 'home'}</h1></div></body>
</html>
`
}

// A hand-authored shell page: no app mount, so the SSR marker AND the
// deploy-id check are exempt (the shell is not part of the prerender stamp).
// Deliberately carries NO deploy-id, to pin the false-positive guard.
function shellPage() {
  return `<!DOCTYPE html>
<html lang="en"><head>
<title>Not found</title>
<meta name="description" content="no such page" />
<link rel="canonical" href="https://example.com/404" />
</head>
<body><h1>404</h1></body>
</html>
`
}

function scaffoldGoodBake(root) {
  fs.mkdirSync(path.join(root, 'terms'), { recursive: true })
  fs.mkdirSync(path.join(root, 'privacy'), { recursive: true })
  fs.writeFileSync(path.join(root, 'index.html'), bakedPage('', 'BUILD', 'https://example.com'))
  fs.writeFileSync(path.join(root, 'terms/index.html'), bakedPage('terms', 'BUILD', 'https://example.com/terms'))
  fs.writeFileSync(path.join(root, 'privacy/index.html'), bakedPage('privacy', 'BUILD', 'https://example.com/privacy'))
  fs.writeFileSync(path.join(root, '404.html'), shellPage())
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
  derive('bad-ssr-marker', (d) => {
    const p = path.join(d, 'index.html')
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(' data-server-rendered="true"', ''))
  }),
  derive('bad-deploy-id-split', (d) => {
    const p = path.join(d, 'terms/index.html')
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('content="BUILD"', 'content="OTHER"'))
  }),
  derive('bad-deploy-id-unstamped', (d) => {
    const p = path.join(d, 'privacy/index.html')
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/\s*<meta name="deploy-id"[^>]*\/>/, ''))
  }),
  derive('bad-canonical-ogurl', (d) => {
    const p = path.join(d, 'terms/index.html')
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('content="https://example.com/terms"', 'content="https://example.com/other"'))
  }),
  derive('bad-placeholder', (d) => {
    // The template-leak shape: the page serves the engine init shell's
    // placeholder title instead of the injected brand. Surgical -
    // canonical/og:url stay in step.
    const p = path.join(d, 'privacy/index.html')
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('<title>privacy</title>', '<title>Site</title>'))
  }),
  derive('bad-placeholder-host', (d) => {
    // The other real token: the shell's placeholder canonical host survived.
    // (Both tokens are separate rows, so both must be load-bearing.)
    const p = path.join(d, 'index.html')
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/https:\/\/example\.com(?![/\w-])/g, 'https://yoursite.com'))
  }),
  // No deploy-id anywhere: the single-build claim is unverifiable -> BOUNDED.
  derive('bounded-no-deploy-id', (d) => {
    for (const rel of ['index.html', 'terms/index.html', 'privacy/index.html']) {
      const p = path.join(d, rel)
      fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/\s*<meta name="deploy-id"[^>]*\/>/, ''))
    }
  }),
]

const fails = []
const assert = (cond, label) => { if (!cond) fails.push(label) }

// 1. run-level contracts: an empty dist dockets BOUNDED; an un-armed context
//    is refused loudly (the REFUSED class).
{
  const empty = path.join(SHAPES, 'empty')
  fs.mkdirSync(empty, { recursive: true })
  const out = pack.run(distFs(empty))
  assert(out.ok === true, 'empty dist: BOUNDED docket stays ok (a bounded audit is not a failure)')
  assert(out.rows.length === 1 && out.rows[0].id === 'prestruct/no-baked-pages' && out.rows[0].verdict === 'BOUNDED', 'empty dist: exactly one no-baked-pages BOUNDED row')
  let refused = false
  try { pack.run({}) } catch (err) {
    refused = err instanceof TypeError && /missing/.test(err.message)
  }
  assert(refused, 'un-armed context: run refuses loudly (TypeError, module contract)')
}

// 2. the good bake is clean across all four checks, AND the shell page is
//    not flagged - the load-bearing false-positive guard.
{
  const out = pack.run(distFs(GOOD))
  const bad = out.rows.filter((r) => r.verdict === 'EXPLOITED')
  assert(bad.length === 0, `good bake: zero EXPLOITED (got ${JSON.stringify(bad)})`)
  const ids = new Set(out.rows.map((r) => r.id))
  for (const id of [
    'prestruct/ssr-marker-missing', 'prestruct/deploy-id-drift',
    'prestruct/canonical-ogurl-drift', 'prestruct/placeholder-leaked',
  ]) assert(ids.has(id), `good bake: check ${id} produced a row`)
  const ssr = out.rows.find((r) => r.id === 'prestruct/ssr-marker-missing')
  assert(ssr?.verdict === 'PASSED' && /shell page\(s\) correctly exempt/.test(ssr.detail), `good bake: the 404 shell page must be exempt from the SSR check (got ${JSON.stringify(ssr)})`)
  // The deploy-id check must ALSO exempt the shell page: the good bake's
  // 404 carries no deploy-id on purpose, and the tree is still one build
  // across its mounted pages. This is the item-2 false-positive guard.
  const dep = out.rows.find((r) => r.id === 'prestruct/deploy-id-drift')
  assert(dep?.verdict === 'PASSED' && /3 mounted page\(s\)/.test(dep.detail), `good bake: a shell page with no deploy-id must not fail the one-build check (got ${JSON.stringify(dep)})`)
}

// 3. each bad bake must hit EXACTLY its expected id (no missing, no bleed).
const cases = [
  ['bad-ssr-marker', 'prestruct/ssr-marker-missing', 'a mounted page without the SSR attribute -> refused'],
  ['bad-deploy-id-split', 'prestruct/deploy-id-drift', 'two deploy-ids in one tree -> a partial bake refused'],
  ['bad-deploy-id-unstamped', 'prestruct/deploy-id-drift', 'a page missing the build stamp -> refused'],
  ['bad-canonical-ogurl', 'prestruct/canonical-ogurl-drift', 'og:url disagrees with rel=canonical -> refused'],
  ['bad-placeholder', 'prestruct/placeholder-leaked', 'a shell placeholder title survived the inject pass -> refused'],
  ['bad-placeholder-host', 'prestruct/placeholder-leaked', 'a shell placeholder canonical host survived the inject pass -> refused'],
]
for (const [name, id, label] of cases) {
  const out = pack.run(distFs(path.join(SHAPES, name)))
  assert(out.rows.length > 0, `${name}: the harness must produce rows`)
  const hit = out.rows.find((r) => r.id === id && r.verdict === 'EXPLOITED')
  assert(hit, `${name}: ${label} (got ${JSON.stringify(out.rows.map((r) => `${r.id}=${r.verdict}`))})`)
  const others = out.rows.filter((r) => r.verdict === 'EXPLOITED' && r.id !== id)
  assert(others.length === 0, `${name}: no cross-check bleed (got ${JSON.stringify(others)})`)
}

// 4. the no-deploy-id tree dockets BOUNDED, never a fail or a fake pass.
{
  const out = pack.run(distFs(path.join(SHAPES, 'bounded-no-deploy-id')))
  const row = out.rows.find((r) => r.id === 'prestruct/deploy-id-drift')
  assert(row?.verdict === 'BOUNDED', `no deploy-id: docketed BOUNDED, not failed (got ${JSON.stringify(row)})`)
  assert(out.ok === true, 'no deploy-id: an unverifiable claim is not a failure')
}

fs.rmSync(BASE, { recursive: true, force: true })
if (fails.length) {
  console.error(`prestruct-shapes self-test FAIL:\n  ${fails.join('\n  ')}`)
  process.exit(1)
}
console.log(`prestruct-shapes self-test: docket levels + good bake 4/4 + shell-exempt guard + ${cases.length}/${cases.length} bad bakes exact - PASS`)
process.exit(0)
