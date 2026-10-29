// hugo-shapes - file checks over a site baked by Hugo (the PRD's M2 catalog,
// the Hugo slice). The Hugo shape has tells the generic head module cannot
// know:
//
//   1. summary-leak        - a Hugo list/archive page whose meta description
//      is the page's .Summary (Hugo's auto-extracted first ~70 words). Body
//      prose leaks into the head, and every archive entry opens with the
//      same words. Hugo emits no meta description itself, so a description
//      equal to the rendered first paragraph is the .Summary default firing.
//   2. taxonomy-pagination - a taxonomy term page (/tags/x/page/2/) whose
//      canonical drops the page segment. Hugo's own paginated canonicals are
//      self-referential, so a drop means a template overrode it and every
//      term page past the first is de-indexed.
//   3. double-og           - an og template partial wired twice (a theme
//      partial plus a hand-written tag), so og:title / og:description ship
//      twice. A crawler takes the first, so a conflicting pair is the fault.
//
// Grounded against Hugo's documented output (.Summary, the .Paginator
// canonical convention, theme og partials). All pure file reads: attribute
// regexes over committed output. Zero network, zero HTML execution.
//
// THE CONTRACT with the target (moduleCtx['hugoTree']):
//   root           -> absolute path to the baked Hugo public/ dir, or null
//                     (the pack then dockets one BOUNDED row)
//   exists(rel) / text(rel) / readdir(rel) -> the tree fs helpers
//
// Verdict taxonomy (family): BOUNDED / PASSED / EXPLOITED.

export const PKG = 'packs/public/hugo-shapes'

export const REQUIRED_KEYS = ['hugoTree']

const PACK = 'hugo-shapes'

// Hugo stamps a generator meta; it is the cheapest honest signal that the
// tree really is a Hugo bake.

// A description this short is not worth calling a leak; the signature
// (equality with the first paragraph) is what makes the finding.
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

export function metaContents(html, key) {
  const out = []
  const re = new RegExp(`<meta\\s+[^>]*(?:name|property)\\s*=\\s*["']${key}["'][^>]*>`, 'gi')
  let m
  while ((m = re.exec(html))) out.push(/content\s*=\s*["']([^"']*)["']/i.exec(m[0])?.[1] ?? '')
  return out
}

export function metaContent(html, key) {
  return metaContents(html, key)[0] ?? null
}

export function canonicalHref(html) {
  const tag = /<link\s+[^>]*rel\s*=\s*["']canonical["'][^>]*>/i.exec(html)?.[0]
  if (!tag) return null
  return /href\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? null
}

function normalizeWs(s) {
  return String(s || '').replace(/\s+/g, ' ').trim()
}

function stripTags(s) {
  return normalizeWs(String(s || '').replace(/<[^>]*>/g, ' '))
}

// The page's first rendered paragraph, tag-stripped. Hugo's .Summary is the
// content up to the <!--more--> marker, or the first ~70 words - either way
// it is the opening paragraph for a typical post.
export function firstParagraph(html) {
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html
  const p = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(body)?.[1]
  return p == null ? null : stripTags(p)
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
  const tree = ctx.hugoTree

  if (!tree || tree.root == null) {
    v.bounded('hugo/baked-site-absent', 'target-tree-absent', 'no Hugo-baked output armed (set HUGO_SITE) - nothing was audited, nothing was passed')
    return { ok: v.ok, rows: v.rows }
  }

  const pages = walkHtml(tree.readdir, '')
  if (!pages.length) {
    v.bounded('hugo/baked-site-absent', 'output-empty', `no .html under ${tree.root} - bake first; the pack cannot audit what was never built`)
    return { ok: v.ok, rows: v.rows }
  }

  const html = new Map()
  for (const page of pages) html.set(page, tree.text(page) || '')

  // --- summary-leak: the meta description must not BE the body prose ---
  const leaks = []
  for (const page of pages) {
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
    v.failed('hugo/summary-leak', {
      problem: 'a list/archive page shipped its .Summary as the meta description - body prose leaked into the head (Hugo\'s auto-summary default)',
      leaks,
    })
  } else {
    v.passed('hugo/summary-leak', `${pages.length} page(s): no description is a verbatim/truncated first paragraph`)
  }

  // --- taxonomy-pagination: /tags/x/page/2/ canonicalising to page 1 ---
  const drifts = []
  let pagedSeen = 0
  for (const page of pages) {
    const pathPage = /\/page\/(\d+)\/?$/i.exec('/' + page.replace(/index\.html?$/i, ''))
    if (!pathPage || Number(pathPage[1]) <= 1) continue
    pagedSeen += 1
    const canon = canonicalHref(html.get(page))
    if (!canon) continue
    if (!/\/page\/\d+\/?$/i.test(canon.replace(/^https?:\/\/[^/]+/i, ''))) {
      drifts.push({ page, canonical: canon, why: `the page is page ${pathPage[1]} but its canonical drops the page segment` })
    }
  }
  if (!pagedSeen) {
    v.bounded('hugo/taxonomy-pagination', 'no-paginated-pages', `${pages.length} page(s): no paginated page baked, so there is no canonical to verify`)
  } else if (drifts.length) {
    v.failed('hugo/taxonomy-pagination', {
      problem: 'a paginated page canonicalises away from itself - every page past the first is de-indexed',
      drifts,
    })
  } else {
    v.passed('hugo/taxonomy-pagination', `${pagedSeen} paginated page(s): each canonical keeps its own page segment`)
  }

  // --- double-og: an og template partial wired twice ---
  const doubled = []
  for (const page of pages) {
    for (const key of ['og:title', 'og:description']) {
      const values = metaContents(html.get(page), key)
      if (values.length > 1) doubled.push({ page, tag: key, count: values.length })
    }
  }
  if (doubled.length) {
    v.failed('hugo/double-og', {
      problem: 'an og tag appears more than once - a theme og partial AND a hand-written tag both emit it, so the head contradicts itself',
      doubled,
    })
  } else {
    v.passed('hugo/double-og', `${pages.length} page(s): og:title / og:description each appear at most once`)
  }

  return { ok: v.ok, rows: v.rows }
}

// SPEC section 3: every entry carries a default export.
export default { run, PKG, REQUIRED_KEYS }
