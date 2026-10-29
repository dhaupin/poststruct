// test/i18n-a11y-run.mjs - the M2 core modules get focused, real-tree tests.
// Every fixture is written to a temp dir at run time (zero committed bytes,
// the shapes-pack convention), so each check's fire and pass directions are
// pinned exactly. Real code paths only: runAudit walks actual files.
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runAudit } from '../src/index.mjs'

const fail = (m) => { console.error(`FAIL i18n/a11y: ${m}`); process.exit(1) }
const dirs = []
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'ps-m2-')); dirs.push(d); return d }
// Write a tree: { 'index.html': '<html>...' } (paths may include subdirs).
const tree = (files) => {
  const d = tmp()
  for (const [p, body] of Object.entries(files)) {
    const full = join(d, p)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, body)
  }
  return d
}
// Minimal head that clears the head module, so a fixture fails ONLY on the
// module under test and there is no cross-module bleed.
const HEAD = (extra = '') => `<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Fixture Page Title Here</title>
<meta name="description" content="A fixture description that sits inside the seventy to one hundred and sixty five character band so it does not warn.">
<link rel="canonical" href="https://example.com/">${extra}`
const PAGE = (lang, headExtra, body) => `<!DOCTYPE html><html${lang}><head>${HEAD(headExtra)}</head><body><a href="#main">Skip</a><main id="main">${body}</main></body></html>`
const ids = (r, level) => r.findings.filter((x) => x.level === level).map((x) => x.id)

try {
  // ---- i18n ----
  // Clean: a page with a lang and no i18n graph is silent.
  {
    const r = await runAudit(tree({ 'index.html': PAGE(' lang="en"', '', '<h1>Hi</h1>') }), { module: 'i18n' })
    if (ids(r, 'fail').length || ids(r, 'warn').length) fail(`clean i18n page must be silent, got ${JSON.stringify(r.findings)}`)
  }
  // lang-missing on a page with no lang attribute.
  {
    const r = await runAudit(tree({ 'index.html': PAGE('', '', '<h1>Hi</h1>') }), { module: 'i18n' })
    if (!ids(r, 'fail').includes('i18n/lang-missing')) fail('a page with no <html lang> must FAIL lang-missing')
  }
  // lang-conflict: primary subtag differs (en vs fr) fires; region differs (en vs en-GB) does not.
  {
    const conflict = await runAudit(tree({ 'index.html': PAGE(' lang="en"', '<meta http-equiv="content-language" content="fr">', '<h1>x</h1>') }), { module: 'i18n' })
    if (!ids(conflict, 'fail').includes('i18n/lang-conflict')) fail('en vs fr must FAIL lang-conflict')
    const region = await runAudit(tree({ 'index.html': PAGE(' lang="en"', '<meta http-equiv="content-language" content="en-GB">', '<h1>x</h1>') }), { module: 'i18n' })
    if (ids(region, 'fail').includes('i18n/lang-conflict')) fail('en vs en-GB must NOT be a conflict')
    const og = await runAudit(tree({ 'index.html': PAGE(' lang="en"', '<meta property="og:locale" content="de_DE">', '<h1>x</h1>') }), { module: 'i18n' })
    if (!ids(og, 'fail').includes('i18n/lang-conflict')) fail('en vs og:locale de_DE must FAIL lang-conflict')
  }
  // hreflang-orphan: a same-origin target that was not built.
  {
    const r = await runAudit(tree({ 'index.html': PAGE(' lang="en"', '<link rel="alternate" hreflang="de" href="/de/">', '<h1>x</h1>') }), { module: 'i18n' })
    if (!ids(r, 'fail').includes('i18n/hreflang-orphan')) fail('a hreflang to an unbuilt page must FAIL orphan')
  }
  // hreflang that resolves does not fire; cross-origin is out of scope.
  {
    const files = {
      'index.html': PAGE(' lang="en"', '<link rel="alternate" hreflang="de" href="/de/">', '<h1>x</h1>'),
      'de/index.html': PAGE(' lang="de"', '<link rel="alternate" hreflang="en" href="/">', '<h1>x</h1>'),
    }
    const r = await runAudit(tree(files), { module: 'i18n' })
    if (ids(r, 'fail').includes('i18n/hreflang-orphan')) fail('a resolving hreflang must not FAIL orphan')
    if (ids(r, 'warn').includes('i18n/hreflang-no-return')) fail('a reciprocal pair must not warn no-return')
    const cross = await runAudit(tree({ 'index.html': PAGE(' lang="en"', '<link rel="alternate" hreflang="de" href="https://other.example.com/de/">', '<h1>x</h1>') }), { module: 'i18n' })
    if (cross.findings.some((x) => x.id.startsWith('i18n/hreflang'))) fail('a cross-origin hreflang must be out of scope')
  }
  // hreflang-no-return: A -> B, B declares alternates but does not name A back.
  {
    const files = {
      'index.html': PAGE(' lang="en"', '<link rel="alternate" hreflang="de" href="/de/">', '<h1>x</h1>'),
      'de/index.html': PAGE(' lang="de"', '<link rel="alternate" hreflang="fr" href="/fr/">', '<h1>x</h1>'),
      'fr/index.html': PAGE(' lang="fr"', '', '<h1>x</h1>'),
    }
    const r = await runAudit(tree(files), { module: 'i18n' })
    if (!ids(r, 'warn').includes('i18n/hreflang-no-return')) fail('a one-way pair inside the i18n graph must WARN no-return')
  }

  // ---- a11y-lite ----
  // img-alt-missing: no alt, and whitespace-only alt, both fire; alt="" is respected.
  {
    const noAlt = await runAudit(tree({ 'index.html': PAGE(' lang="en"', '', '<img src="/a.png">') }), { module: 'a11y' })
    if (!ids(noAlt, 'fail').includes('a11y/img-alt-missing')) fail('an img with no alt must FAIL')
    const blank = await runAudit(tree({ 'index.html': PAGE(' lang="en"', '', '<img src="/a.png" alt=" ">') }), { module: 'a11y' })
    if (!ids(blank, 'fail').includes('a11y/img-alt-missing')) fail('a whitespace-only alt must FAIL')
    const deco = await runAudit(tree({ 'index.html': PAGE(' lang="en"', '', '<img src="/a.png" alt="">') }), { module: 'a11y' })
    if (ids(deco, 'fail').includes('a11y/img-alt-missing')) fail('alt="" must be respected as decorative')
    const role = await runAudit(tree({ 'index.html': PAGE(' lang="en"', '', '<img src="/a.png" role="presentation">') }), { module: 'a11y' })
    if (ids(role, 'fail').includes('a11y/img-alt-missing')) fail('role="presentation" must be respected')
  }
  // form-label-missing: bare input fires; each labelling form clears it.
  {
    const bare = await runAudit(tree({ 'index.html': PAGE(' lang="en"', '', '<input type="text" name="q">') }), { module: 'a11y' })
    if (!ids(bare, 'fail').includes('a11y/form-label-missing')) fail('a bare text input must FAIL')
    const forLabel = await runAudit(tree({ 'index.html': PAGE(' lang="en"', '', '<label for="q">Q</label><input id="q" type="text">') }), { module: 'a11y' })
    if (ids(forLabel, 'fail').includes('a11y/form-label-missing')) fail('<label for> must clear the finding')
    const wrapped = await runAudit(tree({ 'index.html': PAGE(' lang="en"', '', '<label>Q <input type="text"></label>') }), { module: 'a11y' })
    if (ids(wrapped, 'fail').includes('a11y/form-label-missing')) fail('a wrapping <label> must clear the finding')
    const aria = await runAudit(tree({ 'index.html': PAGE(' lang="en"', '', '<input type="text" aria-label="Search">') }), { module: 'a11y' })
    if (ids(aria, 'fail').includes('a11y/form-label-missing')) fail('aria-label must clear the finding')
    const submit = await runAudit(tree({ 'index.html': PAGE(' lang="en"', '', '<input type="submit" value="Go">') }), { module: 'a11y' })
    if (ids(submit, 'fail').includes('a11y/form-label-missing')) fail('a submit input must be exempt')
  }
  // viewport-missing: the shared HEAD carries one, so strip it to force the finding.
  {
    const noViewport = `<!DOCTYPE html><html lang="en"><head><title>Fixture Page Title Here</title><meta name="description" content="A fixture description that sits inside the seventy to one hundred and sixty five character band so it does not warn."><link rel="canonical" href="https://example.com/"></head><body><a href="#main">Skip</a><main id="main"><h1>x</h1></main></body></html>`
    const r = await runAudit(tree({ 'index.html': noViewport }), { module: 'a11y' })
    if (!ids(r, 'fail').includes('a11y/viewport-missing')) fail('no viewport meta must FAIL')
  }
  // skip-link-absent: a page with no in-page skip link warns.
  {
    const noSkip = `<!DOCTYPE html><html lang="en"><head>${HEAD()}</head><body><main id="main"><h1>x</h1></main></body></html>`
    const r = await runAudit(tree({ 'index.html': noSkip }), { module: 'a11y' })
    if (!ids(r, 'warn').includes('a11y/skip-link-absent')) fail('no skip link must WARN')
    const withSkip = await runAudit(tree({ 'index.html': PAGE(' lang="en"', '', '<h1>x</h1>') }), { module: 'a11y' })
    if (ids(withSkip, 'warn').includes('a11y/skip-link-absent')) fail('a skip link must clear the warn')
  }

  console.log('i18n/a11y self-test: lang + conflict + orphan + no-return + img-alt + form-label + viewport + skip-link - PASS')
} finally {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
}
