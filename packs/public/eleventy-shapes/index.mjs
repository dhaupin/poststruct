// eleventy-shapes - file checks over a site baked by Eleventy / 11ty (the
// PRD's M2 catalog, the Eleventy slice). The Eleventy shape has tells the
// generic head module cannot know:
//
//   1. pagination-href-missing - an Eleventy paginated page whose
//      permalink/pagination.href mis-resolved: the canonical points at a URL
//      that was never built. Eleventy's own pagination is consistent, so a
//      canonical that 404s means the permalink template and the built tree
//      disagree.
//   2. relative-to-drift       - a canonical built with the relativeTo filter
//      (or url + a base) that resolves against the wrong base, so a sub-path
//      install ships a canonical off the deployed origin. Detected as a
//      canonical whose origin differs from the tree's dominant origin.
//   3. collection-index-dupe   - two baked files claim the same URL (a
//      collection index and a page with the same permalink), so the host
//      serves one and drops the other.
//
// Grounded against Eleventy's documented output (pagination.href, the
// relativeTo/url filters). All pure file reads: attribute regexes over
// committed output. Zero network, zero HTML execution.
//
// THE CONTRACT with the target (moduleCtx['eleventyTree']):
//   root           -> absolute path to the baked _site dir, or null (the
//                     pack then dockets one BOUNDED row)
//   exists(rel) / text(rel) / readdir(rel) -> the tree fs helpers
//
// Verdict taxonomy (family): BOUNDED / PASSED / EXPLOITED.

export const PKG = 'packs/public/eleventy-shapes'

export const REQUIRED_KEYS = ['eleventyTree']

const PACK = 'eleventy-shapes'


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

export function canonicalHref(html) {
  const tag = /<link\s+[^>]*rel\s*=\s*["']canonical["'][^>]*>/i.exec(html)?.[0]
  if (!tag) return null
  return /href\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? null
}

function originOf(url) {
  const m = /^https?:\/\/([^/]+)/i.exec(url || '')
  return m ? m[1].toLowerCase() : null
}

// The tree-relative URL a baked page serves at.
function urlForPage(page) {
  if (page === 'index.html') return '/'
  if (page.endsWith('/index.html')) return '/' + page.slice(0, -'index.html'.length)
  return '/' + page.replace(/\.html?$/i, '')
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
  const tree = ctx.eleventyTree

  if (!tree || tree.root == null) {
    v.bounded('eleventy/baked-site-absent', 'target-tree-absent', 'no Eleventy-baked output armed (set ELEVENTY_SITE) - nothing was audited, nothing was passed')
    return { ok: v.ok, rows: v.rows }
  }

  const pages = walkHtml(tree.readdir, '')
  if (!pages.length) {
    v.bounded('eleventy/baked-site-absent', 'output-empty', `no .html under ${tree.root} - bake first; the pack cannot audit what was never built`)
    return { ok: v.ok, rows: v.rows }
  }

  const html = new Map()
  for (const page of pages) html.set(page, tree.text(page) || '')


  // --- pagination-href-missing: a canonical to a page that was never built ---
  const dangling = []
  for (const page of pages) {
    const canon = canonicalHref(html.get(page))
    if (!canon) continue
    const pathPart = canon.replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0]
    if (!pathPart.startsWith('/')) continue
    const base = pathPart.replace(/^\//, '')
    const candidates = base === '' || base.endsWith('/')
      ? [`${base}index.html`, `${base.replace(/\/$/, '')}.html`]
      : [base, `${base}/index.html`, `${base}.html`]
    if (!candidates.some((c) => c === 'index.html' || tree.exists(c))) {
      dangling.push({ page, canonical: canon })
    }
  }
  if (dangling.length) {
    v.failed('eleventy/pagination-href-missing', {
      problem: 'a canonical points at a page that was never built - an Eleventy permalink/pagination.href mis-resolved, so the canonical 404s',
      dangling,
    })
  } else {
    v.passed('eleventy/pagination-href-missing', `${pages.length} page(s): every canonical resolves to a built page`)
  }

  // --- relative-to-drift: a canonical off the tree's dominant origin ---
  const origins = new Map()
  for (const page of pages) {
    const o = originOf(canonicalHref(html.get(page)) || '')
    if (o) origins.set(o, (origins.get(o) || 0) + 1)
  }
  if (origins.size === 0) {
    v.bounded('eleventy/relative-to-drift', 'no-canonicals', `${pages.length} page(s): no absolute canonical, so origin drift cannot be judged`)
  } else {
    const dominant = [...origins.entries()].sort((a, b) => b[1] - a[1])[0][0]
    const drifts = []
    for (const page of pages) {
      const o = originOf(canonicalHref(html.get(page)) || '')
      if (o && o !== dominant) drifts.push({ page, canonical: canonicalHref(html.get(page)), origin: o, expected: dominant })
    }
    if (drifts.length) {
      v.failed('eleventy/relative-to-drift', {
        problem: 'a canonical resolves to an origin other than the tree\'s dominant origin - a relativeTo/url filter built the URL against the wrong base (sub-path install drift)',
        drifts,
      })
    } else {
      v.passed('eleventy/relative-to-drift', `${pages.length} page(s): every canonical is on the tree origin ${dominant}`)
    }
  }

  // --- collection-index-dupe: two baked files claiming one URL ---
  const byUrl = new Map()
  for (const page of pages) {
    const url = urlForPage(page).replace(/\/$/, '') || '/'
    if (!byUrl.has(url)) byUrl.set(url, [])
    byUrl.get(url).push(page)
  }
  const dupes = [...byUrl.entries()].filter(([, files]) => files.length > 1)
  if (dupes.length) {
    v.failed('eleventy/collection-index-dupe', {
      problem: 'two baked files claim the same URL - a collection index and a page with the same permalink both built, so the host serves one and drops the other',
      dupes: dupes.map(([url, files]) => ({ url, files })),
    })
  } else {
    v.passed('eleventy/collection-index-dupe', `${pages.length} page(s): every baked file claims a distinct URL`)
  }

  return { ok: v.ok, rows: v.rows }
}

// SPEC section 3: every entry carries a default export.
export default { run, PKG, REQUIRED_KEYS }
