// src/checks/frontmatter.mjs - the parsed frontmatter key/type surface
// (PRD M2, answers vant#7 req 2).
//
// The language module treats a leading '---' block as a defined input part
// (it splits the block so delimiters are never read as writing, and FAILs a
// malformed one). This module goes one step further: it PARSES the block into
// a key/value surface and grades it against a rule the config declares -
// required keys present, and each key's value the declared type. That is the
// shape vant's check-docs-frontmatter gate needs to collapse in here.
//
// Checks (all FAIL - a missing or mistyped key is a build contract break, not
// a matter of taste):
//
//   frontmatter/block-missing   a file a rule matches carries no frontmatter
//                               block at all.
//   frontmatter/key-missing     a required key is absent.
//   frontmatter/type-mismatch   a key is present but its value is not the
//                               declared type.
//
// The parser is a deliberately small YAML subset - top-level scalar keys,
// inline arrays, and block sequences/maps - because that is what site
// frontmatter actually holds (title, description, layout, tags, date,
// nav_order). It is not a general YAML engine and does not pretend to be:
// a construct it cannot read becomes a `type-mismatch` against the declared
// type rather than a silent pass. Types: string, number, boolean, date,
// array, object, null.
import { readFileSync } from 'node:fs'
import { relative, sep } from 'node:path'
import { splitFrontmatter } from '../core.mjs'
import { walkFiles } from '../config.mjs'

export const TYPES = ['string', 'number', 'boolean', 'date', 'array', 'object', 'null']

const RE_KEY = /^([A-Za-z0-9_.-]+):\s*(.*)$/
const RE_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2})?/

// Parse the top-level keys of a frontmatter block into { key: {type, raw} }.
// Only top-level keys are surfaced: a nested map is one `object` value, a
// block sequence is one `array` value, and the keys inside them are not
// required-key candidates (site frontmatter requireds are always top-level).
export function parseFrontmatter(block) {
  const out = new Map()
  if (block == null) return out
  const lines = block.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const m = RE_KEY.exec(lines[i])
    if (!m) continue
    const key = m[1]
    const inline = m[2].trim()
    let value
    if (inline === '') {
      // A key with nothing after it: look ahead for the block's shape.
      let shape = 'null'
      for (let j = i + 1; j < lines.length; j++) {
        if (!lines[j].trim()) continue
        if (/^\s+-\s/.test(lines[j]) || lines[j].trim() === '-') shape = 'array'
        else if (/^\s+\S/.test(lines[j])) shape = 'object'
        break
      }
      value = { type: shape, raw: '' }
    } else {
      value = { type: scalarType(inline), raw: inline }
    }
    out.set(key, value)
  }
  return out
}

function scalarType(s) {
  if (s.startsWith('[') && s.endsWith(']')) return 'array'
  if (s.startsWith('{') && s.endsWith('}')) return 'object'
  const bare = unquote(s)
  if (/^(true|false)$/i.test(bare)) return 'boolean'
  if (/^(null|~)$/i.test(bare)) return 'null'
  if (/^-?\d+(?:\.\d+)?$/.test(bare)) return 'number'
  if (RE_DATE.test(bare)) return 'date'
  return 'string'
}

function unquote(s) {
  const t = s.trim()
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1)
  return t
}

// Normalize a rule's key/type map. A bare string type must be one of TYPES; a
// rule that names an unknown type refuses loudly rather than silently passing
// every file it was meant to guard.
export function normalizeRules(rules, source) {
  if (rules === undefined) return []
  if (!Array.isArray(rules)) throw new Error(`${source}: frontmatter.rules must be an array`)
  return rules.map((rule, i) => {
    if (!rule || typeof rule !== 'object') throw new Error(`${source}: frontmatter.rules[${i}] must be an object`)
    if (typeof rule.files !== 'string' || !rule.files) throw new Error(`${source}: frontmatter.rules[${i}].files must be a glob string`)
    const check = (map, field) => {
      const out = {}
      for (const [k, t] of Object.entries(map || {})) {
        if (!TYPES.includes(t)) throw new Error(`${source}: frontmatter.rules[${i}].${field}['${k}'] is '${t}' (want ${TYPES.join(' | ')})`)
        out[k] = t
      }
      return out
    }
    return { files: rule.files, required: check(rule.required, 'required'), types: check(rule.types, 'types') }
  })
}

export function auditFrontmatter(cwd, f, opts = {}) {
  const rules = normalizeRules(opts.frontmatter?.rules, opts.frontmatter?.source || 'poststruct.config')
  if (!rules.length) return 0
  const touched = new Set()
  for (const rule of rules) {
    const files = walkFiles(cwd, rule.files)
    for (const abs of files) {
      const page = relative(cwd, abs).split(sep).join('/')
      touched.add(page)
      const raw = readFileSync(abs, 'utf8')
      const { frontmatter } = splitFrontmatter(raw)
      if (frontmatter == null) {
        f.fail(page, 'frontmatter/block-missing', `matched by "${rule.files}" but carries no frontmatter block`, { count: 1 })
        continue
      }
      const keys = parseFrontmatter(frontmatter)
      for (const [key, want] of Object.entries(rule.required)) {
        const got = keys.get(key)
        if (!got) { f.fail(page, 'frontmatter/key-missing', `required frontmatter key "${key}" is absent`, { count: 1 }); continue }
        if (got.type !== want) f.fail(page, 'frontmatter/type-mismatch', `frontmatter key "${key}" is ${got.type}, want ${want}`, { count: 1, snippet: `${key}: ${got.raw}`.trim() })
      }
      for (const [key, want] of Object.entries(rule.types)) {
        const got = keys.get(key)
        if (got && got.type !== want) f.fail(page, 'frontmatter/type-mismatch', `frontmatter key "${key}" is ${got.type}, want ${want}`, { count: 1, snippet: `${key}: ${got.raw}`.trim() })
      }
    }
  }
  return touched.size
}
