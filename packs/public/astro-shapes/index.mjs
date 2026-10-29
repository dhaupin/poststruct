// astro-shapes - file checks over a site baked by Astro (the PRD's M2
// catalog, the astro slice). Astro's build shape has tells the generic head
// module cannot know:
//
//   1. island-in-head      - Astro hydrates islands with <astro-island>
//      custom elements and module scripts. Islands belong in the body; one
//      that lands in <head> (a framework layout that renders a component
//      inside <head>, or a view-transition head artifact) blocks first
//      render. Astro emits no <astro-island> in head itself, so any that
//      appears there is a placement fault.
//   2. trailing-slash-drift - build.format='file' emits about.html (URL
//      /about) while build.format='directory' emits about/index.html (URL
//      /about/). A canonical or internal href written for the OTHER shape
//      points at a URL the host does not serve - the classic Astro 404 that
//      passes every "does the file exist" check because the file DOES exist
//      under the other name. The pack detects the tree's own shape and flags
//      a canonical that disagrees with it.
//   3. static-path-missing - a dynamic route [slug].astro whose param was
//      never returned from getStaticPaths: the page is not built, so a link
//      to it silently 404s. Detected as a same-origin href whose target is
//      neither built nor one of the shape's own rewrite rules.
//
// Grounded against Astro's documented output shape (build.format, the
// astro-island element, getStaticPaths). All pure file reads: attribute
// regexes over committed output. Zero network, zero HTML execution.
//
// THE CONTRACT with the target (moduleCtx['astroTree']):
//   root           -> absolute path to the baked Astro dir, or null (the
//                     pack then dockets one BOUNDED row and audits nothing)
//   exists(rel) / text(rel) / readdir(rel) -> the tree fs helpers
//
// Verdict taxonomy (family): BOUNDED / PASSED / EXPLOITED.

export const PKG = 'packs/public/astro-shapes'

export const REQUIRED_KEYS = ['astroTree']

const PACK = 'astro-shapes'

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

// The <head>...</head> slice of a page, or null when it has no head.
export function headOf(html) {
  const m = /<head[^>]*>([\s\S]*?)<\/head>/i.exec(html)
  return m ? m[1] : null
}

// Every canonical href on the page, in document order.
export function canonicalHrefs(html) {
  const out = []
  const re = /<link\s+[^>]*rel\s*=\s*["']canonical["'][^>]*>/gi
  let m
  while ((m = re.exec(html))) out.push(/href\s*=\s*["']([^"']*)["']/i.exec(m[0])?.[1] ?? '')
  return out
}

// Same-origin (or relative) internal hrefs on the page. External and
// non-page schemes are out of scope, the same way they are for the links
// module.
export function internalHrefs(html) {
  const out = []
  const re = /<a\s+[^>]*href\s*=\s*["']([^"']*)["'][^>]*>/gi
  let m
  while ((m = re.exec(html))) {
    const href = m[1]
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#|mailto:|tel:)/i.test(href)) continue
    out.push(href)
  }
  return out
}

function originOf(url) {
  const m = /^https?:\/\/([^/]+)/i.exec(url || '')
  return m ? m[1].toLowerCase() : null
}

// Normalize an href/canonical to a tree-relative candidate path list, given
// the build shape. In 'file' shape /about -> about.html; in 'directory'
// shape /about -> about/index.html. A path with a trailing slash is always
// directory-shaped.
export function candidatesFor(pathPart, shape) {
  const clean = pathPart.split(/[?#]/)[0]
  if (!clean.startsWith('/')) return []
  if (clean.endsWith('/')) {
    const base = clean.replace(/^\//, '')
    return base ? [`${base}index.html`, `${base.replace(/\/$/, '')}.html`] : ['index.html']
  }
  const base = clean.replace(/^\//, '')
  if (shape === 'file') return [base, `${base}/index.html`, `${base}.html`]
  return [`${base}/index.html`, `${base}.html`, base]
}

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
  const tree = ctx.astroTree

  if (!tree || tree.root == null) {
    v.bounded('astro/baked-site-absent', 'target-tree-absent', 'no Astro-baked output armed (set ASTRO_SITE) - nothing was audited, nothing was passed')
    return { ok: v.ok, rows: v.rows }
  }

  const pages = walkHtml(tree.readdir, '')
  if (!pages.length) {
    v.bounded('astro/baked-site-absent', 'output-empty', `no .html under ${tree.root} - bake first; the pack cannot audit what was never built`)
    return { ok: v.ok, rows: v.rows }
  }

  const html = new Map()
  for (const page of pages) html.set(page, tree.text(page) || '')

  // --- island-in-head: a hydration artifact inside <head> ---
  const headHits = []
  for (const page of pages) {
    const head = headOf(html.get(page))
    if (!head) continue
    if (/<astro-island\b/i.test(head)) headHits.push({ page, what: '<astro-island> element' })
    else if (/<script\b[^>]*type\s*=\s*["']module["']/i.test(head)) headHits.push({ page, what: 'module script' })
  }
  if (headHits.length) {
    v.failed('astro/island-in-head', {
      problem: 'a hydration artifact (astro-island / module script) is inside <head> - islands belong in the body, where they do not block first render',
      hits: headHits,
    })
  } else {
    v.passed('astro/island-in-head', `${pages.length} page(s): no island or hydration module script in any head`)
  }

  // --- trailing-slash-drift: the tree has a shape; a canonical must agree ---
  // Infer the shape: a top-level about/index.html implies directory shape;
  // about.html implies file shape. Mixed trees are ambiguous -> BOUNDED.
  const topLevel = pages.filter((p) => !p.includes('/'))
  const hasIndexStyle = pages.some((p) => p.endsWith('/index.html'))
  const hasFileStyle = topLevel.some((p) => p.endsWith('.html') && p !== 'index.html')
  const shape = hasIndexStyle && hasFileStyle ? 'mixed' : hasFileStyle ? 'file' : 'directory'
  if (shape === 'mixed') {
    v.bounded('astro/trailing-slash-drift', 'mixed-build-shape', `the tree carries both about.html and about/index.html - the build.format shape is ambiguous, so canonicals cannot be judged`)
  } else {
    const drifts = []
    for (const page of pages) {
      for (const href of canonicalHrefs(html.get(page))) {
        const pathPart = href.replace(/^https?:\/\/[^/]+/i, '')
        if (!pathPart.startsWith('/')) continue
        const clean = pathPart.split(/[?#]/)[0]
        const lastSeg = clean.replace(/\/$/, '').split('/').pop() || ''
        if (!lastSeg || lastSeg.includes('.')) continue // root or a file URL: no slash opinion
        // A directory-shape tree wants a trailing slash on a directory URL.
        if (shape === 'directory' && !clean.endsWith('/')) drifts.push({ page, canonical: href, why: 'no trailing slash, but the build emits directory-style pages' })
        if (shape === 'file' && clean.endsWith('/')) drifts.push({ page, canonical: href, why: 'trailing slash, but the build emits file-style pages (about.html)' })
      }
    }
    if (drifts.length) {
      v.failed('astro/trailing-slash-drift', {
        problem: 'a canonical disagrees with the tree build.format shape - the canonical points at a URL the host does not serve',
        drifts,
      })
    } else {
      v.passed('astro/trailing-slash-drift', `${shape}-shape tree: ${pages.length} page(s), every canonical agrees with the shape`)
    }
  }

  // --- static-path-missing: a same-origin link to a page never built ---
  const dangling = []
  for (const page of pages) {
    for (const href of internalHrefs(html.get(page))) {
      const pathPart = href.startsWith('/') ? href : null
      if (!pathPart) continue // relative hrefs are ambiguous without the base
      const cands = candidatesFor(pathPart, shape === 'file' ? 'file' : 'directory')
      if (!cands.length) continue
      if (!cands.some((c) => tree.exists(c))) dangling.push({ page, href })
    }
  }
  if (dangling.length) {
    v.failed('astro/static-path-missing', {
      problem: 'a same-origin link points at a page that was never built - a dynamic route whose getStaticPaths param was never emitted 404s silently',
      dangling,
    })
  } else {
    v.passed('astro/static-path-missing', `${pages.length} page(s): every absolute same-origin link resolves to a built page`)
  }

  return { ok: v.ok, rows: v.rows }
}

// SPEC section 3: every entry carries a default export.
export default { run, PKG, REQUIRED_KEYS }
