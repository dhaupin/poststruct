// src/config.mjs - poststruct.config.js / .json (PRD 4.4).
//
// Small on purpose. The config carries three things: the default dir, per-check
// level overrides, and walk scope. No config at all must still produce a
// sensible audit, so every field here is optional and the defaults are the
// behavior the CLI already had.
//
// Overrides are applied as a post-pass over the findings rather than threaded
// through each check. That keeps checks pure file readers (they always report
// what they see) and makes the mapping one place: 'off' drops a finding, 'warn'
// demotes a fail, 'fail' promotes a warn.
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const LEVELS = ['fail', 'warn', 'off']

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const CANDIDATES = ['poststruct.config.js', 'poststruct.config.mjs', 'poststruct.config.json']

export async function loadConfig(cwd = process.cwd()) {
  for (const name of CANDIDATES) {
    const p = join(cwd, name)
    if (!existsSync(p)) continue
    let raw
    if (name.endsWith('.json')) {
      raw = JSON.parse(await (await import('node:fs/promises')).readFile(p, 'utf8'))
    } else {
      const mod = await import(pathToFileURL(p).href)
      raw = mod.default ?? mod
    }
    return normalize(raw, name)
  }
  return normalize({}, null)
}

function normalize(raw, source) {
  const checks = raw.checks || {}
  for (const [pattern, level] of Object.entries(checks)) {
    if (!LEVELS.includes(level)) {
      throw new Error(`${source}: checks['${pattern}'] is '${level}' (want fail | warn | off)`)
    }
  }
  const lang = raw.language || {}
  if (lang.textDirs !== undefined && !Array.isArray(lang.textDirs)) {
    throw new Error(`${source}: language.textDirs must be an array of directories`)
  }
  return {
    source,
    dir: raw.dir || null,
    checks,
    // The language module's knobs: where source prose lives, which dash classes
    // are banned, and any per-org banned terms. All optional; core names none.
    language: {
      textDirs: lang.textDirs || [],
      dashClasses: lang.dashClasses || null,
      bannedTerms: lang.bannedTerms || [],
    },
    // The frontmatter module's rules (per-file glob -> required keys + types).
    // Shape-validated here; the key/type vocabulary is validated in the module
    // so the type list lives in one place.
    frontmatter: { rules: raw.frontmatter?.rules || [], source },
    scope: { is404: raw.scope?.is404 || null, skip: raw.scope?.skip || [] },
  }
}

// A check pattern is an exact id or a prefix glob ('a11y/*'). The longest
// matching pattern wins, so 'head/*' can set a default and a specific id can
// override it without depending on object key order.
export function levelFor(id, checks) {
  let best = null
  let bestLen = -1
  for (const [pattern, level] of Object.entries(checks)) {
    const hit = pattern.endsWith('/*') ? id.startsWith(pattern.slice(0, -1)) : id === pattern
    if (hit && pattern.length > bestLen) { best = level; bestLen = pattern.length }
  }
  return best
}

export function applyOverrides(findings, checks) {
  const out = []
  for (const fd of findings) {
    const level = levelFor(fd.id, checks)
    if (level === 'off') continue
    out.push(level && level !== fd.level ? { ...fd, level } : fd)
  }
  return out
}

// Minimal glob for scope.skip: '**' spans separators, '*' does not.
export function matchesSkip(page, globs) {
  return globs.some((g) => matchesGlob(page, g))
}

// One glob matcher, shared by scope.skip and the frontmatter file rules.
// '**' spans separators and, when followed by '/', matches zero or more whole
// segments - so 'docs/**/*.md' matches both 'docs/a.md' and 'docs/x/a.md'.
// '*' does not cross a separator.
export function matchesGlob(page, glob) {
  const re = new RegExp('^' + globToRe(glob) + '$')
  return re.test(page)
}

function globToRe(glob) {
  let out = ''
  const parts = glob.split('/')
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i]
    const last = i === parts.length - 1
    if (seg === '**') {
      // '**/' -> zero or more whole segments; a trailing '**' -> anything.
      out += last ? '.*' : '(?:[^/]+/)*'
      continue
    }
    out += seg.split('*').map(escapeRe).join('[^/]*')
    if (!last) out += '/'
  }
  return out
}

// Walk a dir and return every file whose repo-relative path matches the glob.
// Used by the frontmatter module's per-rule file selection. Sorted for the
// determinism the family law requires.
export function walkFiles(root, glob) {
  const out = []
  const visit = (dir, prefix) => {
    let names
    try { names = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of names) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name
      if (e.isDirectory()) visit(join(dir, e.name), rel)
      else if (matchesGlob(rel, glob)) out.push(join(dir, e.name))
    }
  }
  visit(root, '')
  return out.sort()
}
