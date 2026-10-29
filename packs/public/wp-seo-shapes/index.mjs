// wp-seo-shapes - file checks over a baked WordPress site running a
// Yoast-shaped SEO plugin. The PRD's M1 collision, made checkable:
//
//   1. head-seo-duplicated   - an SEO plugin AND a theme/plugin both emit
//      head SEO. Observed on real WordPress 7.1.4 + Yoast 28.8: a theme
//      hardcoding its own head produces TWO <meta name="description"> with
//      different values ("Theme-hardcoded description." vs the Yoast value),
//      TWO og:title ("Home" vs "Home - Acme WP"), and TWO ld+json graphs
//      (Yoast's yoast-schema-graph plus the theme's Organization). The
//      conflicting pair is the fault: a crawler takes the first and the page
//      then contradicts itself.
//   2. attachment-canonical  - a rendered WordPress attachment page inherits
//      the front page canonical (observed: ?attachment_id=8 canonicalised to
//      the site root) and is left indexable (Yoast's noindex-attachment
//      defaults false). Left alone, every uploaded image becomes an
//      indexable near-duplicate of the home page. Yoast's default
//      disable-attachment=true 301s the page to the file, so the pack first
//      checks whether an attachment page was baked at all.
//   3. archive-canonical-drift - a paginated archive whose canonical points
//      at page 1 rather than itself. Yoast's own canonicals are
//      self-referential (verified), so a drift means a theme/plugin filter
//      overrode them and page 2+ is de-indexed.
//
// Grounded against real output, not the prose: WordPress 7.1.4 + Yoast SEO
// 28.8 was installed on SQLite and its pages baked and inspected, which is
// how each observed value above was captured. All pure file reads: attribute
// regexes over committed output. Zero network, zero HTML execution.
//
// THE CONTRACT with the target (moduleCtx['wpTree']):
//   root           -> absolute path to the baked WordPress dir, or null (the
//                     pack then dockets one BOUNDED row and audits nothing)
//   exists(rel) / text(rel) / readdir(rel) -> the tree fs helpers
//
// Verdict taxonomy (family): BOUNDED / PASSED / EXPLOITED.

export const PKG = 'packs/public/wp-seo-shapes'

export const REQUIRED_KEYS = ['wpTree']

const PACK = 'wp-seo-shapes'

// WordPress stamps the generator meta; it is the cheapest honest signal that
// the tree really is a WordPress bake rather than any old HTML.
const WP_GENERATOR_RE = /<meta\s+name=["']generator["']\s+content=["']WordPress\s+([\d.]+)["']/i

// A Yoast-shaped SEO plugin wraps its schema in a block carrying this class.
// Its presence is what makes the schema-duplication check meaningful: with no
// plugin there is no expected single graph to duplicate.
const YOAST_SCHEMA_RE = /class=["']yoast-schema-graph["']/i

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

// Every content="" of every meta matched by name= or property=, in document
// order. Duplicates matter, so this returns a list, not a first-match.
export function metaContents(html, key) {
  const out = []
  const re = new RegExp(`<meta\\s+[^>]*(?:name|property)\\s*=\\s*["']${key}["'][^>]*>`, 'gi')
  let m
  while ((m = re.exec(html))) {
    out.push(/content\s*=\s*["']([^"']*)["']/i.exec(m[0])?.[1] ?? '')
  }
  return out
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

export function ldJsonBlocks(html) {
  const out = []
  const re = /<script\s+[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m
  while ((m = re.exec(html))) out.push(m[1].trim())
  return out
}

function robotsMeta(html) {
  const tag = /<meta\s+[^>]*name\s*=\s*["']robots["'][^>]*>/i.exec(html)?.[0]
  if (!tag) return null
  return (/content\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? '').toLowerCase()
}

function bodyClass(html) {
  return /<body[^>]*\bclass\s*=\s*["']([^"']*)["']/i.exec(html)?.[1] ?? ''
}

function normalizeWs(s) {
  return String(s || '').replace(/\s+/g, ' ').trim()
}

// A path like /category/news/page/2/ - the paged-archive shape WordPress and
// Yoast both use.
function isPagedPath(rel) {
  return /\/page\/\d+\/?$/i.test('/' + rel.replace(/index\.html?$/i, '')) || /\/page\/\d+\/index\.html?$/i.test(rel)
}

function pageNumber(rel) {
  const m = /\/page\/(\d+)\/?(?:index\.html?)?$/i.exec('/' + rel.replace(/index\.html?$/i, ''))
  return m ? Number(m[1]) : null
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
  const tree = ctx.wpTree

  if (!tree || tree.root == null) {
    v.bounded('wp/baked-site-absent', 'target-tree-absent', 'no WordPress bake armed (set WP_SITE) - nothing was audited, nothing was passed')
    return { ok: v.ok, rows: v.rows }
  }

  const pages = walkHtml(tree.readdir, '')
  if (!pages.length) {
    v.bounded('wp/baked-site-absent', 'output-empty', `no .html under ${tree.root} - bake first; the pack cannot audit what was never built`)
    return { ok: v.ok, rows: v.rows }
  }

  const html = new Map()
  for (const page of pages) html.set(page, tree.text(page) || '')

  const wpPages = pages.filter((p) => WP_GENERATOR_RE.test(html.get(p)))
  if (!wpPages.length) {
    v.bounded('wp/not-a-wordpress-bake', 'generator-meta-absent', `${pages.length} page(s) carry no "WordPress" generator meta - this is not a WordPress bake, so the plugin/theme collision cannot be judged`)
    return { ok: v.ok, rows: v.rows }
  }

  const yoastPages = wpPages.filter((p) => YOAST_SCHEMA_RE.test(html.get(p)))

  // --- head-seo-duplicated: the plugin + theme collision ---
  const duplicated = []
  for (const page of wpPages) {
    const body = html.get(page)
    for (const key of ['description', 'og:title', 'og:description', 'twitter:title']) {
      const vals = metaContents(body, key)
      if (vals.length > 1) {
        const distinct = [...new Set(vals.map(normalizeWs))]
        duplicated.push({
          page, tag: key, count: vals.length,
          conflicting: distinct.length > 1,
          values: distinct.slice(0, 3).map((s) => s.slice(0, 60)),
        })
      }
    }
    const graphs = ldJsonBlocks(body)
    if (graphs.length > 1) {
      duplicated.push({ page, tag: 'ld+json', count: graphs.length, conflicting: true, values: [`${graphs.length} schema blocks`] })
    }
  }
  if (!yoastPages.length) {
    v.bounded('wp/head-seo-duplicated', 'seo-plugin-absent', `${wpPages.length} WordPress page(s) carry no yoast-schema-graph - no SEO plugin output to collide with the theme, so this check cannot fire`)
  } else if (duplicated.length) {
    v.failed('wp/head-seo-duplicated', {
      problem: 'an SEO plugin and a theme/plugin both emitted head SEO - description / og:title / schema ship twice, and where the values differ the page contradicts itself (a crawler takes the first)',
      duplicated,
    })
  } else {
    v.passed('wp/head-seo-duplicated', `${wpPages.length} WordPress page(s): description / og:title / og:description / ld+json each appear at most once`)
  }

  // --- attachment-canonical: a rendered attachment page inherits the root ---
  const attachments = wpPages.filter((p) => /\battachment\b/.test(bodyClass(html.get(p))))
  if (!attachments.length) {
    v.bounded('wp/attachment-canonical', 'no-attachment-page', `no rendered attachment page in ${wpPages.length} WordPress page(s) - Yoast's disable-attachment default 301s them to the file, so there is nothing to audit`)
  } else {
    const faults = []
    for (const page of attachments) {
      const canon = canonicalHref(html.get(page))
      const robots = robotsMeta(html.get(page)) || ''
      const canonPath = canon ? canon.replace(/^https?:\/\/[^/]+/i, '') : null
      // An attachment page canonicalising to the site root is the trap: the
      // attachment is told it is the home page.
      if (canonPath === '/' || canonPath === '') faults.push({ page, why: 'attachment canonical points at the site root, not the attachment itself', canonical: canon })
      else if (robots && !/\bnoindex\b/.test(robots)) faults.push({ page, why: 'attachment page is indexable (robots has no noindex) and was not redirected away', robots })
    }
    if (faults.length) {
      v.failed('wp/attachment-canonical', {
        problem: 'a rendered WordPress attachment page is indexable and/or inherits the front page canonical - every uploaded image becomes an indexable near-duplicate of the home page',
        faults,
      })
    } else {
      v.passed('wp/attachment-canonical', `${attachments.length} attachment page(s): canonical self-referential and/or noindexed`)
    }
  }

  // --- archive-canonical-drift: page N canonicalising to page 1 ---
  const paged = wpPages.filter((p) => pageNumber(p) != null && pageNumber(p) > 1)
  if (!paged.length) {
    v.bounded('wp/archive-canonical-drift', 'no-paged-archive', `no /page/N/ archive in ${wpPages.length} WordPress page(s) - nothing paginated to drift`)
  } else {
    const drift = []
    for (const page of paged) {
      const n = pageNumber(page)
      const canon = canonicalHref(html.get(page))
      if (!canon) { drift.push({ page, why: 'paginated archive has no canonical at all' }); continue }
      const canonPage = pageNumber(canon.replace(/^https?:\/\/[^/]+/i, '').replace(/\/$/, '/'))
      // The canonical must name THIS page. A canonical resolving to page 1
      // (or to no page number) de-indexes the archive.
      if (canonPage == null || canonPage !== n) {
        drift.push({ page, pageNumber: n, canonical: canon, why: canonPage == null ? 'canonical does not name a page number (points at page 1 or the bare archive)' : `canonical names page ${canonPage}, not page ${n}` })
      }
    }
    if (drift.length) {
      v.failed('wp/archive-canonical-drift', {
        problem: 'a paginated archive canonicalises to a different page (usually page 1) - the archive tells crawlers it is a duplicate and its page 2+ is de-indexed',
        drift,
      })
    } else {
      v.passed('wp/archive-canonical-drift', `${paged.length} paginated archive page(s): every canonical names its own page number`)
    }
  }

  return { ok: v.ok, rows: v.rows }
}

// SPEC section 3: every entry carries a default export.
export default { run, PKG, REQUIRED_KEYS }
