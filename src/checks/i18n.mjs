// src/checks/i18n.mjs - the i18n module (PRD M2).
//
// File-on-disk checks over what a baked tree already carries. No network, no
// source archaeology: the same input shape as every other module (a page is a
// path plus its raw HTML).
//
//   i18n/lang-missing       <html> with no lang attribute, or an empty one (FAIL)
//   i18n/lang-conflict      a lang claim on <html> that disagrees with a
//                           content-language meta or an og:locale on the same
//                           page - different PRIMARY subtag, so en-US vs en-GB
//                           is not a conflict and en vs fr is (FAIL)
//   i18n/hreflang-orphan    a same-origin hreflang pointing at a page that was
//                           never built, so the language alternate 404s (FAIL)
//   i18n/hreflang-no-return a same-origin hreflang whose target is itself in
//                           the i18n graph but names no alternate back (WARN; a
//                           one-way hreflang is legal for a hub or an
//                           x-default, so it is noise as a FAIL)
//
// Scope guard: only same-origin hreflang targets are checked. A cross-origin
// hreflang is another site's promise, not this tree's, the same way an
// external <a href> is out of the links module.
import { readFileSync } from 'node:fs'
import { dirname, relative, sep } from 'node:path'
import { resolveIn } from './links.mjs'

const ENTITIES = { '&amp;': '&', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&lt;': '<', '&gt;': '>' }
const decode = (s) => s.replace(/&(?:amp|quot|#39|apos|lt|gt);/g, (m) => ENTITIES[m] || m)

// A language tag's primary subtag: 'en-US' and 'en-GB' share 'en'. Region
// differences are not a conflict, language differences are.
const primary = (tag) => String(tag).trim().toLowerCase().split('-')[0]

const HREFLANG_RE = /<link\b[^>]*\brel\s*=\s*["']alternate["'][^>]*\bhreflang\s*=\s*["']([^"']+)["'][^>]*>/gi

function htmlLang(head) {
  const m = head.match(/<html\b[^>]*\blang\s*=\s*["']([^"']*)["']/i)
  return m ? decode(m[1]).trim() : null
}

// The path half of an href when the target is same-origin, else null. A
// root-relative or relative href is same-origin by definition; a
// protocol-relative or other-scheme href is not; an absolute http(s) href is
// same-origin only when its host matches the tree's own (see `selfHost`).
function sameOriginPath(href, selfHost) {
  if (href.startsWith('//')) return null
  const abs = href.match(/^https?:\/\/([^/]+)(\/.*)?$/i)
  if (abs) return selfHost && abs[1].toLowerCase() === selfHost ? (abs[2] || '/') : null
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return null
  return href
}

export function auditI18n(dist, pages, f, opts = {}) {
  const htmlAt = (abs) => readFileSync(abs, 'utf8')

  // The tree's own host, read from the first canonical link, so a
  // self-referential absolute hreflang counts as same-origin. Derived from the
  // tree rather than config, so it is self-describing.
  let selfHost = null
  for (const abs of pages) {
    const c = htmlAt(abs).match(/<link\b[^>]*\brel\s*=\s*["']canonical["'][^>]*\bhref\s*=\s*["']([^"']*)["']/i)
    const h = c && c[1].match(/^https?:\/\/([^/]+)/i)
    if (h) { selfHost = h[1].toLowerCase(); break }
  }

  // Pass 1: read every page once, collect its lang and its hreflang edges.
  const pagesInfo = []
  for (const abs of pages) {
    const html = htmlAt(abs)
    const head = html.split('</head>')[0]
    const page = relative(dist, abs).split(sep).join('/')
    const baseDir = dirname(page) === '.' ? '' : dirname(page)
    const lang = htmlLang(head)
    const metaLang = head.match(/<meta\b[^>]*\bhttp-equiv\s*=\s*["']content-language["'][^>]*\bcontent\s*=\s*["']([^"']*)["']/i)
    const ogLocale = head.match(/<meta\b[^>]*\bproperty\s*=\s*["']og:locale["'][^>]*\bcontent\s*=\s*["']([^"']*)["']/i)
    const edges = []
    for (const m of html.matchAll(HREFLANG_RE)) {
      const hrefM = m[0].match(/\bhref\s*=\s*["']([^"']*)["']/i)
      if (!hrefM) continue
      const href = decode(hrefM[1]).trim()
      if (!href) continue
      const path = sameOriginPath(href, selfHost)
      if (!path) continue
      const clean = path.split('#')[0].split('?')[0]
      if (!clean) continue
      edges.push({ tag: m[1].trim(), path: clean, baseDir })
    }
    pagesInfo.push({ abs, page, baseDir, lang, metaLang: metaLang && metaLang[1], ogLocale: ogLocale && ogLocale[1], edges })
  }

  // Pass 2: per-page findings (lang presence, lang conflicts, orphan targets),
  // recording the resolved edges for the return-link pass.
  let hreflangSeen = 0
  const namesByPage = new Map(pagesInfo.map((p) => [p.page, new Set()]))
  for (const p of pagesInfo) {
    if (p.lang === null || p.lang === '') {
      f.fail(p.page, 'i18n/lang-missing', 'no <html lang> attribute (or it is empty)')
    } else {
      if (p.metaLang && primary(p.metaLang) && primary(p.metaLang) !== primary(p.lang)) {
        f.fail(p.page, 'i18n/lang-conflict', `<html lang="${p.lang}"> disagrees with content-language "${p.metaLang}"`)
      }
      // og:locale is underscore-separated ('en_US'); normalize to the tag form.
      if (p.ogLocale && primary(p.ogLocale.replace('_', '-')) && primary(p.ogLocale.replace('_', '-')) !== primary(p.lang)) {
        f.fail(p.page, 'i18n/lang-conflict', `<html lang="${p.lang}"> disagrees with og:locale "${p.ogLocale}"`)
      }
    }

    for (const e of p.edges) {
      hreflangSeen += 1
      const target = resolveIn(dist, e.baseDir, e.path)
      if (!target) {
        f.fail(p.page, 'i18n/hreflang-orphan', `hreflang "${e.tag}" points at ${e.path} which was not built`)
        continue
      }
      namesByPage.get(p.page).add(relative(dist, target).split(sep).join('/'))
    }
  }

  // Pass 3: the return-link half. For every edge A -> B where B itself carries
  // hreflangs, B must name A back. Only fires when B is in the i18n graph, so a
  // page that names A without declaring alternates of its own is not flagged.
  for (const p of pagesInfo) {
    for (const targetPage of namesByPage.get(p.page)) {
      const target = pagesInfo.find((x) => x.page === targetPage)
      if (!target || !target.edges.length) continue
      if (!namesByPage.get(targetPage).has(p.page)) {
        f.warn(p.page, 'i18n/hreflang-no-return', `hreflang to ${targetPage}, which names no alternate back`)
      }
    }
  }

  return { hreflangSeen, langPages: pagesInfo.filter((p) => p.lang).length }
}
