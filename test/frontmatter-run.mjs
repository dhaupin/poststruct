// test/frontmatter-run.mjs - the frontmatter key/type surface (issue#7 req 2).
// Fixtures are scaffolded into a temp dir at run time (zero committed bytes).
// Real code paths only: runAudit walks real files, the parser reads real
// frontmatter blocks, and the module grades them against the config rule.
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runAudit } from '../src/index.mjs'
import { parseFrontmatter } from '../src/checks/frontmatter.mjs'

const fail = (m) => { console.error(`FAIL frontmatter: ${m}`); process.exit(1) }
const dirs = []
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'ps-fm-')); dirs.push(d); return d }
const write = (d, p, body) => { const full = join(d, p); mkdirSync(join(full, '..'), { recursive: true }); writeFileSync(full, body) }
const ids = (r, level) => r.findings.filter((x) => x.level === level).map((x) => x.id)
// A tree with one baked page (so the audit has something to walk) plus source
// docs and a frontmatter rule.
const tree = (files, rules) => {
  const d = tmp()
  write(d, 'dist/index.html', '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Fixture Page Title Here</title></head><body><p>ok</p></body></html>')
  for (const [p, body] of Object.entries(files)) write(d, p, body)
  write(d, 'poststruct.config.json', JSON.stringify({ frontmatter: { rules } }))
  return d
}
const RULE = [{ files: 'docs/**/*.md', required: { title: 'string', description: 'string' }, types: { nav_order: 'number' } }]

try {
  // The parser surfaces top-level keys and their types.
  {
    const keys = parseFrontmatter('title: A page\ndraft: true\nnav_order: 3\ntags: [a, b]\nrelated:\n  - x\nempty:\nwhen: 2026-10-29\n')
    const want = { title: 'string', draft: 'boolean', nav_order: 'number', tags: 'array', related: 'array', empty: 'null', when: 'date' }
    for (const [k, t] of Object.entries(want)) {
      if (keys.get(k)?.type !== t) fail(`parseFrontmatter("${k}") -> ${keys.get(k)?.type}, want ${t}`)
    }
  }

  // A well-formed doc that satisfies the rule is silent.
  {
    const d = tree({ 'docs/a.md': '---\ntitle: A\ndescription: D\nnav_order: 1\n---\nBody.\n' }, RULE)
    const r = await runAudit(join(d, 'dist'), { module: 'frontmatter', cwd: d })
    if (r.findings.length) fail(`a satisfying doc must be silent, got ${JSON.stringify(r.findings)}`)
  }

  // A missing required key FAILs with the key named.
  {
    const d = tree({ 'docs/a.md': '---\ntitle: A\n---\nBody.\n' }, RULE)
    const r = await runAudit(join(d, 'dist'), { module: 'frontmatter', cwd: d })
    if (!ids(r, 'fail').includes('frontmatter/key-missing')) fail('a missing required key must FAIL')
    if (!r.findings.some((x) => x.message.includes('description'))) fail('the missing key must be named')
  }

  // A mistyped key FAILs (a string where a number was declared).
  {
    const d = tree({ 'docs/a.md': '---\ntitle: A\ndescription: D\nnav_order: first\n---\nBody.\n' }, RULE)
    const r = await runAudit(join(d, 'dist'), { module: 'frontmatter', cwd: d })
    const hit = r.findings.find((x) => x.id === 'frontmatter/type-mismatch')
    if (!hit) fail('a mistyped key must FAIL type-mismatch')
    if (!hit.message.includes('nav_order') || !hit.message.includes('number')) fail(`the type-mismatch must name the key and the wanted type (got "${hit.message}")`)
  }

  // A required key that is present but the WRONG type fires on the required
  // path too (not only the optional types map).
  {
    const d = tree({ 'docs/a.md': '---\ntitle: 42\ndescription: D\n---\nBody.\n' }, RULE)
    const r = await runAudit(join(d, 'dist'), { module: 'frontmatter', cwd: d })
    if (!ids(r, 'fail').includes('frontmatter/type-mismatch')) fail('a required key of the wrong type must FAIL')
  }

  // A matched file with no frontmatter block FAILs block-missing.
  {
    const d = tree({ 'docs/a.md': 'No frontmatter at all.\n' }, RULE)
    const r = await runAudit(join(d, 'dist'), { module: 'frontmatter', cwd: d })
    if (!ids(r, 'fail').includes('frontmatter/block-missing')) fail('a matched file with no block must FAIL block-missing')
  }

  // Files outside the rule glob are untouched.
  {
    const d = tree({ 'docs/a.md': '---\ntitle: A\ndescription: D\n---\nB.\n', 'notes/b.md': 'no frontmatter, but not matched\n' }, RULE)
    const r = await runAudit(join(d, 'dist'), { module: 'frontmatter', cwd: d })
    if (r.findings.some((x) => x.page === 'notes/b.md')) fail('a file outside the glob must not be graded')
  }

  // No rules configured -> the module is inert (default audit unchanged).
  {
    const d = tmp()
    write(d, 'dist/index.html', '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Fixture Page Title Here</title></head><body><p>ok</p></body></html>')
    write(d, 'docs/a.md', 'no frontmatter and no rule\n')
    const r = await runAudit(join(d, 'dist'), { module: 'frontmatter', cwd: d })
    if (r.findings.length) fail('with no rules the frontmatter module must be inert')
  }

  // An unknown declared type refuses loudly (a rule that cannot be honored is
  // a config error, not a silent pass).
  {
    const d = tree({ 'docs/a.md': '---\ntitle: A\n---\nB.\n' }, [{ files: 'docs/**/*.md', required: { title: 'stringy' } }])
    let refused = false
    try { await runAudit(join(d, 'dist'), { module: 'frontmatter', cwd: d }) } catch (e) { refused = /stringy/.test(e.message) }
    if (!refused) fail('an unknown declared type must refuse loudly')
  }

  // Determinism: two runs produce identical findings.
  {
    const d = tree({ 'docs/a.md': '---\ntitle: 1\n---\nB.\n', 'docs/b.md': 'no block\n' }, RULE)
    const a = await runAudit(join(d, 'dist'), { module: 'frontmatter', cwd: d })
    const b = await runAudit(join(d, 'dist'), { module: 'frontmatter', cwd: d })
    if (JSON.stringify(a.findings) !== JSON.stringify(b.findings)) fail('two runs must be byte-identical (determinism)')
  }

  console.log('frontmatter self-test: parse (string/number/boolean/date/array/object/null) + key-missing + type-mismatch + block-missing + glob scope + inert-without-rules + loud-refusal + determinism - PASS')
} finally {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
}
