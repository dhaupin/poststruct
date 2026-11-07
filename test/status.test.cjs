'use strict'

// The family status dialect test (docs/status.md): the emitter's behavior is
// pinned with temp-dir fixtures, and the real tree's emitted counts are
// re-derived against the live committed ledgers so the dialect itself sits
// under CI the same way every other count in this repo does. Behavior-only,
// temp dirs, no network - the same law every test here runs.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { build, write } = require('../web/scripts/build-status.mjs')

function fixtureRepo({ packRows, batteryFail, manifestPacks }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'poststruct-status-'))
  fs.mkdirSync(path.join(root, 'labs'), { recursive: true })
  for (const p of manifestPacks) {
    fs.mkdirSync(path.join(root, 'packs', 'public', p.dir), { recursive: true })
  }
  fs.writeFileSync(
    path.join(root, 'packs', 'eye-ledger.json'),
    JSON.stringify({ schemaVersion: 1, rows: packRows })
  )
  fs.writeFileSync(
    path.join(root, 'labs', 'battery.json'),
    JSON.stringify({ schemaVersion: 1, leg: 'battery', fail: batteryFail, warn: [] })
  )
  for (const p of manifestPacks) {
    fs.writeFileSync(
      path.join(root, 'packs', 'public', p.dir, 'pack.json'),
      JSON.stringify(p.manifest)
    )
    // The emitter loads a pack's entry to tell its profile (campaign vs check),
    // so a fixture pack needs a real, importable entry file. `p.entry` overrides
    // the default; a check-profile fixture supplies `{ checks: [...] }`.
    const entryName = p.manifest.entry || 'index.js'
    const body = p.entryBody !== undefined
      ? p.entryBody
      : `export default { name: ${JSON.stringify(p.manifest.name)} }`
    fs.writeFileSync(path.join(root, 'packs', 'public', p.dir, entryName), body)
  }
  return root
}

const PASS_ROW = { pack: 'eye-x', id: 'case-a', verdict: 'PASSED' }

test('status: the dialect fields and leg rows derive from the committed ledgers', async () => {
  const root = fixtureRepo({
    packRows: [PASS_ROW, { pack: 'eye-x', id: 'case-b', verdict: 'BOUNDED' }],
    batteryFail: ['head/description-missing', 'links/broken-internal'],
    manifestPacks: [
      { dir: 'eye-x', manifest: { name: 'eye-x', schemaVersion: 1, version: '1.0.0', description: 'd', entry: 'index.js' } },
    ],
  })
  const s = await build(root)
  assert.equal(s.schema, 1)
  assert.equal(s.contract, 'family-status@1')
  assert.equal(s.repo, 'dhaupin/poststruct')
  assert.equal(s.site, 'https://poststruct.creadev.org/status')
  assert.equal(s.docs, 'https://docs.creadev.org/poststruct/status')
  const packsLeg = s.legs.find((l) => l.leg === 'packs')
  const batteryLeg = s.legs.find((l) => l.leg === 'battery')
  assert.deepEqual(packsLeg, { leg: 'packs', verdict: 'PASS', cases: 2, counts: { PASSED: 1, BOUNDED: 1 }, ledger: 'packs/eye-ledger.json' })
  assert.deepEqual(batteryLeg, { leg: 'battery', verdict: 'PASS', cases: 2, counts: { REFUSED: 2 }, ledger: 'labs/battery.json' })
  assert.deepEqual(s.packs, [{ name: 'eye-x', spec: 'packstruct@1', profile: 'campaign', manifest: 'packs/public/eye-x/pack.json', cases: 2 }])
})

test('status: any case verdict outside the pass set degrades the leg to RED (never a fake PASS)', async () => {
  const root = fixtureRepo({
    packRows: [PASS_ROW, { pack: 'eye-x', id: 'case-b', verdict: 'EXPLOITED' }],
    batteryFail: ['head/description-missing'],
    manifestPacks: [
      { dir: 'eye-x', manifest: { name: 'eye-x', schemaVersion: 1, version: '1.0.0', description: 'd', entry: 'index.js' } },
    ],
  })
  assert.equal((await build(root)).legs.find((l) => l.leg === 'packs').verdict, 'RED')
  // An unknown verdict is the same refusal - the dialect degrades, not guesses
  const root2 = fixtureRepo({
    packRows: [{ pack: 'eye-x', id: 'case-a', verdict: 'MEANWHILE' }],
    batteryFail: ['head/description-missing'],
    manifestPacks: [
      { dir: 'eye-x', manifest: { name: 'eye-x', schemaVersion: 1, version: '1.0.0', description: 'd', entry: 'index.js' } },
    ],
  })
  assert.equal((await build(root2)).legs.find((l) => l.leg === 'packs').verdict, 'RED')
})

test('status: the emitter refuses the intersection cases loudly (manifest without rows, rows without manifest)', async () => {
  await assert.rejects(
    () => build(fixtureRepo({
      packRows: [PASS_ROW],
      batteryFail: ['x'],
      manifestPacks: [
        { dir: 'eye-x', manifest: { name: 'eye-x', schemaVersion: 1, version: '1.0.0', description: 'd', entry: 'index.js' } },
        { dir: 'eye-y', manifest: { name: 'eye-y', schemaVersion: 1, version: '1.0.0', description: 'd', entry: 'index.js' } },
      ],
    })),
    /eye-y.*zero ledger rows/
  )
  await assert.rejects(
    () => build(fixtureRepo({
      // eye-x consumes its row and gets deleted from the pack map, so the
      // remaining eye-ghost row is the case this assertion exists for.
      packRows: [PASS_ROW, { pack: 'eye-ghost', id: 'x', verdict: 'PASSED' }],
      batteryFail: ['x'],
      manifestPacks: [
        { dir: 'eye-x', manifest: { name: 'eye-x', schemaVersion: 1, version: '1.0.0', description: 'd', entry: 'index.js' } },
      ],
    })),
    /unknown packs.*eye-ghost/
  )
})

test('status: a check-profile pack is counted by its declared checks, not refused for zero rows', async () => {
  // A check-profile pack (`{ checks: [...] }`) runs in the AUDIT lane, never the
  // campaign, so it carries zero ledger rows by design. The emitter must accept
  // it and count its checks, while still refusing a CAMPAIGN pack that has no
  // rows (the gap above).
  const root = fixtureRepo({
    packRows: [PASS_ROW],
    batteryFail: ['x'],
    manifestPacks: [
      { dir: 'eye-x', manifest: { name: 'eye-x', schemaVersion: 1, version: '1.0.0', description: 'd', entry: 'index.js' } },
      {
        dir: 'voice-x',
        manifest: { name: 'voice-x', schemaVersion: 1, version: '1.0.0', description: 'd', entry: 'index.mjs' },
        entryBody: "export default { slug: 'voice', checks: [{ id: 'a' }, { id: 'b' }] }",
      },
    ],
  })
  const s = await build(root)
  const voice = s.packs.find((p) => p.name === 'voice-x')
  assert.equal(voice.profile, 'check')
  assert.equal(voice.cases, 2)
  assert.equal(s.packs.find((p) => p.name === 'eye-x').profile, 'campaign')
})

test('status: the emitter refuses an absent or empty battery contract (never a zero-case pass)', async () => {
  await assert.rejects(
    () => build(fixtureRepo({
      packRows: [PASS_ROW],
      batteryFail: [],
      manifestPacks: [
        { dir: 'eye-x', manifest: { name: 'eye-x', schemaVersion: 1, version: '1.0.0', description: 'd', entry: 'index.js' } },
      ],
    })),
    /empty refusal contract/
  )
})

test('status: write() lands a parseable file at the requested path and returns receipts', async () => {
  const root = fixtureRepo({
    packRows: [PASS_ROW],
    batteryFail: ['x'],
    manifestPacks: [
      { dir: 'eye-x', manifest: { name: 'eye-x', schemaVersion: 1, version: '1.0.0', description: 'd', entry: 'index.js' } },
    ],
  })
  const outPath = path.join(root, 'out', 'status.json')
  const { status, outPath: written } = await write(root, outPath)
  assert.equal(written, outPath)
  const parsed = JSON.parse(fs.readFileSync(outPath, 'utf8'))
  assert.deepEqual(parsed, status)
})

test('status: the real tree serves counts that agree with the live committed ledgers', async () => {
  const s = await build()
  const packRows = require('../packs/eye-ledger.json').rows.length
  const battery = JSON.parse(fs.readFileSync(path.join('labs', 'battery.json'), 'utf8'))
  const packsLeg = s.legs.find((l) => l.leg === 'packs')
  const batteryLeg = s.legs.find((l) => l.leg === 'battery')
  assert.equal(packsLeg.cases, packRows)
  assert.equal(batteryLeg.cases, battery.fail.length)
  // Campaign packs sum to the ledger rows; check-profile packs add their own
  // declared check count with no ledger rows (they run in the audit lane).
  const campaign = s.packs.filter((p) => p.profile === 'campaign').reduce((n, p) => n + p.cases, 0)
  assert.equal(campaign, packRows)
  // The asOf receipt names the real HEAD the generator saw (or worktree
  // only when git is truly absent - never something invented).
  if (s.asOf !== 'worktree') {
    const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim()
    assert.equal(s.asOf, head)
  }
})

test('status: every island member origin is allowed by the served CSP connect-src', () => {
  // The reader half of the contract fails silently in the browser if the
  // family origins are missing from connect-src: fetch() is refused before
  // any CORS runs, so a sibling renders as "Failed to fetch" instead of the
  // honest per-row absence. Pin the island's member list to the shipped
  // headers so the two cannot drift (the class crashtest hit in 977507e).
  const island = fs.readFileSync('web/src/components/FamilyStatusIsland.jsx', 'utf8')
  const origins = [...island.matchAll(/origin:\s*'([^']+)'/g)].map((m) => m[1])
  assert.ok(origins.length > 0, 'island declares at least one member origin')
  const headers = fs.readFileSync('web/public/_headers', 'utf8')
  const csp = headers.match(/Content-Security-Policy:([^\n]*)/)[1]
  const connectSrc = csp.match(/connect-src([^;]*)/)[1]
  for (const origin of origins) {
    assert.ok(connectSrc.includes(origin), `connect-src must allow island member ${origin}`)
  }
  // The served file carries its own ACAO block, or the cross-origin read
  // is refused regardless of CSP.
  assert.match(headers, /\/status\.json\n\s+Access-Control-Allow-Origin: \*/)
})

test('status: the served docs URL matches the docs page permalink', () => {
  // The emitted `docs` URL is a cross-artifact claim: it points at the docs
  // page, which ships under a permalink declared in its own frontmatter. If
  // the two disagree the served dialect advertises a 404 - the exact
  // dangling-URL class freestruct#45 fixed (a canonical/image that did not
  // resolve). Re-derive the URL from the permalink rather than trusting the
  // emitter's hand-typed string, so the two cannot drift.
  const front = fs.readFileSync('docs/status.md', 'utf8')
  const permalink = front.match(/^permalink:\s*(\S+)\s*$/m)[1]
  const base = 'https://docs.creadev.org/poststruct'
  const expected = permalink === '/' ? `${base}/` : `${base}${permalink}`
  const source = fs.readFileSync('web/scripts/build-status.mjs', 'utf8')
  const docs = source.match(/^const DOCS = '([^']+)'/m)[1]
  assert.equal(docs, expected, 'emitter docs URL must match the docs page permalink')
  // The docs page permalink is extensionless (no trailing slash), the form
  // the docs sitemap advertises; a trailing slash 404s on this host.
  assert.doesNotMatch(docs, /\/$/, 'docs URL must not carry a trailing slash')
})
