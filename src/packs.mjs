// src/packs.mjs - the pack loader: manifest validation, source resolution
// (local paths AND npm packages), and the id-collision refusal. One place
// both the campaign runner (scripts/run-packs.mjs) and any audit-side pack
// consumer share, so a pack is validated the same way wherever it is armed.
//
// packstruct SPEC v1 (section 2/5): a pack dir carries pack.json with
// schemaVersion 1, a kebab-case name matching its directory, dotted-semver
// version, a non-empty description, and an `entry` that is a relative path
// inside the pack dir. Every refusal is instant, one-line, and names the
// pack - never a deep stack trace, never silent success.
//
// Sources (SPEC section 4: explicit loads only, no auto-download):
//   - a local path: './packs/wp-seo-shapes' or 'packs/wp-seo-shapes'
//   - an npm package: '@poststruct/wp-seo-shapes' or 'wp-seo-shapes',
//     resolved from the nearest node_modules that carries it. If it is not
//     installed the load REFUSES with the fix named - it never fetches.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, join, parse, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const PACK_SCHEMA_VERSION = 1

const RE_KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const RE_SEMVER = /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/

// A pack spec is an npm name when it has no path shape (no leading '.', '/',
// or '~', and no slash-separated directory that exists relative to cwd).
// Scoped names ('@scope/name') are npm; a bare 'packs/foo' is a path.
export function isNpmSpec(spec) {
  if (!spec || spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('~')) return false
  if (spec.startsWith('@')) return true
  // A bare word is npm; a path-ish word with a slash is npm ONLY if scoped,
  // otherwise it names a directory. 'wp-seo-shapes' is npm; 'packs/foo' is a path.
  return !spec.includes('/')
}

// Resolve one pack spec to an absolute pack dir. Local: relative to cwd.
// npm: walk up from cwd for node_modules/<name> that carries a pack.json.
// Never downloads - an uninstalled npm pack refuses with the fix named.
export function resolvePackSpec(spec, cwd = process.cwd()) {
  if (isNpmSpec(spec)) {
    const found = resolveInstalled(spec, cwd)
    if (!found) {
      throw new Error(`pack "${spec}" is not installed - fix: npm i -D ${spec} (the loader never downloads a pack)`)
    }
    return { dir: found, source: `npm:${spec}` }
  }
  const dir = resolve(cwd, spec)
  if (!existsSync(dir)) throw new Error(`pack path "${spec}" does not exist (resolved to ${dir})`)
  return { dir, source: `path:${spec}` }
}

function resolveInstalled(name, cwd) {
  let dir = resolve(cwd)
  const { root } = parse(dir)
  for (;;) {
    const candidate = join(dir, 'node_modules', ...name.split('/'))
    if (existsSync(join(candidate, 'pack.json'))) return candidate
    if (dir === root) return null
    dir = dirname(dir)
  }
}

// Validate a manifest against SPEC v1. `dirName` is the pack directory's
// basename; the spec requires the manifest name to match it. Throws a
// nameable, one-line error - the caller's job is only to let it surface.
export function validateManifest(spec, dirName, source) {
  const where = source ? `${source} (${dirName})` : dirName
  if (!spec || typeof spec !== 'object') throw new Error(`pack ${where}: pack.json is not an object`)
  if (typeof spec.name !== 'string' || !RE_KEBAB.test(spec.name)) {
    throw new Error(`pack ${where}: manifest "name" must be a kebab-case string (got ${JSON.stringify(spec.name)})`)
  }
  if (spec.name !== dirName) {
    throw new Error(`pack ${where}: manifest name "${spec.name}" does not match the directory name`)
  }
  if (spec.schemaVersion !== PACK_SCHEMA_VERSION) {
    throw new Error(`pack ${where}: pack.json schemaVersion must be ${PACK_SCHEMA_VERSION} (got ${JSON.stringify(spec.schemaVersion)})`)
  }
  if (typeof spec.version !== 'string' || !RE_SEMVER.test(spec.version)) {
    throw new Error(`pack ${where}: "version" must be dotted semver-ish (got ${JSON.stringify(spec.version)})`)
  }
  if (typeof spec.description !== 'string' || !spec.description.trim()) {
    throw new Error(`pack ${where}: "description" must be a non-empty string`)
  }
  if (typeof spec.entry !== 'string' || !spec.entry
      || isAbsolute(spec.entry) || spec.entry.split('/').includes('..')) {
    throw new Error(`pack ${where}: "entry" must be a relative path inside the pack dir (got ${JSON.stringify(spec.entry)})`)
  }
  return spec
}

// Load one pack dir: read + validate the manifest, import the entry, unwrap
// a default export. `source` labels the refusal (a path or npm spec).
export async function loadPackDir(dir, source) {
  const dirName = dir.split('/').pop()
  const manifestPath = join(dir, 'pack.json')
  let spec
  try {
    spec = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (err) {
    throw new Error(`pack ${source || dirName}: no parseable pack.json (${err.message})`)
  }
  validateManifest(spec, dirName, source)
  const entryAbs = join(dir, spec.entry)
  if (!existsSync(entryAbs)) {
    throw new Error(`pack ${source || dirName}: entry "${spec.entry}" does not exist in the pack dir`)
  }
  let loaded
  try {
    loaded = await import(pathToFileURL(entryAbs).href)
  } catch (err) {
    throw new Error(`pack ${source || dirName}: entry "${spec.entry}" failed to load: ${err.message}`)
  }
  let module = loaded
  if (loaded && typeof loaded === 'object' && 'default' in loaded) {
    if (loaded.default == null) throw new Error(`pack ${source || dirName}: entry "${spec.entry}" has a null default export`)
    module = loaded.default
  }
  return { name: spec.name, spec, module, dir, source: source || dir }
}

// Scan a packs ROOT for pack dirs (the packs/public behavior): every
// immediate subdirectory must declare itself. Sorted for determinism.
export function discoverPackDirs(root) {
  let entries
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch (err) {
    throw new Error(`${root} is not a readable pack tree: ${err.message}`)
  }
  return entries.filter((e) => e.isDirectory()).map((e) => join(root, e.name)).sort()
}

// The union loader: a packs root (scanned) plus explicit specs (local paths
// or npm names), deduped by pack name. A name collision refuses to start -
// SPEC section 4, never silent dedupe.
export async function collectPacks({ root, specs = [], cwd = process.cwd() } = {}) {
  const dirs = []
  if (root && existsSync(root)) for (const d of discoverPackDirs(root)) dirs.push({ dir: d, source: null })
  for (const spec of specs) dirs.push(resolvePackSpec(spec, cwd))
  const loaded = []
  const seen = new Map()
  for (const { dir, source } of dirs) {
    const pack = await loadPackDir(dir, source)
    if (seen.has(pack.name)) {
      throw new Error(`pack name "${pack.name}" collides: ${seen.get(pack.name)} and ${pack.source}`)
    }
    seen.set(pack.name, pack.source)
    loaded.push(pack)
  }
  return loaded
}

// Census the ids a loaded pack declares, per the check profile (`checks[]`)
// or the scenario profile (`attacks[]`/`scenarios[]`). Ids are namespaced by
// the pack slug at the host level; this only reports what the entry exposes.
export function censusIds(module) {
  const out = []
  for (const key of ['checks', 'attacks', 'scenarios']) {
    const list = module?.[key]
    if (!Array.isArray(list)) continue
    for (const item of list) {
      const id = typeof item === 'string' ? item : item?.id || item?.name
      if (typeof id === 'string') out.push(`${module.slug || ''}${id}`)
    }
  }
  return out
}

