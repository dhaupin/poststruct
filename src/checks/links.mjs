// src/checks/links.mjs - the internal link graph (PRD M1).
//
// Scope, deliberately narrow: <a href> targets inside the baked tree, checked
// against the files that actually exist, plus _redirects rules. mailto:/tel:
// and anything with a scheme are out of scope, and this module never touches
// the network - external validation is the opt-in --check-external lane.
//
// Resolution order mirrors what a static host does: exact file, then
// <path>.html, then <path>/index.html, then a matching _redirects rule. A
// candidate must be a FILE: a directory that exists but has no index.html is
// a 404 on the host, so existsSync alone would report a lie.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, dirname, relative, sep } from 'node:path'

const SCHEME = /^[a-z][a-z0-9+.-]*:/i
const HAS_EXT = /\/[^/]*\.\w+$/

const ENTITIES = { '&amp;': '&', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&lt;': '<', '&gt;': '>' }
const decode = (s) => s.replace(/&(?:amp|quot|#39|apos|lt|gt);/g, (m) => ENTITIES[m] || m)

export function readRedirects(dist) {
  const p = join(dist, '_redirects')
  if (!existsSync(p)) return []
  const rules = []
  for (const raw of readFileSync(p, 'utf8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const [from, to, status] = line.split(/\s+/)
    if (!from || !to) continue
    rules.push({ from, to, status: status || '301' })
  }
  return rules
}

function redirectCovers(rules, path) {
  return rules.some((r) => r.from === path || (r.from.endsWith('/*') && path.startsWith(r.from.slice(0, -1))))
}

// What the tree at `dist` would serve for `path`, seen from `baseDir`.
// Returns the resolved absolute file path, or null when nothing would serve.
function resolveIn(dist, baseDir, path) {
  const clean = path.replace(/^\/+/, '')
  const rooted = path.startsWith('/') ? join(dist, clean) : join(dist, baseDir, clean)
  // A link that climbs out of the tree can never be served from it.
  if (relative(dist, rooted).startsWith('..')) return null
  const cands = [rooted]
  if (!path.endsWith('/')) cands.push(rooted + '.html')
  cands.push(join(rooted, 'index.html'))
  for (const c of cands) {
    if (relative(dist, c).startsWith('..')) continue
    try { if (statSync(c).isFile()) return c } catch { /* not a file */ }
  }
  return null
}

function hasAnchor(html, frag) {
  const esc = frag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\s(?:id|name)=["']${esc}["']`).test(html)
}

export function auditLinks(dist, pages, f, { anchorLevel = 'warn' } = {}) {
  const rules = readRedirects(dist)
  const cache = new Map()
  const htmlAt = (abs) => {
    if (!cache.has(abs)) cache.set(abs, readFileSync(abs, 'utf8'))
    return cache.get(abs)
  }
  const note = (page, id, message) => (anchorLevel === 'fail' ? f.fail(page, id, message) : f.warn(page, id, message))

  for (const abs of pages) {
    const html = htmlAt(abs)
    const page = relative(dist, abs).split(sep).join('/')
    const baseDir = dirname(page) === '.' ? '' : dirname(page)

    for (const m of html.matchAll(/<a\b[^>]*?\shref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
      const href = decode(m[1] ?? m[2] ?? '')
      if (!href || href.startsWith('//') || SCHEME.test(href)) continue

      const hashAt = href.indexOf('#')
      const frag = hashAt >= 0 ? href.slice(hashAt + 1) : ''
      const path = (hashAt >= 0 ? href.slice(0, hashAt) : href).split('?')[0]

      // Same-page jump: check the anchor on the page we are already reading.
      if (!path) {
        if (frag && !hasAnchor(html, frag)) note(page, 'links/anchor-missing', `#${frag} not found on this page`)
        continue
      }

      const target = resolveIn(dist, baseDir, path)
      if (!target && !redirectCovers(rules, path)) {
        f.fail(page, 'links/broken-internal', `internal link to missing target: ${href}`)
        continue
      }
      if (frag && target && !hasAnchor(htmlAt(target), frag)) {
        note(page, 'links/anchor-missing', `#${frag} not found at ${path}`)
      }
    }
  }

  for (const r of rules) {
    if (SCHEME.test(r.to) || r.to.startsWith('//') || r.to.includes('*') || r.to.includes(':')) continue
    if (!resolveIn(dist, '', r.to) && !redirectCovers(rules, r.to)) {
      f.fail('_redirects', 'links/redirect-target-missing', `${r.from} redirects to a missing target: ${r.to}`)
    }
  }
}
