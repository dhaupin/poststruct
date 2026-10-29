// src/checks/feeds.mjs - the feeds module (PRD M3).
//
// A baked site usually ships one or more feeds (RSS 2.0 / Atom) and links them
// from every page's head. The failure classes a file reader can actually catch:
//
//   feeds/alternate-dangling    a <link rel="alternate" type="application/
//                               rss+xml|atom+xml"> in a baked page pointing at a
//                               feed file that was not built (FAIL)
//   feeds/malformed             a feed file that is not well-formed XML, or
//                               whose root element is not <rss>/<feed> (FAIL)
//   feeds/empty                 a well-formed feed with no items/entries (WARN)
//   feeds/item-link-dangling    an item/entry <link> pointing at a same-origin
//                               page that was not built (FAIL)
//   feeds/no-self-link          a feed with no <atom:link rel="self"> (RSS) or
//                               <link rel="self"> (Atom), so aggregators cannot
//                               discover the feed URL (WARN)
//
// Zero deps: well-formedness is checked with a small tag-stack walker rather
// than an XML parser, which is enough for the structural questions here (root
// element, balanced tags, no unclosed CDATA). The feed is never fetched; only
// files on disk are read, the same fence every other module holds.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { resolveIn } from './links.mjs'

// Candidate feed files: a .rss/.atom extension is always a feed; a .xml file
// counts only when a page declares it as a feed alternate (so sitemap.xml and
// other .xml artifacts are never mistaken for feeds).
const FEED_EXT = /\.(rss|atom)$/i
const XML_EXT = /\.xml$/i

// A page's feed alternates: <link rel="alternate" type="application/rss+xml"
// href="..."> and the atom twin.
const FEED_LINK_RE = /<link\b[^>]*\brel\s*=\s*["']alternate["'][^>]*>/gi
const isFeedType = (tag) => /application\/(rss|atom)\+xml/i.test(tag)
const attr = (tag, name) => { const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i')); return m ? m[1] : null }

function candidateFeedFiles(dir, declaredPaths) {
  const out = []
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (FEED_EXT.test(name) || (XML_EXT.test(name) && declaredPaths.has(relative(dir, p).split(sep).join('/')))) out.push(p)
    }
  }
  if (existsSync(dir)) walk(dir)
  return out
}

export function auditFeeds(dist, pages, f, opts = {}) {
  // Pass 1: every page's declared feed alternates must resolve to a built file.
  let declared = 0
  const declaredPaths = new Set()
  for (const abs of pages) {
    const html = readFileSync(abs, 'utf8')
    const page = relative(dist, abs).split(sep).join('/')
    const baseDir = page.includes('/') ? page.slice(0, page.lastIndexOf('/')) : ''
    for (const m of html.matchAll(FEED_LINK_RE)) {
      const tag = m[0]
      if (!isFeedType(tag)) continue
      const href = attr(tag, 'href')
      if (!href) continue
      declared += 1
      // Same-origin only; a cross-origin feed is another site's promise.
      if (/^https?:\/\//i.test(href) || href.startsWith('//')) continue
      const path = href.split('#')[0].split('?')[0]
      const target = resolveIn(dist, baseDir, path)
      if (!target) f.fail(page, 'feeds/alternate-dangling', `feed alternate ${path} was not built`)
      else declaredPaths.add(relative(dist, target).split(sep).join('/'))
    }
  }

  // Pass 2: grade each candidate feed file found on disk.
  const feedOnDisk = candidateFeedFiles(dist, declaredPaths).map((p) => relative(dist, p).split(sep).join('/'))
  for (const feedPath of [...new Set(feedOnDisk)].sort()) {
    const xml = readFileSync(join(dist, feedPath), 'utf8')
    const baseDir = feedPath.includes('/') ? feedPath.slice(0, feedPath.lastIndexOf('/')) : ''
    const wf = wellFormed(xml)
    if (!wf.ok) { f.fail(feedPath, 'feeds/malformed', `not well-formed XML: ${wf.reason}`); continue }
    if (wf.root !== 'rss' && wf.root !== 'feed') { f.fail(feedPath, 'feeds/malformed', `root element is <${wf.root}>, expected <rss> or <feed>`); continue }

    const isAtom = wf.root === 'feed'
    const items = isAtom
      ? [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map((x) => x[0])
      : [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((x) => x[0])
    if (!items.length) f.warn(feedPath, 'feeds/empty', 'feed has no items/entries')

    const selfLink = /<link\b[^>]*\brel\s*=\s*["']self["']/i.test(xml) || /<atom:link\b[^>]*\brel\s*=\s*["']self["']/i.test(xml)
    if (!selfLink) f.warn(feedPath, 'feeds/no-self-link', 'no rel="self" link, so aggregators cannot discover the feed URL')

    for (const item of items) {
      const link = isAtom
        ? (item.match(/<link\b[^>]*\bhref\s*=\s*["']([^"']+)["']/i) || [])[1]
        : (item.match(/<link>([\s\S]*?)<\/link>/i) || [])[1]
      if (!link) continue
      const href = link.trim()
      if (/^https?:\/\//i.test(href) || href.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(href)) continue
      const path = href.split('#')[0].split('?')[0]
      if (!path) continue
      if (!resolveIn(dist, baseDir, path)) f.fail(feedPath, 'feeds/item-link-dangling', `item link ${path} was not built`)
    }
  }

  return { feeds: new Set(feedOnDisk).size, declared }
}

// Well-formedness, structural. Returns { ok, reason, root }.
function wellFormed(xml) {
  const stripped = xml.replace(/<\?[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<!DOCTYPE[^>]*>/gi, '')
  const stack = []
  let root = null
  const tagRe = /<(\/?)([A-Za-z_][\w:.-]*)([^>]*?)(\/?)>/g
  let m
  while ((m = tagRe.exec(stripped))) {
    const [, close, name, attrs, selfClose] = m
    if (close) {
      if (!stack.length) return { ok: false, reason: `closing </${name}> with nothing open` }
      const open = stack.pop()
      if (open !== name) return { ok: false, reason: `</${name}> closes <${open}>` }
    } else if (!selfClose) {
      if (!root) root = name
      stack.push(name)
    } else if (!root) {
      root = name
    }
  }
  if (stack.length) return { ok: false, reason: `<${stack[stack.length - 1]}> never closed` }
  return { ok: true, root }
}
