// src/core.mjs - the walk + extraction helpers. Attribute-ORDER tolerant:
// engines emit aligned multi-space attributes, and a naive single-space
// regex false-negatives on their own output (caught on the first audit).
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

export class Findings {
  constructor() { this.fails = []; this.warns = [] }
  // `detail` is optional and additive: the language module attaches {count,
  // snippet} so CI can consume counts first and snippets second (issue#7 req 3).
  fail(page, id, message, detail) { this.fails.push({ level: 'fail', page, id, message, ...(detail || {}) }) }
  warn(page, id, message, detail) { this.warns.push({ level: 'warn', page, id, message, ...(detail || {}) }) }
  get counts() { return { fail: this.fails.length, warn: this.warns.length } }
  get hasFails() { return this.fails.length > 0 }
}

export function walkHtml(dir) {
  if (!existsSync(dir)) throw new Error(`No ${dir}/ directory - run the build first.`)
  let out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out = out.concat(walkHtml(p))
    else if (name.endsWith('.html')) out.push(p)
  }
  return out
}

// The text-shaped input profile (issue#7): the language module grades source
// prose, not only baked HTML. Same walk shape as walkHtml, one extension set.
export const TEXT_EXTS = ['.md', '.markdown', '.yml', '.yaml', '.json', '.txt']
export function walkText(dir, exts = TEXT_EXTS) {
  if (!existsSync(dir)) throw new Error(`No ${dir}/ directory - run the build first.`)
  let out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out = out.concat(walkText(p, exts))
    else if (exts.some((e) => name.toLowerCase().endsWith(e))) out.push(p)
  }
  return out
}

export function textKind(path) {
  const p = path.toLowerCase()
  if (p.endsWith('.md') || p.endsWith('.markdown')) return 'md'
  if (p.endsWith('.yml') || p.endsWith('.yaml')) return 'yaml'
  if (p.endsWith('.json')) return 'json'
  if (p.endsWith('.html')) return 'html'
  return 'txt'
}

// Split a leading '---' YAML frontmatter block from the body. Returns the raw
// frontmatter string (null when absent) and the remaining body, so frontmatter
// is a defined input part rather than an accident of the markdown text.
export function splitFrontmatter(raw) {
  const m = raw.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  return m ? { frontmatter: m[1], body: raw.slice(m[0].length) } : { frontmatter: null, body: raw }
}

// The prose of one file, per kind. This is the "text profile" the language
// module consumes: markdown body (code stripped), YAML values, JSON string
// values, plain text, or HTML with tags and code elements removed. Code is
// literal data, not prose, the same posture the repo's own gates take.
export function proseOf(kind, raw) {
  if (kind === 'md') {
    const { body } = splitFrontmatter(raw)
    return body
      .replace(/```[\s\S]*?```/g, ' ')      // fenced code blocks
      .replace(/~~~[\s\S]*?~~~/g, ' ')
      .replace(/`[^`\n]*`/g, ' ')            // inline code spans
      .replace(/<[^>]+>/g, ' ')              // embedded HTML tags
  }
  if (kind === 'yaml') {
    // Values are prose; drop whole-line comments and the key half of mappings
    // so identifiers and anchors do not read as writing.
    return raw.split('\n').map((l) => l.replace(/^\s*#.*$/, '').replace(/^\s*[\w.-]+\s*:\s*/, '')).join('\n')
  }
  if (kind === 'json') {
    try { return jsonStrings(JSON.parse(raw)).join('\n') } catch { return '' }
  }
  if (kind === 'html') {
    return raw
      .replace(/<(script|style|pre|code)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      // Rendered HTML collapses whitespace, so the runs left by tag removal are
      // an extraction artifact, not a prose signal. Collapse them.
      .replace(/[ \t]{2,}/g, ' ')
  }
  return raw
}

function jsonStrings(node, out = []) {
  if (typeof node === 'string') out.push(node)
  else if (Array.isArray(node)) for (const v of node) jsonStrings(v, out)
  else if (node && typeof node === 'object') for (const v of Object.values(node)) jsonStrings(v, out)
  return out
}

export function loadPage(dir, path) {
  const html = readFileSync(path, 'utf8')
  return { page: relative(dir, path), html, head: html.split('</head>')[0] }
}

// Order-tolerant meta grab: tries both attribute orders.
export function grabMeta(head, attr, name) {
  const m = head.match(new RegExp(`<meta[^>]+${attr}="${name}"[^>]*content="([^"]*)"`))
    || head.match(new RegExp(`<meta[^>]+content="([^"]*)"[^>]*${attr}="${name}"`))
  return m ? m[1] : null
}
