// prestruct-shapes - file checks over a site baked by the prestruct engine.
// The check ids come from prestruct's shipped inject-brand contract: the
// engine writes the SSR marker onto the app mount, stamps one deploy-id
// across the tree, keeps og:url in step with rel=canonical, and replaces the
// shell template's placeholder tokens. Each of those is a promise the shell
// template states in prose ("never served as-is") - this pack makes them
// checkable. All pure file reads: attribute regexes over committed HTML.
// Zero network, zero HTML execution (the vant-shapes fence deal).
//
// THE CONTRACT with the target (moduleCtx['prestructShapes']):
//   distDir        -> the baked site directory to scan
//   readdir(rel) / exists(rel) / text(rel) -> the dist fs helpers
//
// Verdict taxonomy (family): BOUNDED / PASSED / EXPLOITED.

export const PKG = 'packs/public/prestruct-shapes'

export const REQUIRED_KEYS = ['distDir', 'readdir', 'exists', 'text']

const PACK = 'prestruct-shapes'

// The app-mount marker. A page that carries the mount is an engine-rendered
// page and must carry the SSR attribute; a page without the mount is a
// hand-authored shell (the 404 contract) and is exempt. This is the whole
// reason a bare "does data-server-rendered appear anywhere" check is wrong:
// it false-positives on every shell page.
const MOUNT_RE = /<div\s+id="root"([^>]*)>/i

// The shell template's placeholder tokens, read from web/index.html. A
// build that ships any of these served the template instead of the site.
const PLACEHOLDERS = [
  { token: 'your-site.example.com', what: 'placeholder canonical host' },
  { token: '<title>Your Site</title>', what: 'placeholder title' },
]

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

// The first content="" of a meta matched by name= or property=, whichever
// the page uses. Attribute order is not assumed.
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

  const pages = walkHtml(ctx.readdir, '')
  if (!pages.length) {
    v.bounded('prestruct/no-baked-pages', 'dist-absent-or-empty', `no .html under ${ctx.distDir} - bake first; the pack cannot audit what was never built`)
    return { ok: v.ok, rows: v.rows }
  }

  const html = new Map()
  for (const page of pages) html.set(page, ctx.text(page) || '')

  // --- the SSR marker: present on every mounted page, absent on shells ---
  const missing = []
  for (const page of pages) {
    const mount = MOUNT_RE.exec(html.get(page))
    if (!mount) continue // hand-authored shell page (404) - exempt
    if (!/data-server-rendered\s*=\s*["']true["']/i.test(mount[1])) missing.push(page)
  }
  if (missing.length) {
    v.failed('prestruct/ssr-marker-missing', {
      problem: 'an app mount without data-server-rendered="true" - the engine rendered this page but did not stamp it (a client-rendered page in a baked tree)',
      pages: missing,
    })
  } else {
    const mounted = pages.filter((p) => MOUNT_RE.test(html.get(p))).length
    v.passed('prestruct/ssr-marker-missing', `${mounted} mounted page(s) carry the SSR marker; ${pages.length - mounted} shell page(s) correctly exempt`)
  }

  // --- the deploy-id is one build across the tree ---
  const deployIds = new Map()
  for (const page of pages) {
    const id = metaContent(html.get(page), 'deploy-id')
    if (id != null) deployIds.set(page, id)
  }
  if (!deployIds.size) {
    // Not a prestruct-baked tree, or an older engine with no deploy-id. A
    // single-build claim is unverifiable, so it dockets BOUNDED - never a
    // fake pass.
    v.bounded('prestruct/deploy-id-drift', 'deploy-id-absent', `no <meta name="deploy-id"> on any of ${pages.length} page(s) - this tree carries no engine build stamp`)
  } else {
    const distinct = new Set(deployIds.values())
    const stamped = deployIds.size
    if (distinct.size > 1) {
      v.failed('prestruct/deploy-id-drift', {
        problem: 'pages carry different deploy-ids - a partial bake left stale pages in dist (the tree is not one build)',
        ids: [...distinct].sort(),
      })
    } else if (stamped < pages.length) {
      const unstamped = pages.filter((p) => !deployIds.has(p))
      v.failed('prestruct/deploy-id-drift', {
        problem: `deploy-id "${[...distinct][0]}" covers ${stamped} of ${pages.length} page(s) - an unstamped page predates or missed the bake`,
        pages: unstamped,
      })
    } else {
      v.passed('prestruct/deploy-id-drift', `deploy-id "${[...distinct][0]}" covers all ${stamped} page(s) - one build`)
    }
  }

  // --- og:url agrees with rel=canonical ---
  const urlFaults = []
  let compared = 0
  for (const page of pages) {
    const canon = canonicalHref(html.get(page))
    const og = metaContent(html.get(page), 'og:url')
    if (canon == null || og == null) continue
    compared += 1
    if (canon !== og) urlFaults.push({ page, canonical: canon, ogUrl: og })
  }
  if (urlFaults.length) {
    v.failed('prestruct/canonical-ogurl-drift', {
      problem: 'og:url disagrees with rel=canonical - the social card points at a different URL than the page declares canonical',
      pages: urlFaults,
    })
  } else if (!compared) {
    v.bounded('prestruct/canonical-ogurl-drift', 'canonical-or-og-url-absent', `no page carries both rel=canonical and og:url - the parity claim is unverifiable`)
  } else {
    v.passed('prestruct/canonical-ogurl-drift', `${compared} page(s): og:url matches rel=canonical exactly`)
  }

  // --- shell placeholder tokens never survive the inject pass ---
  const leaks = []
  for (const page of pages) {
    const body = html.get(page)
    for (const { token, what } of PLACEHOLDERS) {
      if (body.includes(token)) leaks.push({ page, token, what })
    }
  }
  if (leaks.length) {
    v.failed('prestruct/placeholder-leaked', {
      problem: 'a shell template placeholder survived into dist - the site is serving the template, not the injected brand',
      leaks,
    })
  } else {
    v.passed('prestruct/placeholder-leaked', `${pages.length} page(s): no shell placeholder tokens in the baked output`)
  }

  return { ok: v.ok, rows: v.rows }
}

// SPEC section 3: every entry carries a default export - the loader loads
// the default; the named exports above are the packlint census surface.
export default { run, PKG, REQUIRED_KEYS }
