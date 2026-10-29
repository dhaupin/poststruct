// freestruct-shapes - file checks over a docs site baked by the freestruct
// post-render SEO layer. The check ids come from freestruct's shipped engine
// contract (engine/inject.js, engine/notfound.js, engine/scan.js): one
// buildHash stamped on every page AND on every cache-bust param, the
// missing-only gate that must not double-inject on a cache-hit rebuild, the
// absolute-canonical contract that keeps sub-path (basePath) installs honest,
// and the 404 pipeline contract (#11: a user 404 gets the full pass). All
// pure file reads: attribute regexes over committed output. Zero network,
// zero HTML execution.
//
// Grounded against real freestruct 1.1.0 output, not the README: the docs
// tree was baked and inspected, which is how the ?v= <-> build-hash coupling
// and the missing-only idempotency were learned rather than guessed.
//
// THE CONTRACT with the target (moduleCtx['freestructTree']):
//   root           -> absolute path to the baked output dir, or null (the
//                     pack then dockets one BOUNDED row and audits nothing)
//   exists(rel) / text(rel) / readdir(rel) -> the tree fs helpers
//
// Verdict taxonomy (family): BOUNDED / PASSED / EXPLOITED.

export const PKG = 'packs/public/freestruct-shapes'

export const REQUIRED_KEYS = ['freestructTree']

const PACK = 'freestruct-shapes'

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

// The origin (scheme://host) of an absolute URL, or null when it is not one.
export function originOf(url) {
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
  const tree = ctx.freestructTree

  if (!tree || tree.root == null) {
    v.bounded('freestruct/baked-site-absent', 'target-tree-absent', 'no freestruct-baked output armed (set FREESTRUCT_SITE) - nothing was audited, nothing was passed')
    return { ok: v.ok, rows: v.rows }
  }

  const pages = walkHtml(tree.readdir, '')
  if (!pages.length) {
    v.bounded('freestruct/baked-site-absent', 'output-empty', `no .html under ${tree.root} - bake first; the pack cannot audit what was never built`)
    return { ok: v.ok, rows: v.rows }
  }

  const html = new Map()
  for (const page of pages) html.set(page, tree.text(page) || '')

  // --- one buildHash across every page (and the tree must be freestruct's) ---
  const buildIds = new Map()
  for (const page of pages) {
    const id = metaContent(html.get(page), 'freestruct-build')
    if (id != null) buildIds.set(page, id)
  }
  let buildHash = null
  if (!buildIds.size) {
    v.bounded('freestruct/build-drift', 'freestruct-build-absent', `no <meta name="freestruct-build"> on any of ${pages.length} page(s) - this tree carries no freestruct stamp (not a freestruct bake, or an engine that predates the stamp)`)
  } else {
    const distinct = new Set(buildIds.values())
    buildHash = [...distinct][0]
    if (distinct.size > 1) {
      v.failed('freestruct/build-drift', {
        problem: 'pages carry different freestruct-build ids - a partial bake left stale pages in the output',
        ids: [...distinct].sort(),
      })
    } else if (buildIds.size < pages.length) {
      const unstamped = pages.filter((p) => !buildIds.has(p))
      v.failed('freestruct/build-drift', {
        problem: `freestruct-build "${buildHash}" covers ${buildIds.size} of ${pages.length} page(s) - an unstamped page missed the post-render pass`,
        pages: unstamped,
      })
    } else {
      v.passed('freestruct/build-drift', `freestruct-build "${buildHash}" covers all ${pages.length} page(s) - one build`)
    }
  }

  // --- cache-busting: every ?v= param equals the build hash ---
  if (buildHash == null) {
    v.bounded('freestruct/cache-bust-drift', 'build-hash-absent', 'no build hash to compare cache-bust params against')
  } else {
    const faults = []
    let seen = 0
    for (const page of pages) {
      const params = new Set((html.get(page).match(/\?v=([A-Za-z0-9_-]+)/g) || []).map((s) => s.slice(3)))
      for (const p of params) {
        seen += 1
        if (p !== buildHash) faults.push({ page, param: p })
      }
    }
    if (faults.length) {
      v.failed('freestruct/cache-bust-drift', {
        problem: `a cache-bust param does not match the build hash "${buildHash}" - an asset reference was left from another build`,
        faults,
      })
    } else if (!seen) {
      v.bounded('freestruct/cache-bust-drift', 'no-cache-bust-params', 'no ?v= params in the output - cache-busting is off or this engine does not stamp asset refs')
    } else {
      v.passed('freestruct/cache-bust-drift', `${seen} cache-bust param(s) all equal the build hash "${buildHash}"`)
    }
  }

  // --- the missing-only gate: no page carries a doubled head tag ---
  const DOUBLED = ['description', 'og:title', 'og:image', 'twitter:card', 'og:url']
  const doubled = []
  for (const page of pages) {
    for (const key of DOUBLED) {
      const n = metaCount(html.get(page), key)
      if (n > 1) doubled.push({ page, key, count: n })
    }
  }
  if (doubled.length) {
    v.failed('freestruct/injection-duplicated', {
      problem: 'a head tag appears more than once on a page - the missing-only gate did not hold (a cache-hit rebuild re-injected, or the page already carried its own)',
      doubled,
    })
  } else {
    v.passed('freestruct/injection-duplicated', `${pages.length} page(s): no doubled description/og/twitter tags`)
  }

  // --- canonical is absolute and one origin across the tree (basePath) ---
  const canonFaults = []
  const origins = new Set()
  let canonSeen = 0
  for (const page of pages) {
    const canon = canonicalHref(html.get(page))
    if (canon == null) continue
    canonSeen += 1
    const origin = originOf(canon)
    if (origin == null) canonFaults.push({ page, canonical: canon, why: 'not an absolute URL' })
    else origins.add(origin)
  }
  if (canonFaults.length) {
    v.failed('freestruct/canonical-absolute', {
      problem: 'a canonical is not an absolute URL - on a sub-path (basePath) install a root-relative canonical points at the wrong site',
      faults: canonFaults,
    })
  } else if (origins.size > 1) {
    v.failed('freestruct/canonical-absolute', {
      problem: 'canonicals resolve to more than one origin - the deployed base is inconsistent across pages',
      origins: [...origins].sort(),
    })
  } else if (!canonSeen) {
    v.bounded('freestruct/canonical-absolute', 'canonical-absent', 'no page carries rel=canonical - the basePath claim is unverifiable')
  } else {
    v.passed('freestruct/canonical-absolute', `${canonSeen} canonical(s), all absolute on origin ${[...origins][0]}`)
  }

  // --- the 404 pipeline contract (#11): the 404 got the full pass ---
  const notFound = pages.find((p) => /(^|\/)404\.html?$/i.test(p))
  if (!notFound) {
    v.bounded('freestruct/404-contract', '404-absent', 'no 404.html in the output - the engine generates one only when the tree lacks a user 404')
  } else {
    const body = html.get(notFound)
    const robots = metaContent(body, 'robots') || ''
    const hasNoindex = /noindex/i.test(robots)
    const gotPipeline = metaContent(body, 'description') != null && metaContent(body, 'og:url') != null
    if (!hasNoindex) {
      v.failed('freestruct/404-contract', { problem: `${notFound} is missing the noindex robots contract - a 404 that invites indexing`, robots })
    } else if (!gotPipeline) {
      v.failed('freestruct/404-contract', { problem: `${notFound} carries noindex but did not get the full post-render pass (no description/og:url) - the #11 contract did not hold`, page: notFound })
    } else {
      v.passed('freestruct/404-contract', `${notFound}: noindex + full pipeline (description, og:url)`)
    }
  }

  return { ok: v.ok, rows: v.rows }
}

// SPEC section 3: every entry carries a default export.
export default { run, PKG, REQUIRED_KEYS }
