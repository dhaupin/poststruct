// test/packs-run.mjs - the pack loader (SPEC v1): manifest validation,
// local-path AND npm-source resolution, collision refusal, and the
// never-download law. Fixtures are scaffolded into a temp dir at run time
// (zero committed bytes); the npm source is a scaffolded fake node_modules
// package, so no registry is ever touched.
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isNpmSpec, resolvePackSpec, loadPackDir, collectPacks, validateManifest } from '../src/packs.mjs'

const fail = (m) => { console.error(`FAIL packs: ${m}`); process.exit(1) }
const dirs = []
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'ps-packs-')); dirs.push(d); return d }
const write = (d, p, body) => { const full = join(d, p); mkdirSync(join(full, '..'), { recursive: true }); writeFileSync(full, body) }

const MANIFEST = (name, over = {}) => JSON.stringify({
  schemaVersion: 1, name, description: 'A fixture pack.', version: '0.1.0', entry: 'index.mjs', ...over,
})
const ENTRY = 'export default { checks: [{ id: \'fixture\' }] }\nexport function run() { return { ok: true, rows: [] } }\n'

try {
  // isNpmSpec: bare words and scoped names are npm; paths are paths.
  {
    const cases = [['wp-seo-shapes', true], ['@poststruct/wp-seo-shapes', true], ['./packs/wp', false], ['packs/wp', false], ['../x', false], ['/abs', false]]
    for (const [spec, want] of cases) if (isNpmSpec(spec) !== want) fail(`isNpmSpec(${JSON.stringify(spec)}) should be ${want}`)
  }

  // A local path resolves to an absolute dir; a missing path refuses.
  {
    const d = tmp()
    write(d, 'packs/local-shape/pack.json', MANIFEST('local-shape'))
    write(d, 'packs/local-shape/index.mjs', ENTRY)
    const r = resolvePackSpec('./packs/local-shape', d)
    if (!r.dir.endsWith('packs/local-shape')) fail(`local resolve gave ${r.dir}`)
    let refused = false
    try { resolvePackSpec('./packs/nope', d) } catch (e) { refused = /does not exist/.test(e.message) }
    if (!refused) fail('a missing local path must refuse')
  }

  // An npm source resolves from the nearest node_modules carrying a pack.json.
  {
    const d = tmp()
    write(d, 'node_modules/@poststruct/wp-seo-shapes/pack.json', MANIFEST('wp-seo-shapes'))
    write(d, 'node_modules/@poststruct/wp-seo-shapes/index.mjs', ENTRY)
    const r = resolvePackSpec('@poststruct/wp-seo-shapes', d)
    if (!r.dir.includes('node_modules')) fail(`npm resolve gave ${r.dir}`)
    // A bare (unscoped) name resolves the same way.
    write(d, 'node_modules/astro-shapes/pack.json', MANIFEST('astro-shapes'))
    write(d, 'node_modules/astro-shapes/index.mjs', ENTRY)
    if (!resolvePackSpec('astro-shapes', d).dir.includes('node_modules')) fail('a bare npm name must resolve')
  }

  // An npm source that is NOT installed refuses with the fix named, and
  // touches no network (the message names the install command, not a fetch).
  {
    const d = tmp()
    let msg = ''
    try { resolvePackSpec('@poststruct/ghost-shapes', d) } catch (e) { msg = e.message }
    if (!/not installed/.test(msg) || !/npm i -D @poststruct\/ghost-shapes/.test(msg)) fail(`uninstalled npm pack must refuse with the fix named (got "${msg}")`)
  }

  // loadPackDir unwraps the default export and validates the manifest.
  {
    const d = tmp()
    write(d, 'packs/good-shape/pack.json', MANIFEST('good-shape'))
    write(d, 'packs/good-shape/index.mjs', ENTRY)
    const pack = await loadPackDir(join(d, 'packs/good-shape'), null)
    if (pack.name !== 'good-shape' || !Array.isArray(pack.module.checks)) fail('loadPackDir must unwrap the default export')
  }

  // Every SPEC v1 manifest violation refuses with a nameable, one-line error.
  {
    const bad = [
      ['schema', { schemaVersion: 2 }, /schemaVersion must be 1/],
      ['version', { version: 'nope' }, /semver/],
      ['description', { description: '' }, /description/],
      ['entry', { entry: '../escape.mjs' }, /entry/],
    ]
    for (const [label, over, re] of bad) {
      let msg = ''
      try { validateManifest({ schemaVersion: 1, name: 'x-shape', description: 'd', version: '0.1.0', entry: 'index.mjs', ...over }, 'x-shape', null) } catch (e) { msg = e.message }
      if (!re.test(msg)) fail(`manifest ${label} violation must refuse (got "${msg}")`)
    }
    // name/dir mismatch and non-kebab names refuse.
    let m1 = ''
    try { validateManifest({ schemaVersion: 1, name: 'other', description: 'd', version: '0.1.0', entry: 'index.mjs' }, 'x-shape', null) } catch (e) { m1 = e.message }
    if (!/does not match the directory/.test(m1)) fail('name/dir mismatch must refuse')
    let m2 = ''
    try { validateManifest({ schemaVersion: 1, name: 'Bad Name', description: 'd', version: '0.1.0', entry: 'index.mjs' }, 'Bad Name', null) } catch (e) { m2 = e.message }
    if (!/kebab-case/.test(m2)) fail('a non-kebab name must refuse')
  }

  // A missing entry file refuses (the crashtest#16 class).
  {
    const d = tmp()
    write(d, 'packs/no-entry/pack.json', MANIFEST('no-entry'))
    let msg = ''
    try { await loadPackDir(join(d, 'packs/no-entry'), null) } catch (e) { msg = e.message }
    if (!/entry "index.mjs" does not exist/.test(msg)) fail(`a missing entry must refuse (got "${msg}")`)
  }

  // collectPacks: a root scan plus explicit specs, deduped by name; a name
  // collision refuses to start (SPEC section 4, never silent dedupe).
  {
    const d = tmp()
    write(d, 'packs/public/alpha-shape/pack.json', MANIFEST('alpha-shape'))
    write(d, 'packs/public/alpha-shape/index.mjs', ENTRY)
    write(d, 'node_modules/beta-shape/pack.json', MANIFEST('beta-shape'))
    write(d, 'node_modules/beta-shape/index.mjs', ENTRY)
    const packs = await collectPacks({ root: join(d, 'packs/public'), specs: ['beta-shape'], cwd: d })
    const names = packs.map((p) => p.name).sort()
    if (names.join(',') !== 'alpha-shape,beta-shape') fail(`collectPacks must load root + npm spec (got ${names})`)
    // A collision: the same pack name from two sources.
    write(d, 'node_modules/alpha-shape/pack.json', MANIFEST('alpha-shape'))
    write(d, 'node_modules/alpha-shape/index.mjs', ENTRY)
    let msg = ''
    try { await collectPacks({ root: join(d, 'packs/public'), specs: ['alpha-shape'], cwd: d }) } catch (e) { msg = e.message }
    if (!/collides/.test(msg)) fail(`a pack-name collision must refuse (got "${msg}")`)
  }

  console.log('packs self-test: npm-vs-path + local resolve + npm resolve + uninstalled refusal + manifest violations + missing entry + collect/dedupe + collision - PASS')
} finally {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
}
