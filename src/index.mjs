// src/index.mjs - runAudit: the one entry programmatic consumers use.
import { walkHtml, walkText, textKind, loadPage, Findings } from './core.mjs'
import { relative, sep, join } from 'node:path'
import { auditHead } from './checks/head.mjs'
import { auditSite } from './checks/site.mjs'
import { auditLinks } from './checks/links.mjs'
import { auditExternal } from './checks/external.mjs'
import { auditI18n } from './checks/i18n.mjs'
import { auditA11y } from './checks/a11y.mjs'
import { auditLanguage } from './checks/language.mjs'
import { auditFeeds } from './checks/feeds.mjs'
import { auditFrontmatter } from './checks/frontmatter.mjs'
import { loadConfig, applyOverrides, matchesSkip } from './config.mjs'

export { Findings } from './core.mjs'
export const SCHEMA_VERSION = 1

export async function runAudit(dir = 'dist', opts = {}) {
  const f = new Findings()
  const config = opts.config || await loadConfig(opts.cwd || process.cwd())
  const moduleFilter = opts.module || null
  // Built-in module scoping (issue#7 B2): the CLI's --module flag is now
  // real. Unknown module names refuse loudly instead of silently running
  // everything; a null filter runs every built-in, so programmatic
  // consumers that never pass opts keep their exact old behavior.
  const BUILTINS = ['head', 'site', 'links', 'i18n', 'a11y', 'language', 'feeds', 'frontmatter']
  if (moduleFilter && !BUILTINS.includes(moduleFilter)) {
    throw new Error(`unknown module ${moduleFilter} (built-ins: ${BUILTINS.join(', ')})`)
  }
  const wantHead = !moduleFilter || moduleFilter === 'head'
  const wantSite = !moduleFilter || moduleFilter === 'site'
  const wantLinks = !moduleFilter || moduleFilter === 'links'
  const wantI18n = !moduleFilter || moduleFilter === 'i18n'
  const wantA11y = !moduleFilter || moduleFilter === 'a11y'
  const wantLanguage = !moduleFilter || moduleFilter === 'language'
  const wantFeeds = !moduleFilter || moduleFilter === 'feeds'
  const wantFrontmatter = !moduleFilter || moduleFilter === 'frontmatter'
  // A text-input-only lane (frontmatter) grades the SOURCE tree, so it must
  // run even when there is no baked HTML to walk. Every other module needs
  // pages, so the walk failure stays loud for them.
  const needsPages = wantHead || wantSite || wantLinks || wantI18n || wantA11y || wantLanguage || wantFeeds
  let pages = []
  try {
    pages = walkHtml(dir)
  } catch (err) {
    if (needsPages) throw err
  }
  if (needsPages && !pages.length) throw new Error(`No HTML files in ${dir}/.`)
  if (config.scope.skip.length) {
    pages = pages.filter((p) => !matchesSkip(relative(dir, p).split(sep).join('/'), config.scope.skip))
    if (needsPages && !pages.length) throw new Error(`Every page in ${dir}/ was skipped by scope.skip.`)
  }
  if (wantHead) {
    for (const path of pages) {
      const pm = loadPage(dir, path)
      const is404 = config.scope.is404 ? config.scope.is404(pm.page) : pm.page === '404.html'
      auditHead(pm, f, { is404 })
    }
  }
  if (wantA11y) {
    for (const path of pages) {
      const pm = loadPage(dir, path)
      const is404 = config.scope.is404 ? config.scope.is404(pm.page) : pm.page === '404.html'
      // The 404 shell is exempt from the page-level a11y contract the same way
      // it is exempt from head: it is not a content page a reader lands on.
      if (!is404) auditA11y(pm, f, opts)
    }
  }
  if (wantLinks) auditLinks(dir, pages, f, opts)
  if (wantI18n) auditI18n(dir, pages, f, opts)
  // The language module grades prose: the baked pages' rendered text plus any
  // source text dirs the config names (the text-shaped input profile, issue#7).
  if (wantLanguage) {
    const docs = pages.map((p) => ({ abs: p, path: relative(dir, p), kind: 'html' }))
    for (const td of config.language.textDirs) {
      const base = join(opts.cwd || process.cwd(), td)
      for (const p of walkText(base)) docs.push({ abs: p, path: relative(opts.cwd || process.cwd(), p), kind: textKind(p) })
    }
    auditLanguage(docs, f, { language: config.language })
  }
  if (wantFeeds) auditFeeds(dir, pages, f, opts)
  // The frontmatter module grades the SOURCE tree (per-rule file globs), the
  // same way the language text profile does - it is a text-input check, not a
  // baked-page check.
  if (wantFrontmatter) auditFrontmatter(opts.cwd || process.cwd(), f, { frontmatter: config.frontmatter })
  // The external lane is opt-in and network-bound, so it runs only when the
  // caller asked (opts.checkExternal) - the default audit stays a pure file
  // reader. It rides the links module: same hrefs, the absolute ones.
  let external = null
  if (opts.checkExternal) external = await auditExternal(dir, pages, f, opts.external || {})
  const site = wantSite ? auditSite(dir, f, opts) : { sitemapLocs: null }
  const findings = applyOverrides([...f.fails, ...f.warns], config.checks)
  const counts = { fail: findings.filter((x) => x.level === 'fail').length, warn: findings.filter((x) => x.level === 'warn').length }
  return { dir, pagesChecked: pages.length, sitemapLocs: site.sitemapLocs, counts, findings, hasFails: counts.fail > 0, config: config.source, external }
}
