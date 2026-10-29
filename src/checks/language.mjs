// src/checks/language.mjs - the language module (PRD M2), and the text-shaped
// input profile issue#7 asks for.
//
// The other modules grade baked HTML. This one grades PROSE, wherever it lives:
// a baked page's rendered text, or the source documents a repo keeps its story
// in (markdown, YAML values, JSON string values, plain text). The input shape
// stays the same - a document is a path plus its raw text - only the extraction
// differs, and it is declared rather than implied. That is the profile vant#7
// needs so its pure-text gates can collapse in here.
//
// Checks (mechanical physics; taste ships as an org voice pack):
//
//   language/dash-class            an em/en/figure dash or horizontal bar in
//                                  prose. FAIL by default (the house voice law:
//                                  no dashes, anywhere, ever). Classes are
//                                  configurable - a project can allow a class.
//   language/cliche                a starter lexicon of AI tells ("delve",
//                                  "tapestry", "unlock the potential", the
//                                  "not just X, it is Y" construction). WARN by
//                                  default: a human reviews the snippet.
//   language/banned-term           a term the config or a voice pack names.
//                                  Silent until configured - core names no
//                                  client's words.
//   language/lorem                 lorem ipsum filler in shipped prose. FAIL.
//   language/whitespace            a non-breaking space, zero-width character,
//                                  or a run of 3+ spaces inside a line. WARN.
//   language/frontmatter-unparsed  a leading '---' with no closing '---', so
//                                  the frontmatter is malformed and the whole
//                                  file would be misread. FAIL.
//
// Every finding carries `count` (matches in the document) and `snippet` (the
// first context), per vant#7 req 3 - CI consumes counts first, snippets second.
//
// Determinism (vant#7 req 5, the family law): documents are visited in sorted
// path order, findings in document order, and nothing reads a clock. Two runs
// over one tree produce byte-identical output.
import { readFileSync } from 'node:fs'
import { relative, sep } from 'node:path'
import { proseOf, splitFrontmatter } from '../core.mjs'

const DASH_CLASSES = {
  'em-dash': /\u2014/,
  'en-dash': /\u2013/,
  'figure-dash': /\u2012/,
  'horizontal-bar': /\u2015/,
}
const DASH_NAMES = { '\u2014': 'em dash', '\u2013': 'en dash', '\u2012': 'figure dash', '\u2015': 'horizontal bar' }

// Deliberately small and generic. The full house lexicon is an org voice pack
// (PRD 4.5): core enforces physics, packs enforce vibes.
const CLICHES = [
  [/\bdelve\b/i, 'delve'],
  [/\btapestry\b/i, 'tapestry'],
  [/\bunlock(?:ing)? the (?:full )?potential\b/i, 'unlock the potential'],
  [/in today'?s fast[- ]paced\b/i, "in today's fast-paced world"],
  [/\bnavigate the (?:complex |ever[- ]changing )?landscape\b/i, 'navigate the landscape'],
  [/\btestament to\b/i, 'testament to'],
  [/\bever[- ]evolving\b/i, 'ever-evolving'],
  [/\bgame[- ]chang(?:er|ing)\b/i, 'game-changer'],
  [/\bit'?s not just\b[^.!?]*?\bit'?s\b/i, "it's not just X, it's Y"],
  [/\bwhen it comes to\b/i, 'when it comes to'],
]
const LOREM = /\blorem ipsum\b|\bdolor sit amet\b/i
// Invisible-character disasters: characters a reader cannot see but a machine
// can. A run of spaces is visible and is how markdown tables align, so it is
// not a language defect - these two are.
const WHITESPACE = [
  [/\u00a0/, 'non-breaking space'],
  [/[\u200b\u200c\u200d\ufeff]/, 'zero-width character'],
]

const snippet = (s, index, len) => {
  const from = Math.max(0, index - 20)
  return s.slice(from, index + len + 20).replace(/\s+/g, ' ').trim().slice(0, 80)
}

// Count non-overlapping matches of a global regex over a string, and capture the
// first match's offset and length for the snippet. Rebuilt per call so no global
// lastIndex leaks between documents.
function countMatches(text, re) {
  const src = re instanceof RegExp ? re.source : String(re)
  const flags = re instanceof RegExp ? re.flags : ''
  const g = new RegExp(src, flags.includes('g') ? flags : flags + 'g')
  let n = 0
  let first = null
  for (const m of text.matchAll(g)) {
    if (first === null) first = { index: m.index, len: m[0].length }
    n += 1
  }
  return { n, first }
}

export function auditLanguage(docs, f, opts = {}) {
  const cfg = opts.language || {}
  const dashClasses = cfg.dashClasses || DASH_CLASSES
  const banned = (cfg.bannedTerms || []).map((t) => (typeof t === 'string' ? { term: t, level: 'warn' } : t))

  // Sorted by path so the visit order is stable across runs and platforms.
  const ordered = [...docs].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))

  for (const doc of ordered) {
    const raw = readFileSync(doc.abs, 'utf8')
    const page = doc.path.split(sep).join('/')

    // Frontmatter, when the kind can carry it, is a defined input part: a
    // malformed block is its own finding, and a well-formed one is stripped
    // before prose grading so the delimiters are never read as writing.
    if (doc.kind === 'md') {
      const { frontmatter } = splitFrontmatter(raw)
      if (raw.startsWith('---') && frontmatter === null) {
        f.fail(page, 'language/frontmatter-unparsed', 'leading --- with no closing --- - frontmatter is malformed', { count: 1, snippet: raw.slice(0, 40).replace(/\n/g, ' ') })
      }
    }

    const prose = proseOf(doc.kind, raw)
    if (!prose) continue

    // Dashes: report per class, first occurrence's snippet, with the total.
    for (const [name, re] of Object.entries(dashClasses)) {
      const { n, first } = countMatches(prose, re)
      if (!n) continue
      const ch = prose[first.index]
      f.fail(page, 'language/dash-class', `${n} ${DASH_NAMES[ch] || name}${n > 1 ? 's' : ''} in prose (use a hyphen)`, { count: n, snippet: snippet(prose, first.index, first.len) })
    }

    // AI-cliche lexicon.
    for (const [re, label] of CLICHES) {
      const { n, first } = countMatches(prose, re)
      if (!n) continue
      f.warn(page, 'language/cliche', `${n} AI-cliche tell${n > 1 ? 's' : ''}: "${label}"`, { count: n, snippet: snippet(prose, first.index, first.len) })
    }

    // Banned terms (config or voice pack).
    for (const b of banned) {
      if (!b.term) continue
      const re = new RegExp(b.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
      const { n, first } = countMatches(prose, re)
      if (!n) continue
      const emit = b.level === 'fail' ? f.fail.bind(f) : f.warn.bind(f)
      emit(page, 'language/banned-term', `${n} banned term${n > 1 ? 's' : ''}: "${b.term}"`, { count: n, snippet: snippet(prose, first.index, first.len) })
    }

    // Lorem ipsum.
    const lorem = countMatches(prose, LOREM)
    if (lorem.n) f.fail(page, 'language/lorem', 'lorem ipsum filler in shipped prose', { count: lorem.n, snippet: snippet(prose, lorem.first.index, lorem.first.len) })

    // Whitespace disasters.
    for (const [re, label] of WHITESPACE) {
      const { n, first } = countMatches(prose, re)
      if (!n) continue
      f.warn(page, 'language/whitespace', `${n} ${label}${n > 1 ? 's' : ''}`, { count: n, snippet: snippet(prose, first.index, first.len) })
    }
  }
}
