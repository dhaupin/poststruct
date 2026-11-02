// wp-static - file checks over a baked WordPress static export (the first
// WordPress-CONSUMER wiring of poststruct; refiled from gistory#26). Where
// wp-seo-shapes audits a LIVE-install bake for the SEO-plugin/theme
// collision, wp-static audits what a static EXPORT (WP2Static / Simply
// Static class) must have done to the theme's head before it is web-facing.
// A naive head-copy carries the live install's promises into a tree that
// keeps none of them:
//
//   1. wp-404-noindex-only  - 404.html inherits the THEME head, so it ships
//      the front page's og:/twitter:/canonical alongside (or instead of) the
//      noindex the site module already pins. Those reads are noise on a 404
//      and most scrapers discard them; the pack tightens the same file: the
//      404 must carry noindex AND carry no og:/twitter:/canonical.
//   2. wp-feed-alternate-resolve - every `<link rel="alternate"
//      type="application/(rss|atom)+xml">` in a baked page must resolve to a
//      real file in the export (WP bakes /feed/ as rss2 + /feed/atom/, and a
//      page-level alternate that dangles is a 404 the export promised).
//   3. wp-rest-discovery-stripped - `<link rel="https://api.w.org/">`, RSD
//      (application/rsd+xml), and wlwmanifest point at the live install's
//      REST/XML-RPC. A baked tree promises nothing about those endpoints, so
//      they must be ABSENT. WP2Static strips them; a naive head-copy leaves
//      them armed.
//   4. wp-generator-tag-honest - the generator tag is either absent or
//      exactly `WordPress <core-version>`. A plugin-stamped generator (a
//      second generator meta, or a non-WordPress value) is the fault.
//   5. wp-pagination-self-canonical - each exported /page/N/ must carry a
//      SELF canonical and an absolute URL. The exporter class that rewrites
//      every canonical to the site root de-indexes its own page 2+.
//   6. wp-emoji-hygiene - no wp-emoji-release script and no duplicated emoji
//      JS src (the export strips wp_head's inline smiliey rig), and the
//      `<html lang=...>` value survives the bake.
//
// Grounded against WordPress export output, not the prose: WordPress 7.1.4
// core head shape (the generator meta, the emoji loader, the REST/RSD/
// wlwmanifest discovery links, /feed/ alternates) and the WP2Static/Simply
// Static export behavior. All pure file reads: attribute regexes over
// committed output. Zero network, zero HTML execution.
//
// THE CONTRACT with the target (moduleCtx['wpStaticTree']):
//   root           -> absolute path to the baked WordPress export dir, or
//                     null (the pack then dockets one BOUNDED row and audits
//                     nothing)
//   exists(rel) / text(rel) / readdir(rel) -> the tree fs helpers
//
// Verdict taxonomy (family): BOUNDED / PASSED / EXPLOITED.

export const PKG = 'packs/public/wp-static'

export const REQUIRED_KEYS = ['wpStaticTree']

const PACK = 'wp-static'

// WordPress stamps the generator meta; it is the cheapest honest signal that
// the tree really is a WordPress bake rather than any old HTML.
const WP_GENERATOR_RE = /<meta\s+name=["']generator["']\s+content=["']WordPress\s+([\d.]+)["']/i
// Any generator meta at all, WordPress or not - a second one is the
// plugin-stamp fault.
const ANY_GENERATOR_RE = /<meta\s+name=["']generator["'][^>]*>/gi
// The live install's discovery links. A baked tree promises nothing about
// the REST/XML-RPC endpoints they name.
const REST_DISCOVERY = [
  ['wp-json discovery', /<link\s+[^>]*rel=["']https:\/\/api\.w\.org\/["']/i],
  ['RSD (EditURI)', /<link\s+[^>]*rel=["']EditURI["'][^>]*type=["']application\/rsd\+xml["']/i],
  ['wlwmanifest', /<link\s+[^>]*rel=["']wlwmanifest["']/i],
]
// The emoji loader core injects through wp_head (the inline smiliey rig).
const EMOJI_SCRIPT_RE = /<script[^>]*wp-emoji-release[^>]*>/i

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

function headOf(html) {
  const m = /<head[^>]*>([\s\S]*?)<\/head>/i.exec(html)
  return m ? m[1] : html
}

export function canonicalHrefs(html) {
  const out = []
  const re = /<link\s+[^>]*rel\s*=\s*["']canonical["'][^>]*>/gi
  let m
  while ((m = re.exec(html))) out.push(/href\s*=\s*["']([^"']*)["']/i.exec(m[0])?.[1] ?? '')
  return out
}

export function canonicalHref(html) {
  return canonicalHrefs(html)[0] ?? null
}

// Every `<link rel="alternate" type="application/(rss|atom)+xml" href="...">`.
export function feedAlternates(html) {
  const out = []
  const re = /<link\s+[^>]*rel\s*=\s*["']alternate["'][^>]*>/gi
  let m
  while ((m = re.exec(html))) {
    const tag = m[0]
    if (!/type\s*=\s*["']application\/(?:rss|atom)\+xml["']/i.test(tag)) continue
    out.push(/href\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? '')
  }
  return out
}

function robotsMeta(html) {
  const tag = /<meta\s+[^>]*name\s*=\s*["']robots["'][^>]*>/i.exec(html)?.[0]
  if (!tag) return null
  return (/content\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? '').toLowerCase()
}

function htmlLang(html) {
  return /<html[^>]*\blang\s*=\s*["']([^"']*)["']/i.exec(html)?.[1] ?? ''
}

function normalizeWs(s) {
  return String(s || '').replace(/\s+/g, ' ').trim()
}

function pageNumber(rel) {
  const m = /\/page\/(\d+)\/?(?:index\.html?)?$/i.exec('/' + rel.replace(/index\.html?$/i, ''))
  return m ? Number(m[1]) : null
}

// Map a same-origin or relative href to a tree-relative candidate path.
// Absolute hrefs to another origin return null (not this export's promise).
function relFromHref(href, siteOrigin) {
  if (!href) return null
  let path = href
  if (/^https?:\/\//i.test(href)) {
    let origin
    try { origin = new URL(href).origin } catch { return null }
    if (siteOrigin && origin !== siteOrigin) return null
    try { path = new URL(href).pathname } catch { return null }
  } else if (href.startsWith('//')) {
    return null
  }
  path = path.split(/[?#]/)[0]
  if (!path.startsWith('/')) return null
  return path.replace(/^\//, '')
}

// The candidates a URL path could map to in a static export.
function candidateFiles(path) {
  if (!path) return []
  if (path.endsWith('/')) return [`${path}index.html`]
  if (/\.[a-z0-9]+$/i.test(path)) return [path]
  return [path, `${path}/index.html`, `${path}.html`]
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
  const tree = ctx.wpStaticTree

  if (!tree || tree.root == null) {
    v.bounded('wp-static-baked-site-absent', 'target-tree-absent', 'no WordPress export armed (set WP_STATIC_SITE) - nothing was audited, nothing was passed')
    return { ok: v.ok, rows: v.rows }
  }

  const pages = walkHtml(tree.readdir, '')
  if (!pages.length) {
    v.bounded('wp-static-baked-site-absent', 'output-empty', `no .html under ${tree.root} - export first; the pack cannot audit what was never built`)
    return { ok: v.ok, rows: v.rows }
  }

  const html = new Map()
  for (const page of pages) html.set(page, tree.text(page) || '')

  // The site origin, derived from the root index canonical - the export's
  // one absolute truth. Absent -> cross-origin alternates are simply skipped.
  const rootHtml = html.get('index.html') ?? ''
  const rootCanon = canonicalHref(rootHtml) || ''
  let siteOrigin = ''
  try { siteOrigin = rootCanon ? new URL(rootCanon).origin : '' } catch { siteOrigin = '' }

  const wpPages = pages.filter((p) => WP_GENERATOR_RE.test(html.get(p)))
  if (!wpPages.length) {
    v.bounded('wp-static-not-a-wordpress-export', 'generator-meta-absent', `${pages.length} page(s) carry no "WordPress" generator meta - this is not a WordPress export, so the export-hygiene contract cannot be judged`)
    return { ok: v.ok, rows: v.rows }
  }

  // --- wp-404-noindex-only ---
  const notFound = pages.find((p) => /(^|\/)404\.html?$/i.test(p))
  if (!notFound) {
    v.bounded('wp-404-noindex-only', 'no-404-baked', `${wpPages.length} WordPress page(s), no 404.html - the theme head's 404 inheritance cannot be judged without the file`)
  } else {
    const head = headOf(html.get(notFound))
    const robots = robotsMeta(head)
    const faults = []
    if (!robots || !/\bnoindex\b/.test(robots)) faults.push('missing noindex robots directive')
    if (/<link\s+[^>]*rel\s*=\s*["']canonical["']/i.test(head)) faults.push('carries a rel=canonical')
    if (/<meta\s+[^>]*(?:property|name)\s*=\s*["'](?:og:|twitter:)[^"']*["']/i.test(head)) faults.push('carries og:/twitter: social reads')
    if (faults.length) {
      v.failed('wp-404-noindex-only', {
        problem: '404.html inherited the theme head - it carries social/canonical reads and/or is missing its noindex; a 404 is not an indexable page and those reads are noise most scrapers discard',
        page: notFound, robots: robots || null, faults,
      })
    } else {
      v.passed('wp-404-noindex-only', '404.html carries noindex and no og:/twitter:/canonical reads')
    }
  }

  // --- wp-feed-alternate-resolve ---
  const alternates = []
  for (const page of pages) {
    for (const href of feedAlternates(html.get(page))) alternates.push({ page, href })
  }
  if (!alternates.length) {
    v.bounded('wp-feed-alternate-resolve', 'no-feed-alternates', `${pages.length} page(s) declare no rss/atom alternate - nothing to resolve`)
  } else {
    const dangling = []
    for (const { page, href } of alternates) {
      const rel = relFromHref(href, siteOrigin)
      if (rel == null) continue // cross-origin or shapeless: not this export's promise
      const candidates = candidateFiles(rel)
      if (!candidates.some((c) => tree.exists(c))) dangling.push({ page, href, tried: candidates })
    }
    if (dangling.length) {
      v.failed('wp-feed-alternate-resolve', {
        problem: 'a baked page declares an rss/atom alternate that resolves to no file in the export - the export promised a feed it did not ship, so the alternate 404s',
        dangling,
      })
    } else {
      v.passed('wp-feed-alternate-resolve', `${alternates.length} feed alternate(s): every same-origin target resolves to a real file`)
    }
  }

  // --- wp-rest-discovery-stripped ---
  const armed = []
  for (const page of pages) {
    const head = headOf(html.get(page))
    for (const [label, re] of REST_DISCOVERY) {
      const m = re.exec(head)
      if (m) armed.push({ page, link: label, tag: normalizeWs(m[0]).slice(0, 120) })
    }
  }
  if (armed.length) {
    v.failed('wp-rest-discovery-stripped', {
      problem: 'a baked page still carries the live install\'s REST/XML-RPC discovery links (wp-json / RSD / wlwmanifest) - a static tree promises nothing about those endpoints, so they must be stripped at export',
      armed,
    })
  } else {
    v.passed('wp-rest-discovery-stripped', `${pages.length} page(s): no wp-json / RSD / wlwmanifest discovery link survives the export`)
  }

  // --- wp-generator-tag-honest ---
  const generatorFaults = []
  for (const page of wpPages) {
    const head = headOf(html.get(page))
    const all = head.match(ANY_GENERATOR_RE) || []
    if (all.length > 1) {
      generatorFaults.push({ page, why: `${all.length} generator metas - a plugin stamped its own alongside core's`, tags: all.map((t) => normalizeWs(t).slice(0, 100)) })
      continue
    }
    if (all.length === 1) {
      const content = (/content\s*=\s*["']([^"']*)["']/i.exec(all[0])?.[1] ?? '').trim()
      if (!/^WordPress\s+\d+(?:\.\d+)*$/.test(content)) {
        generatorFaults.push({ page, why: `generator is "${content}" - neither absent nor exactly "WordPress <core-version>"`, tags: [normalizeWs(all[0]).slice(0, 100)] })
      }
    }
  }
  if (generatorFaults.length) {
    v.failed('wp-generator-tag-honest', {
      problem: 'a generator tag is plugin-stamped (a second generator meta, or a non-core value) - the export advertises a plugin fingerprint core did not emit',
      faults: generatorFaults,
    })
  } else {
    v.passed('wp-generator-tag-honest', `${wpPages.length} WordPress page(s): the generator tag is absent or exactly "WordPress <core-version>"`)
  }

  // --- wp-pagination-self-canonical ---
  const paged = wpPages.filter((p) => pageNumber(p) != null && pageNumber(p) > 1)
  if (!paged.length) {
    v.bounded('wp-pagination-self-canonical', 'no-paged-archive', `no /page/N/ archive in ${wpPages.length} WordPress page(s) - nothing paginated to self-canonicalise`)
  } else {
    const drift = []
    for (const page of paged) {
      const n = pageNumber(page)
      const canon = canonicalHref(html.get(page))
      if (!canon) { drift.push({ page, why: 'paginated archive has no canonical at all' }); continue }
      if (!/^https?:\/\//i.test(canon)) { drift.push({ page, pageNumber: n, canonical: canon, why: 'canonical is not an absolute URL' }); continue }
      const canonPage = pageNumber(canon.replace(/^https?:\/\/[^/]+/i, '').replace(/\/$/, '/'))
      if (canonPage == null || canonPage !== n) {
        drift.push({ page, pageNumber: n, canonical: canon, why: canonPage == null ? 'canonical does not name a page number (rewritten to the site root or the bare archive)' : `canonical names page ${canonPage}, not page ${n}` })
      }
    }
    if (drift.length) {
      v.failed('wp-pagination-self-canonical', {
        problem: 'a paginated archive does not self-canonicalise - the export rewrote its canonical to the site root (or another page), so page 2+ de-indexes itself',
        drift,
      })
    } else {
      v.passed('wp-pagination-self-canonical', `${paged.length} paginated archive page(s): every canonical is absolute and names its own page number`)
    }
  }

  // --- wp-emoji-hygiene ---
  const emojiFaults = []
  for (const page of pages) {
    const body = html.get(page)
    if (EMOJI_SCRIPT_RE.test(body)) {
      emojiFaults.push({ page, why: 'a wp-emoji-release script survives the export (the smiliey rig should be stripped at bake)' })
    }
    const srcs = []
    const re = /<script[^>]*src=["']([^"']*wp-emoji[^"']*)["'][^>]*>/gi
    let m
    while ((m = re.exec(body))) srcs.push(m[1])
    if (srcs.length > 1) {
      const distinct = [...new Set(srcs)]
      emojiFaults.push({ page, why: `the emoji JS src appears ${srcs.length} times (${distinct.length} distinct)`, srcs: distinct.slice(0, 3) })
    }
    if (!htmlLang(body).trim()) emojiFaults.push({ page, why: 'the <html lang> value did not survive the bake (absent or empty)' })
  }
  if (emojiFaults.length) {
    v.failed('wp-emoji-hygiene', {
      problem: 'the export left head hygiene undone - a wp-emoji-release script and/or a duplicated emoji JS src survives, and/or the <html lang> value was lost',
      faults: emojiFaults,
    })
  } else {
    v.passed('wp-emoji-hygiene', `${pages.length} page(s): no emoji script survives, no duplicated emoji src, and <html lang> is present`)
  }

  return { ok: v.ok, rows: v.rows }
}

// SPEC section 3: every entry carries a default export.
export default { run, PKG, REQUIRED_KEYS }
