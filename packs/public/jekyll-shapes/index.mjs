// jekyll-shapes - file checks over a site baked by Jekyll, aimed at the
// three head sins a Jekyll build reliably produces (the PRD's M1 catalog):
//
//   1. excerpt-as-description  - jekyll-seo-tag's drop.rb resolves the meta
//      description as page["description"] || page["excerpt"] || site
//      description, capped at 100 words. A post with no front-matter
//      description therefore ships its rendered FIRST PARAGRAPH as the meta
//      description - body prose leaks into the head, and the tag can disagree
//      with the page. This is the collision the check names.
//   2. meta-double-shipped     - a layout carrying hand-written head meta
//      AND {% seo %} emits description / og:title / canonical twice.
//   3. hreflang-orphan         - an hreflang pointing at a language sibling
//      that was never built (jekyll-seo-tag ships no hreflang support at all,
//      so these are hand-authored and easy to leave dangling).
//
// Grounded against real Jekyll 4.4.1 + jekyll-seo-tag 2.9.1 output, not the
// prose: a site was built and its head inspected, which is how the excerpt
// fallback, the 100-word cap with an ellipsis, and the doubled-tag counts
// were observed. All pure file reads: attribute regexes over committed
// output. Zero network, zero HTML execution.
//
// THE CONTRACT with the target (moduleCtx['jekyllTree']):
//   root           -> absolute path to the baked _site dir, or null (the
//                     pack then dockets one BOUNDED row and audits nothing)
//   exists(rel) / text(rel) / readdir(rel) -> the tree fs helpers
//
// Verdict taxonomy (family): BOUNDED / PASSED / EXPLOITED.

export const PKG = 'packs/public/jekyll-shapes'

export const REQUIRED_KEYS = ['jekyllTree']

const PACK = 'jekyll-shapes'

// The marker jekyll-seo-tag wraps its output in. Its absence means the SEO
// tag never ran, so the excerpt fallback (check 1) is not in play and that
// check dockets BOUNDED rather than guessing.
const SEO_TAG_RE = /Begin Jekyll SEO tag v([\d.]+)/

// A hand-written description this short is not worth calling a leak; the
// signature (equality with, or a truncation of, the first paragraph) is what
// makes the finding, and length guards against coincidence.
const MIN_LEAK_CHARS = 60

function take(ctx, key) {
  const value = ctx?.[key]
  if (value === undefined) throw new TypeError(`${PKG}: moduleCtx[${JSON.stringify(key)}] is missing - the runner did not arm the ${key} contract`)
  return value
}

function walkHtml(readdir, relPrefix) {
  const out = []
  let names = []
  try { names = readdir(relPrefix || '') } catch { names = [] }
  for (const name of names) {
    const rel = relPrefix ? `${relPrefix}/${name}` : name
    if (/\.(html|htm)$/i.test(name)) out.push(rel)
    else out.push(...walkHtml(readdir, rel))
  }
  return out.sort()
}

export function metaContent(html, key) {
  const tag = new RegExp(`<meta\\s+[^>]*(?:name|property)\\s*=\\s*["']${key}["'][^>]*>`, 'i').exec(html)?.[0]
  if (!tag) return null
  return /content\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? null
}

export function metaCount(html, key) {
  return (html.match(new RegExp(`<meta\\s+[^>]*(?:name|property)\\s*=\\s*["']${key}["']`, 'gi')) || []).length
}

export function canonicalHref(html) {
  const tag = /<link\s+[^>]*rel\s*=\s*["']canonical["'][^>]*>/i.exec(html)?.[0]
  if (!tag) return null
  return /href\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? null
}

export function canonicalCount(html) {
  return (html.match(/<link\s+[^>]*rel\s*=\s*["']canonical["']/gi) || []).length
}

function normalizeWs(s) {
  return String(s || '').replace(/\s+/g, ' ').trim()
}

function stripTags(s) {
  return normalizeWs(String(s || '').replace(/<[^>]*>/g, ' '))
}

// The page's first rendered paragraph, tag-stripped. The excerpt that leaks
// into the meta description is this paragraph (Jekyll's excerpt is the
// content up to the first blank line).
export function firstParagraph(html) {
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html
  const p = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(body)?.[1]
  return p == null ? null : stripTags(p)
}

function originOf(url) {
  const m = /^https?:\/\/([^/]+)/i.exec(url || '')
  return m ? m[1].toLowerCase() : null
}

class Verdicts {
  constructor() { this.rows = []; this.ok = true }
  passed(id, detail) { this.rows.push({ pack: PACK, id, verdict: 'PASSED', detail: String(detail || '').slice(0, 220) }) }
  bounded(id, bound, detail) { this.rows.push({ pack: PACK, id, verdict: 'BOUNDED', bound, detail: String(detail || '').slice(0, 220) }) }
  failed(id, fault) {
    this.ok = false
    this.rows.push({ pack: PACK, id, verdict: 'EXPLOITED', detail: String(fault.problem || JSON.stringify(fault)).slice(0, 220), fault })
  }
}

export function run(ctx) {
  for (const key of REQUIRED_KEYS) take(ctx, key)
  const v = new Verdicts()
  const tree = ctx.jekyllTree

  if (!tree || tree.root == null) {
    v.bounded('jekyll/baked-site-absent', 'target-tree-absent', 'no Jekyll-baked output armed (set JEKYLL_SITE) - nothing was audited, nothing was passed')
    return { ok: v.ok, rows: v.rows }
  }

  const pages = walkHtml(tree.readdir, '')
  if (!pages.length) {
    v.bounded('jekyll/baked-site-absent', 'output-empty', `no .html under ${tree.root} - bake first; the pack cannot audit what was never built`)
    return { ok: v.ok, rows: v.rows }
  }

  const html = new Map()
  for (const page of pages) html.set(page, tree.text(page) || '')

  const seoTags = pages.filter((p) => SEO_TAG_RE.test(html.get(p)))

  // --- excerpt-as-description: the meta description must not BE the body ---
  if (!seoTags.length) {
    v.bounded('jekyll/excerpt-as-description', 'seo-tag-absent', `no "Begin Jekyll SEO tag" marker in ${pages.length} page(s) - the excerpt fallback is a jekyll-seo-tag behavior, so this check cannot fire`)
  } else {
    const leaks = []
    for (const page of pages) {
      if (!SEO_TAG_RE.test(html.get(page))) continue
      const raw = metaContent(html.get(page), 'description')
      const para = firstParagraph(html.get(page))
      if (!raw || !para) continue
      const desc = normalizeWs(raw)
      const truncated = /(…|\.\.\.)$/.test(desc)
      const core = normalizeWs(desc.replace(/(…|\.\.\.)$/, ''))
      if (core.length < MIN_LEAK_CHARS) continue
      const isLeak = para === core || (truncated && para.startsWith(core))
      if (isLeak) leaks.push({ page, description: desc.slice(0, 80) + (desc.length > 80 ? '…' : ''), why: truncated ? 'the description is the first paragraph truncated' : 'the description is exactly the first paragraph' })
    }
    if (leaks.length) {
      v.failed('jekyll/excerpt-as-description', {
        problem: 'a post with no front-matter description shipped its rendered first paragraph as the meta description - body prose leaked into the head (jekyll-seo-tag falls back to page.excerpt)',
        leaks,
      })
    } else {
      v.passed('jekyll/excerpt-as-description', `${seoTags.length} seo-tag page(s): no description is a verbatim/truncated first paragraph`)
    }
  }

  // --- meta-double-shipped: hand meta + {% seo %} emit the same tag twice ---
  const doubled = []
  for (const page of pages) {
    const body = html.get(page)
    for (const [key, n] of [['description', metaCount(body, 'description')], ['og:title', metaCount(body, 'og:title')], ['canonical', canonicalCount(body)]]) {
      if (n > 1) doubled.push({ page, tag: key, count: n })
    }
  }
  if (doubled.length) {
    v.failed('jekyll/meta-double-shipped', {
      problem: 'a head tag appears more than once on a page - a layout carrying hand-written meta AND {% seo %} double-ships it (description / og:title / canonical)',
      doubled,
    })
  } else {
    v.passed('jekyll/meta-double-shipped', `${pages.length} page(s): description / og:title / canonical each appear at most once`)
  }

  // --- hreflang-orphan: a same-origin hreflang target that was never built ---
  const HREFLANG_RE = /<link\s+[^>]*rel\s*=\s*["']alternate["'][^>]*hreflang\s*=\s*["']([^"']+)["'][^>]*>/gi
  const orphans = []
  let hreflangSeen = 0
  for (const page of pages) {
    const body = html.get(page)
    const canonOrigin = originOf(canonicalHref(body) || '')
    let m
    HREFLANG_RE.lastIndex = 0
    while ((m = HREFLANG_RE.exec(body))) {
      const href = /href\s*=\s*["']([^"']*)["']/i.exec(m[0])?.[1]
      if (!href) continue
      hreflangSeen += 1
      const hrefOrigin = originOf(href)
      // Only same-origin (or relative) targets are ours to verify; an
      // external language site is out of scope.
      if (hrefOrigin && canonOrigin && hrefOrigin !== canonOrigin) continue
      if (hrefOrigin && !canonOrigin) continue
      let pathPart = href.replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0]
      if (!pathPart.startsWith('/')) continue
      const candidates = pathPart.endsWith('/')
        ? [`${pathPart}index.html`, pathPart.slice(0, -1) + '.html']
        : [pathPart, `${pathPart}/index.html`, `${pathPart}.html`]
      if (!candidates.some((c) => tree.exists(c.replace(/^\//, '')))) {
        orphans.push({ page, hreflang: m[1], href })
      }
    }
  }
  if (!hreflangSeen) {
    v.bounded('jekyll/hreflang-orphan', 'no-hreflang', `${pages.length} page(s) carry no hreflang alternate - nothing to verify (jekyll-seo-tag emits none; these are hand-authored)`)
  } else if (orphans.length) {
    v.failed('jekyll/hreflang-orphan', {
      problem: 'an hreflang points at a same-origin page that was not built - the language alternate 404s',
      orphans,
    })
  } else {
    v.passed('jekyll/hreflang-orphan', `${hreflangSeen} same-origin hreflang(s) all resolve to a built page`)
  }

  return { ok: v.ok, rows: v.rows }
}

// SPEC section 3: every entry carries a default export.
export default { run, PKG, REQUIRED_KEYS }
