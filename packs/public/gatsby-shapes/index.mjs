// gatsby-shapes - file checks over a site baked by Gatsby (the PRD's M2
// catalog, the Gatsby slice). The Gatsby shape has tells the generic head
// module cannot know:
//
//   1. data-uri-og         - gatsby-image / gatsby-plugin-image emits a
//      base64 data-URI placeholder for progressive loading. A template that
//      wires that placeholder into og:image ships a social card no scraper
//      can fetch (and most reject data: URIs outright). Gatsby's own SEO
//      components never do this, so a data: og:image is a template fault.
//   2. noindex-leftover    - a page cloned from a template keeps its
//      <meta name="robots" content="noindex">. Gatsby ships no noindex by
//      default, so a noindex on a page that is in the sitemap is a leftover
//      that silently de-indexes a real page.
//   3. sitemap-dupe        - the gatsby-plugin-sitemap set carries the same
//      <loc> twice (a page created by two sources). Crawlers read the
//      duplicate as a canonical conflict. Gatsby's own plugin de-dupes, so a
//      dupe means a custom sitemap or a plugin misconfiguration.
//
// Grounded against Gatsby's documented output (gatsby-plugin-image data-URI
// placeholders, gatsby-plugin-sitemap). All pure file reads: attribute
// regexes over committed output. Zero network, zero HTML execution.
//
// THE CONTRACT with the target (moduleCtx['gatsbyTree']):
//   root           -> absolute path to the baked Gatsby public/ dir, or null
//                     (the pack then dockets one BOUNDED row)
//   exists(rel) / text(rel) / readdir(rel) -> the tree fs helpers
//
// Verdict taxonomy (family): BOUNDED / PASSED / EXPLOITED.

export const PKG = 'packs/public/gatsby-shapes'

export const REQUIRED_KEYS = ['gatsbyTree']

const PACK = 'gatsby-shapes'

// Gatsby stamps this into every page (the generated div id and the
// window.___gatsby runtime). Its absence means the tree is not a Gatsby bake.
const GATSBY_RE = /id=["']___gatsby["']|window\.___gatsby|gatsby-focus-wrapper/i

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

export function canonicalHref(html) {
  const tag = /<link\s+[^>]*rel\s*=\s*["']canonical["'][^>]*>/i.exec(html)?.[0]
  if (!tag) return null
  return /href\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? null
}

function robotsMeta(html) {
  return (metaContent(html, 'robots') || '').toLowerCase()
}

// Every <loc> in a sitemap document, in document order.
export function sitemapLocs(xml) {
  const out = []
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi
  let m
  while ((m = re.exec(xml))) out.push(m[1])
  return out
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
  const tree = ctx.gatsbyTree

  if (!tree || tree.root == null) {
    v.bounded('gatsby/baked-site-absent', 'target-tree-absent', 'no Gatsby-baked output armed (set GATSBY_SITE) - nothing was audited, nothing was passed')
    return { ok: v.ok, rows: v.rows }
  }

  const pages = walkHtml(tree.readdir, '')
  if (!pages.length) {
    v.bounded('gatsby/baked-site-absent', 'output-empty', `no .html under ${tree.root} - bake first; the pack cannot audit what was never built`)
    return { ok: v.ok, rows: v.rows }
  }

  const html = new Map()
  for (const page of pages) html.set(page, tree.text(page) || '')


  // --- data-uri-og: og:image / twitter:image is a base64 placeholder ---
  const dataUri = []
  for (const page of pages) {
    for (const key of ['og:image', 'twitter:image']) {
      const val = metaContent(html.get(page), key)
      if (val && /^data:/i.test(val.trim())) dataUri.push({ page, tag: key, prefix: val.slice(0, 32) + '...' })
    }
  }
  if (dataUri.length) {
    v.failed('gatsby/data-uri-og', {
      problem: 'og:image / twitter:image is a base64 data: URI - a gatsby-plugin-image placeholder was wired into the social card, which no scraper can fetch',
      hits: dataUri,
    })
  } else {
    v.passed('gatsby/data-uri-og', `${pages.length} page(s): no data: URI in og:image / twitter:image`)
  }

  // --- noindex-leftover: a page in the sitemap that carries robots noindex ---
  const sitemapXml = tree.text('sitemap.xml') || tree.text('sitemap-index.xml') || ''
  const locs = sitemapLocs(sitemapXml)
  if (!locs.length) {
    v.bounded('gatsby/noindex-leftover', 'no-sitemap', 'no sitemap.xml with <loc> entries in the tree - the sitemap is what makes a noindex a contradiction, so this check cannot fire')
  } else {
    const sitemapPaths = new Set(locs.map((u) => u.replace(/^https?:\/\/[^/]+/i, '').replace(/\/$/, '') || '/'))
    const leftovers = []
    for (const page of pages) {
      const robots = robotsMeta(html.get(page))
      if (!robots.includes('noindex')) continue
      const canon = canonicalHref(html.get(page))
      const path = (canon ? canon.replace(/^https?:\/\/[^/]+/i, '') : '/' + page.replace(/index\.html?$/i, '')).replace(/\/$/, '') || '/'
      if (sitemapPaths.has(path)) leftovers.push({ page, robots })
    }
    if (leftovers.length) {
      v.failed('gatsby/noindex-leftover', {
        problem: 'a page listed in the sitemap carries robots noindex - a template leftover silently de-indexes a real page',
        leftovers,
      })
    } else {
      v.passed('gatsby/noindex-leftover', `${pages.length} page(s): no sitemap-listed page carries robots noindex`)
    }
  }

  // --- sitemap-dupe: the same <loc> appears more than once ---
  if (!locs.length) {
    v.bounded('gatsby/sitemap-dupe', 'no-sitemap', 'no sitemap.xml with <loc> entries in the tree - nothing to check for duplicates')
  } else {
    const seen = new Map()
    const dupes = []
    for (const loc of locs) {
      const key = loc.replace(/\/$/, '')
      if (seen.has(key)) dupes.push({ loc })
      seen.set(key, true)
    }
    if (dupes.length) {
      v.failed('gatsby/sitemap-dupe', {
        problem: 'the same URL appears more than once in the sitemap - a page created by two sources, which crawlers read as a canonical conflict',
        dupes,
      })
    } else {
      v.passed('gatsby/sitemap-dupe', `${locs.length} sitemap loc(s): no duplicates`)
    }
  }

  return { ok: v.ok, rows: v.rows }
}

// SPEC section 3: every entry carries a default export.
export default { run, PKG, REQUIRED_KEYS }
