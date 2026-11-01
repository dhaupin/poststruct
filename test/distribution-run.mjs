// test/distribution-run.mjs - the distribution contract (poststruct#79).
// The pack lane is only as useful as the pack's DELIVERY: every other family
// verdict is armed by an EXACT npm pin, so the packs must ride the published
// tarball. npm honours package.json `files`, so a pack tree excluded there is
// invisible to `npm i poststruct` even though it is committed and green. This
// test pins the two halves of that contract against the real tree - the
// `files` whitelist carries `packs/`, and every committed pack dir is one the
// whitelist would ship - so a refactor that drops `packs/` from `files`
// (silently un-delivering the packs) fails here instead of in a consumer's CI.
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const treeRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const fails = []
const assert = (cond, label) => { if (!cond) fails.push(label) }

const pkg = JSON.parse(readFileSync(join(treeRoot, 'package.json'), 'utf8'))
const files = Array.isArray(pkg.files) ? pkg.files : []

// 1. `packs/` is whitelisted. Without it the tarball ships zero pack bytes.
assert(files.includes('packs/'), 'package.json `files` must carry `packs/` - otherwise npm i poststruct delivers no packs (poststruct#79)')

// 2. Every committed pack dir rides the whitelist. A pack dir is any
// immediate subdirectory of packs/public/ carrying a pack.json.
const packsRoot = join(treeRoot, 'packs', 'public')
let packDirs = []
try { packDirs = readdirSync(packsRoot, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort() } catch { packDirs = [] }
assert(packDirs.length > 0, `packs/public/ must carry at least one pack dir (found ${packDirs.length})`)
for (const name of packDirs) {
  assert(existsSync(join(packsRoot, name, 'pack.json')), `pack dir packs/public/${name} must carry a pack.json`)
}
// `files: ["packs/"]` ships the whole subtree, so one entry covers them all -
// but the whitelist must not be narrowed to a pack-by-pack list that misses a
// newly added pack. Guard the intent: either the bare `packs/` dir entry is
// present, or every pack dir is named explicitly.
const barePacks = files.includes('packs/')
const namedAll = packDirs.every((n) => files.includes(`packs/public/${n}`) || files.includes(`packs/public/${n}/`))
assert(barePacks || namedAll, `every pack dir must be delivered: ${packDirs.join(', ')} (files=${JSON.stringify(files)})`)

// 3. The pack the eyestruct#5 wiring arms is present and delivered by name.
assert(packDirs.includes('eyestruct-shapes'), 'the eyestruct-shapes pack (the eyestruct#5 wiring target) must be committed under packs/public/')

if (fails.length) {
  console.error(`distribution self-test FAIL:\n  ${fails.join('\n  ')}`)
  process.exit(1)
}
console.log(`distribution self-test: files carries packs/ + ${packDirs.length} committed pack dir(s) delivered (incl. eyestruct-shapes) - PASS`)
process.exit(0)
