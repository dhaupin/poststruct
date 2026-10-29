// test/config-run.mjs - config is a real contract now, so it gets a real test.
// Covers: the three override levels, glob precedence, scope.skip, scope.is404,
// the JSON form, the dir fallback, and the loud refusal on a bad level.
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runAudit } from '../src/index.mjs'
import { levelFor, matchesSkip } from '../src/config.mjs'

const BAD = 'test/fixtures/bad'
const GOOD = 'test/fixtures/good'
const fail = (m) => { console.error(`FAIL config: ${m}`); process.exit(1) }
const dirs = []
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'ps-cfg-')); dirs.push(d); return d }
const cfgIn = (dir, name, body) => writeFileSync(join(dir, name), body)

try {
  // Glob precedence: the longest matching pattern wins, regardless of key order.
  if (levelFor('head/title-length', { 'head/*': 'warn', 'head/title-length': 'fail' }) !== 'fail') fail('specific id must beat a prefix glob')
  if (levelFor('head/title-length', { 'head/title-length': 'fail', 'head/*': 'warn' }) !== 'fail') fail('precedence must not depend on key order')
  if (levelFor('site/sitemap-empty', { 'head/*': 'off' }) !== null) fail('a non-matching glob must not apply')
  if (levelFor('head/x', {}) !== null) fail('no patterns means no override')

  // skip globs: ** spans separators, * does not.
  if (!matchesSkip('about/index.html', ['about/**'])) fail('** must span separators')
  if (matchesSkip('about/x/y.html', ['about/*'])) fail('* must not span separators')
  if (!matchesSkip('a/b/c.html', ['**'])) fail('bare ** must match everything')

  // No config anywhere: behavior is exactly the old default.
  const base = await runAudit(BAD, { cwd: tmp() })
  if (base.config !== null) fail('absent config must report source null')
  const baseFails = base.findings.filter((x) => x.level === 'fail').map((x) => x.id)
  if (!baseFails.includes('head/description-missing')) fail('default run must keep description-missing')

  // 'off' drops, 'warn' demotes a fail, 'fail' promotes a warn.
  const d1 = tmp()
  cfgIn(d1, 'poststruct.config.mjs', `export default { checks: {
    'head/description-missing': 'off',
    'head/canonical-relative': 'warn',
    'head/h1-multiple': 'fail',
  } }\n`)
  const r1 = await runAudit(BAD, { cwd: d1 })
  const ids1 = r1.findings.map((x) => x.id)
  if (ids1.includes('head/description-missing')) fail("'off' must drop the finding")
  if (r1.findings.find((x) => x.id === 'head/canonical-relative')?.level !== 'warn') fail("'warn' must demote a fail")
  if (r1.findings.find((x) => x.id === 'head/h1-multiple')?.level !== 'fail') fail("'fail' must promote a warn")
  if (r1.hasFails !== (r1.counts.fail > 0)) fail('hasFails must follow the post-override counts')
  if (r1.config !== 'poststruct.config.mjs') fail('config source must be reported')

  // JSON form, same semantics.
  const d2 = tmp()
  cfgIn(d2, 'poststruct.config.json', '{"checks":{"head/h1-multiple":"off"}}')
  const r2 = await runAudit(BAD, { cwd: d2 })
  if (r2.findings.some((x) => x.id === 'head/h1-multiple')) fail('JSON config must apply')

  // scope.skip removes pages from the walk.
  const d3 = tmp()
  cfgIn(d3, 'poststruct.config.mjs', `export default { scope: { skip: ['about/**'] } }\n`)
  const r3 = await runAudit(GOOD, { cwd: d3 })
  const r3off = await runAudit(GOOD, { cwd: tmp() })
  if (r3.pagesChecked !== r3off.pagesChecked - 1) fail('scope.skip must drop exactly the matched page')

  // A bad level refuses loudly instead of silently ignoring the config.
  const d4 = tmp()
  cfgIn(d4, 'poststruct.config.json', '{"checks":{"head/h1-multiple":"nope"}}')
  let refused = false
  try { await runAudit(BAD, { cwd: d4 }) } catch (e) { refused = /is 'nope'/.test(e.message) }
  if (!refused) fail('a bad level must refuse with the offending value named')

  // scope.is404 overrides the 404 heuristic.
  const d5 = tmp()
  cfgIn(d5, 'poststruct.config.mjs', `export default { scope: { is404: (p) => p === 'index.html' } }\n`)
  const r5 = await runAudit(BAD, { cwd: d5 })
  if (!r5.findings.some((x) => x.id === 'head/404-noindex-missing' && x.page === 'index.html')) fail('scope.is404 must be honored')

  console.log('config self-test: 3 override levels + glob precedence + skip + is404 + JSON + refusal - PASS')
} finally {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
}
