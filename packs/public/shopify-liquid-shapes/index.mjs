// shopify-liquid-shapes - file checks over a Shopify storefront rendered
// through Liquid (the PRD's M2 catalog, the Shopify slice). The Shopify
// shape has tells the generic head module cannot know:
//
//   1. liquid-leak        - a theme or app failed to render, so a Liquid
//      construct survived into the baked HTML: a {% comment %} block, a
//      {% raw %} tag, or an unrendered {{ output }} expression. What the
//      shopper sees is template source. Shopify's Liquid never emits these
//      into final output, so any that appears shipped is a fault.
//   2. app-meta-duplicated - Shopify emits platform meta (og:type,
//      twitter:card, og:image) and an installed app injects a second copy.
//      A crawler takes the first, so the head contradicts itself. Shopify's
//      own values are self-consistent; a duplicate with a DIFFERENT value is
//      the fault (an exact repeat is harmless).
//   3. pagination-canonical - a paginated collection (/collections/x?page=2)
//      whose canonical drops the page param. Shopify's own paginated pages
//      canonicalise to themselves; a theme filter that rewrites the
//      canonical to page 1 de-indexes every page past the first.
//
// Grounded against Shopify's documented Liquid + meta output and the theme
// canonical convention. All pure file reads: attribute regexes over
// committed output. Zero network, zero HTML execution.
//
// THE CONTRACT with the target (moduleCtx['shopifyTree']):
//   root           -> absolute path to the baked Shopify dir, or null (the
//                     pack then dockets one BOUNDED row and audits nothing)
//   exists(rel) / text(rel) / readdir(rel) -> the tree fs helpers
//
// Verdict taxonomy (family): BOUNDED / PASSED / EXPLOITED.

export const PKG = 'packs/public/shopify-liquid-shapes'

export const REQUIRED_KEYS = ['shopifyTree']

const PACK = 'shopify-liquid-shapes'

// A Shopify storefront stamps this; its absence means the tree is not a
// Shopify bake, so the shape checks are not meaningful.
const SHOPIFY_RE = /cdn\.shopify\.com|shopify\.com\/s\/files|Shopify\.theme|myshopify\.com/i

// The platform meta Shopify itself emits on a product/collection page.
const PLATFORM_META = ['og:type', 'twitter:card', 'og:image']

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
// order. Duplicates matter, so this returns a list.
export function metaContents(html, key) {
  const out = []
  const re = new RegExp(`<meta\\s+[^>]*(?:name|property)\\s*=\\s*["']${key}["'][^>]*>`, 'gi')
  let m
  while ((m = re.exec(html))) out.push(/content\s*=\s*["']([^"']*)["']/i.exec(m[0])?.[1] ?? '')
  return out
}

export function canonicalHref(html) {
  const tag = /<link\s+[^>]*rel\s*=\s*["']canonical["'][^>]*>/i.exec(html)?.[0]
  if (!tag) return null
  return /href\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? null
}

// The Liquid constructs that must never survive into baked HTML. A {% comment %}
// block (with its body), a {% raw %} tag, or a {{ ... }} output expression.
const LIQUID_PATTERNS = [
  { re: /\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/i, what: '{% comment %} block' },
  { re: /\{%-?\s*raw\s*-?%\}/i, what: '{% raw %} tag' },
  { re: /\{\{-?[\s\S]*?-?\}\}/, what: '{{ output }} expression' },
]

function normalizeWs(s) {
  return String(s || '').replace(/\s+/g, ' ').trim()
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
  const tree = ctx.shopifyTree

  if (!tree || tree.root == null) {
    v.bounded('shopify/baked-site-absent', 'target-tree-absent', 'no Shopify-baked output armed (set SHOPIFY_SITE) - nothing was audited, nothing was passed')
    return { ok: v.ok, rows: v.rows }
  }

  const pages = walkHtml(tree.readdir, '')
  if (!pages.length) {
    v.bounded('shopify/baked-site-absent', 'output-empty', `no .html under ${tree.root} - bake first; the pack cannot audit what was never built`)
    return { ok: v.ok, rows: v.rows }
  }

  const html = new Map()
  for (const page of pages) html.set(page, tree.text(page) || '')

  const isShopify = pages.some((p) => SHOPIFY_RE.test(html.get(p)))

  // --- liquid-leak: an unrendered Liquid construct survived the bake ---
  const leaks = []
  for (const page of pages) {
    const body = html.get(page)
    for (const { re, what } of LIQUID_PATTERNS) {
      if (re.test(body)) leaks.push({ page, what })
    }
  }
  if (leaks.length) {
    v.failed('shopify/liquid-leak', {
      problem: 'an unrendered Liquid construct shipped into the baked HTML - a theme or app failed to render, so the shopper sees template source',
      leaks,
    })
  } else {
    v.passed('shopify/liquid-leak', `${pages.length} page(s): no {% comment %} / {% raw %} / {{ output }} survived the bake`)
  }

  // --- app-meta-duplicated: platform meta emitted twice with different values ---
  if (!isShopify) {
    v.bounded('shopify/app-meta-duplicated', 'not-a-shopify-bake', `no Shopify marker (cdn.shopify.com / Shopify.theme) in ${pages.length} page(s) - the platform-meta duplication is a Shopify behavior, so this check cannot fire`)
  } else {
    const doubled = []
    for (const page of pages) {
      for (const key of PLATFORM_META) {
        const values = metaContents(html.get(page), key)
        const distinct = [...new Set(values.map(normalizeWs))]
        if (distinct.length > 1) doubled.push({ page, tag: key, values: distinct })
      }
    }
    if (doubled.length) {
      v.failed('shopify/app-meta-duplicated', {
        problem: 'a platform meta ships twice with different values - Shopify emits it and an installed app injects a conflicting copy, so the head contradicts itself',
        doubled,
      })
    } else {
      v.passed('shopify/app-meta-duplicated', `${pages.length} page(s): each platform meta has a single value`)
    }
  }

  // --- pagination-canonical: a paginated page canonicalising away from itself ---
  // Shopify paginates by PATH (/collections/x/page/2) or by QUERY (?page=2).
  // Either form is self-referential; what matters is the canonical keeps the
  // page's OWN identity rather than collapsing to page 1.
  const PAGED_RE = /[?&]page=(\d+)/i
  const drifts = []
  let pagedSeen = 0
  for (const page of pages) {
    const pathPage = /\/page\/(\d+)\/?$/i.exec('/' + page.replace(/index\.html?$/i, ''))
    if (!pathPage || Number(pathPage[1]) <= 1) continue
    pagedSeen += 1
    const canon = canonicalHref(html.get(page))
    if (!canon) continue
    const canonPath = canon.replace(/^https?:\/\/[^/]+/i, '')
    const keepsPath = new RegExp(`/page/${pathPage[1]}/?$`).test(canonPath.split(/[?#]/)[0])
    const keepsParam = Number(PAGED_RE.exec(canon)?.[1]) === Number(pathPage[1])
    if (!keepsPath && !keepsParam) {
      drifts.push({ page, canonical: canon, why: `the page is page ${pathPage[1]} but its canonical drops the page identity (page 1)` })
    }
  }
  if (!pagedSeen) {
    v.bounded('shopify/pagination-canonical', 'no-paginated-pages', `${pages.length} page(s): no paginated collection page baked, so there is no canonical to verify`)
  } else if (drifts.length) {
    v.failed('shopify/pagination-canonical', {
      problem: 'a paginated collection page canonicalises away from itself - every page past the first is de-indexed',
      drifts,
    })
  } else {
    v.passed('shopify/pagination-canonical', `${pagedSeen} paginated page(s): each canonical keeps its own page param`)
  }

  return { ok: v.ok, rows: v.rows }
}

// SPEC section 3: every entry carries a default export.
export default { run, PKG, REQUIRED_KEYS }
