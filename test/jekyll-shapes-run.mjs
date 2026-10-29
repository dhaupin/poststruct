#!/usr/bin/env node
// test/jekyll-shapes-run.mjs - the jekyll-shapes negative test is permanent:
// the good bake must be clean (zero EXPLOITED) and each bad bake must
// produce EXACTLY the expected EXPLOITED check id. If a refactor deletes a
// check, this fails. Fixtures are SCAFFOLDED, not committed: the battery
// builds a good bake in a temp dir and derives each bad fixture from it with
// one honest mutation.
//
// The shape mirrors real Jekyll 4.4.1 + jekyll-seo-tag 2.9.1 output (learned
// by baking a site): the seo-tag marker comment, a per-post description that
// is NOT the body, a single copy of each head tag, and no hreflang.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import pack from '../packs/public/jekyll-shapes/index.mjs'

const BASE = fs.mkdtempSync(path.join(os.tmpdir(), 'jekyll-shapes-'))
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

function page({ title, description, body, canonical, hreflang = '', seoTags = true }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  ${seoTags ? `<!-- Begin Jekyll SEO tag v2.9.1 -->
<title>${title} | Acme Docs</title>
<meta name="generator" content="Jekyll v4.4.1" />
<meta property="og:title" content="${title}" />
<meta name="description" content="${description}" />
<meta name="twitter:description" property="og:description" content="${description}" />
<link rel="canonical" href="${canonical}" />
<meta property="og:url" content="${canonical}" />
<meta name="twitter:card" content="summary" />
${hreflang}<!-- End Jekyll SEO tag -->` : `<meta name="description" content="${description}" />`}
</head>
<body><main><p>${body}</p></main></body>
</html>
`
}

const GOOD_DESC = 'A hand-written description that stays out of the body prose entirely.'
const GOOD_BODY = 'The visible body paragraph, which is deliberately different from the meta description.'

function scaffoldGoodBake(root) {
  fs.mkdirSync(path.join(root, 'about'), { recursive: true })
  fs.mkdirSync(path.join(root, '2026/01/15/first-post'), { recursive: true })
  fs.writeFileSync(path.join(root, 'index.html'), page({
    title: 'Home', description: 'Acme documentation site', body: GOOD_BODY,
    canonical: 'https://acme.example.com/',
  }))
  fs.writeFileSync(path.join(root, 'about/index.html'), page({
    title: 'About Us', description: GOOD_DESC, body: GOOD_BODY,
    canonical: 'https://acme.example.com/about/',
  }))
  fs.writeFileSync(path.join(root, '2026/01/15/first-post/index.html'), page({
    title: 'First Post', description: GOOD_DESC, body: GOOD_BODY,
    canonical: 'https://acme.example.com/2026/01/15/first-post/',
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

const LEAK_BODY = 'The raw excerpt paragraph that would otherwise leak into the meta tag, written long enough to clear the minimum-leak guard used by the check.'

const bads = [
  derive('bad-excerpt-leak', (d) => {
    const p = path.join(d, '2026/01/15/first-post/index.html')
    let s = fs.readFileSync(p, 'utf8')
    s = s.replace(`<p>${GOOD_BODY}</p>`, `<p>${LEAK_BODY}</p>`)
    s = s.replace(`content="${GOOD_DESC}"`, `content="${LEAK_BODY}"`)
    fs.writeFileSync(p, s)
  }),
  derive('bad-excerpt-truncated', (d) => {
    const p = path.join(d, '2026/01/15/first-post/index.html')
    let s = fs.readFileSync(p, 'utf8')
    const long = LEAK_BODY + ' And then even more prose follows here to push past the truncation point.'
    s = s.replace(`<p>${GOOD_BODY}</p>`, `<p>${long}</p>`)
    s = s.replace(`content="${GOOD_DESC}"`, `content="${LEAK_BODY.slice(0, 60)}…"`)
    fs.writeFileSync(p, s)
  }),
  derive('bad-double-description', (d) => {
    const p = path.join(d, 'index.html')
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('<body>', '<meta name="description" content="a second one" />\n<body>'))
  }),
  derive('bad-double-canonical', (d) => {
    const p = path.join(d, 'about/index.html')
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('</head>', '<link rel="canonical" href="https://acme.example.com/about/" />\n</head>'))
  }),
  derive('bad-hreflang-orphan', (d) => {
    const p = path.join(d, 'about/index.html')
    const link = '<link rel="alternate" hreflang="fr" href="https://acme.example.com/fr/about/" />\n'
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('<!-- End Jekyll SEO tag -->', link + '<!-- End Jekyll SEO tag -->'))
  }),
]

const fails = []
const assert = (cond, label) => { if (!cond) fails.push(label) }

// 1. run-level contracts.
{
  const outNull = pack.run({ jekyllTree: { root: null } })
  assert(outNull.ok === true, 'null tree: BOUNDED docket stays ok')
  assert(outNull.rows.length === 1 && outNull.rows[0].id === 'jekyll/baked-site-absent' && outNull.rows[0].verdict === 'BOUNDED', 'null tree: exactly one baked-site-absent BOUNDED row')
  const empty = path.join(SHAPES, 'empty')
  fs.mkdirSync(empty, { recursive: true })
  const outEmpty = pack.run({ jekyllTree: treeFs(empty) })
  assert(outEmpty.ok === true && outEmpty.rows[0]?.verdict === 'BOUNDED', 'empty tree: docketed, not faked')
  let refused = false
  try { pack.run({}) } catch (err) {
    refused = err instanceof TypeError && /missing/.test(err.message)
  }
  assert(refused, 'un-armed context: run refuses loudly (TypeError, module contract)')
}

// 2. a page with no seo-tag marker dockets the excerpt check BOUNDED, never a
//    pass or a fail - the fallback is a seo-tag behavior and cannot be judged
//    without it.
{
  const dir = path.join(SHAPES, 'no-seo-tag')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'index.html'), page({
    title: 'Plain', description: GOOD_DESC, body: GOOD_BODY,
    canonical: 'https://acme.example.com/', seoTags: false,
  }))
  const out = pack.run({ jekyllTree: treeFs(dir) })
  const row = out.rows.find((r) => r.id === 'jekyll/excerpt-as-description')
  assert(row && row.verdict === 'BOUNDED' && row.bound === 'seo-tag-absent', `no seo-tag: excerpt check dockets BOUNDED (got ${JSON.stringify(row)})`)
  assert(out.ok === true, 'no seo-tag: no EXPLOITED')
}

// 3. the good bake is clean across all three checks.
{
  const out = pack.run({ jekyllTree: treeFs(GOOD) })
  const bad = out.rows.filter((r) => r.verdict === 'EXPLOITED')
  assert(bad.length === 0, `good bake: zero EXPLOITED (got ${JSON.stringify(bad)})`)
  const ids = new Set(out.rows.map((r) => r.id))
  for (const id of ['jekyll/excerpt-as-description', 'jekyll/meta-double-shipped', 'jekyll/hreflang-orphan']) {
    assert(ids.has(id), `good bake: check ${id} produced a row`)
  }
  const hreflang = out.rows.find((r) => r.id === 'jekyll/hreflang-orphan')
  assert(hreflang.verdict === 'BOUNDED', 'good bake: no hreflang -> BOUNDED, not a fake pass')
}

// 4. each bad bake must hit EXACTLY its expected id (no missing, no bleed).
const cases = [
  ['bad-excerpt-leak', 'jekyll/excerpt-as-description', 'a description equal to the body paragraph -> refused'],
  ['bad-excerpt-truncated', 'jekyll/excerpt-as-description', 'a description that is a truncation of the body paragraph -> refused'],
  ['bad-double-description', 'jekyll/meta-double-shipped', 'hand meta + seo tag double-shipping description -> refused'],
  ['bad-double-canonical', 'jekyll/meta-double-shipped', 'hand meta + seo tag double-shipping canonical -> refused'],
  ['bad-hreflang-orphan', 'jekyll/hreflang-orphan', 'an hreflang at an unbuilt same-origin page -> refused'],
]
for (const [name, id, label] of cases) {
  const out = pack.run({ jekyllTree: treeFs(path.join(SHAPES, name)) })
  assert(out.rows.length > 0, `${name}: the harness must produce rows`)
  const hit = out.rows.find((r) => r.id === id && r.verdict === 'EXPLOITED')
  assert(hit, `${name}: ${label} (got ${JSON.stringify(out.rows.map((r) => `${r.id}=${r.verdict}`))})`)
  const others = out.rows.filter((r) => r.verdict === 'EXPLOITED' && r.id !== id)
  assert(others.length === 0, `${name}: no cross-check bleed (got ${JSON.stringify(others)})`)
}

// 5. an external hreflang target is out of scope and must not be judged.
{
  const dir = path.join(SHAPES, 'external-hreflang')
  scaffoldGoodBake(dir)
  const p = path.join(dir, 'about/index.html')
  const link = '<link rel="alternate" hreflang="de" href="https://de.example.org/about/" />\n'
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('<!-- End Jekyll SEO tag -->', link + '<!-- End Jekyll SEO tag -->'))
  const out = pack.run({ jekyllTree: treeFs(dir) })
  const row = out.rows.find((r) => r.id === 'jekyll/hreflang-orphan')
  assert(row.verdict === 'PASSED', `external hreflang: same-origin only, so it passes (got ${JSON.stringify(row)})`)
}

fs.rmSync(BASE, { recursive: true, force: true })
if (fails.length) {
  console.error(`jekyll-shapes self-test FAIL:\n  ${fails.join('\n  ')}`)
  process.exit(1)
}
console.log(`jekyll-shapes self-test: docket levels + good bake 3/3 + ${cases.length}/${cases.length} bad bakes exact + external-hreflang scope - PASS`)
process.exit(0)
