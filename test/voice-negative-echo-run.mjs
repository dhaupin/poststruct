#!/usr/bin/env node
// test/voice-negative-echo-run.mjs - the negative-echo check's permanent
// negative test. Two things must hold forever:
//
//   1. The GOOD copy audits clean (zero findings from this pack).
//   2. The BAD copy produces EXACTLY one finding, id `voice-negative-echo/
//      negative-echo`, and it names the echoed terms.
//
// Fixtures are SCAFFOLDED into a temp dir at run time (zero committed bytes),
// and the check is exercised through the REAL path: runAudit walks real files,
// the config `packs:` arm loads the pack through the shared loader, and the
// check reads prose through the host's own ctx. That is the whole point - the
// pack is inert unless the loader runs it, so a test that called the check
// directly would prove nothing about the seam that was missing.
//
// The class under test is a garden path, not a double negative: a negative-
// polarity question answered by a BARE verdict sentence ("No.") whose next
// sentence restates a term from the question, so the answer reads as taking
// back what it just said. The fixed form joins the verdict to its subject
// ("No, we ..."), which must never fire.
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runAudit } from '../src/index.mjs'

const fail = (m) => { console.error(`FAIL voice-negative-echo: ${m}`); process.exit(1) }
const dirs = []
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'ps-vne-')); dirs.push(d); return d }
const write = (d, p, body) => { const full = join(d, p); mkdirSync(join(full, '..'), { recursive: true }); writeFileSync(full, body) }
// The pack under test, by absolute path: the audit resolves a config `packs:`
// entry against cwd, and the fixture tree is a temp dir, so a relative path
// would point at nothing.
const PACK = join(dirname(fileURLToPath(import.meta.url)), '..', 'packs', 'public', 'voice-negative-echo')

// A baked page that clears every built-in module, so the pack's findings are
// the only ones in the run and there is no cross-module bleed. The body prose
// is the only variable.
const HTML = (prose) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Fixture Page Title Here</title><meta name="description" content="A fixture description that sits inside the seventy to one hundred and sixty five character band so it does not warn."><link rel="canonical" href="https://example.com/"><meta property="og:title" content="Fixture"><meta property="og:description" content="A fixture description that sits inside the band."><meta property="og:image" content="https://example.com/og.png"><meta property="og:url" content="https://example.com/"><meta property="og:type" content="website"><meta property="og:site_name" content="Fixture"><meta property="og:locale" content="en_US"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="Fixture"><meta name="twitter:description" content="A fixture description that sits inside the band."><meta name="twitter:image" content="https://example.com/og.png"><script type="application/ld+json">{"@context":"https://schema.org","@type":"LocalBusiness","name":"Fixture","telephone":"+1-555-0100","address":"1 Main St"}</script></head><body><a href="#main">Skip to content</a><main id="main"><h1>Fixture</h1><p>${prose}</p></main></body></html>`

// One tree: a baked page carrying `prose`, and the config arming the pack.
const treeWithProse = (prose) => {
  const d = tmp()
  write(d, 'dist/index.html', HTML(prose))
  write(d, 'poststruct.config.json', JSON.stringify({ packs: [PACK] }))
  return d
}
const vne = (r) => r.findings.filter((x) => x.id === 'voice-negative-echo/negative-echo')

const OLD = 'Do you only work with businesses in Pennsylvania? No. We are based in NW Pennsylvania and work with clients worldwide.'
const NEW = 'Do you only work with businesses in Pennsylvania? No, we work with clients worldwide. We are based in NW Pennsylvania, so local clients get on-site visits.'

try {
  // The seam itself: an armed pack's check RUNS. Before the check-profile loader
  // existed this pack was inert and this assertion could not pass.
  {
    const d = treeWithProse(OLD)
    const r = await runAudit(join(d, 'dist'), { cwd: d })
    const hits = vne(r)
    if (hits.length !== 1) fail(`the old copy must produce exactly one finding, got ${hits.length}`)
    if (!hits[0].message.includes('pennsylvania')) fail(`the finding must name the echoed term, got: ${hits[0].message}`)
    if (hits[0].page !== 'index.html') fail(`the finding must carry the page, got: ${hits[0].page}`)
    if (hits[0].level !== 'warn') fail(`the check is WARN by default, got ${hits[0].level}`)
    if (typeof hits[0].count !== 'number' || !hits[0].snippet) fail('the finding must carry count + snippet')
  }

  // The FIX is silent. A comma-joined verdict never fires.
  {
    const d = treeWithProse(NEW)
    const r = await runAudit(join(d, 'dist'), { cwd: d })
    if (vne(r).length) fail(`the fixed copy must be silent, got ${JSON.stringify(vne(r))}`)
  }

  // Sibling shapes that must NOT fire: a comma-joined verdict, a non-negative
  // question, and a bare verdict that moves on to NEW terms (no echo).
  {
    const cases = {
      'comma-joined verdict': 'Can you improve a site you did not build? Yes, and it is common work for us. We start with an audit.',
      'non-negative question': 'Do you build websites? Yes. We build websites for small teams.',
      'bare verdict, new terms': 'Do you only serve large companies? No. Most of our clients are small teams.',
      'no bare verdict': 'Do you only serve large companies? We mostly work with small teams and a few larger ones.',
    }
    for (const [label, prose] of Object.entries(cases)) {
      const d = treeWithProse(prose)
      const r = await runAudit(join(d, 'dist'), { cwd: d })
      if (vne(r).length) fail(`${label} must not fire, got ${JSON.stringify(vne(r))}`)
    }
  }

  // The id is namespaced by the pack, and a config level override reaches it.
  {
    const d = treeWithProse(OLD)
    write(d, 'poststruct.config.json', JSON.stringify({ packs: [PACK], checks: { 'voice-negative-echo/negative-echo': 'fail' } }))
    const r = await runAudit(join(d, 'dist'), { cwd: d })
    const hits = vne(r)
    if (hits.length !== 1 || hits[0].level !== 'fail') fail(`a config override must promote the finding to fail, got ${JSON.stringify(hits)}`)
  }

  // The check reads the SOURCE prose view too, when the config names text dirs.
  {
    const d = tmp()
    write(d, 'dist/index.html', HTML('Clean baked prose only here.'))
    write(d, 'src/faqs.md', `## A question\n\n${OLD}\n`)
    write(d, 'poststruct.config.json', JSON.stringify({ packs: [PACK], language: { textDirs: ['src'] } }))
    const r = await runAudit(join(d, 'dist'), { cwd: d })
    const hits = vne(r)
    if (hits.length !== 1) fail(`the source prose view must be graded, got ${hits.length}`)
    if (hits[0].page !== 'src/faqs.md') fail(`the source finding must carry the source path, got ${hits[0].page}`)
  }

  console.log('voice-negative-echo self-test: old copy flags once (namespaced id), fix silent, siblings silent, override + source view honored - PASS')
} finally {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
}
