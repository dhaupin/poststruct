// src/index.mjs - runAudit: the one entry programmatic consumers use.
import { walkHtml, loadPage, Findings } from './core.mjs'
import { relative, sep } from 'node:path'
import { auditHead } from './checks/head.mjs'
import { auditSite } from './checks/site.mjs'
import { auditLinks } from './checks/links.mjs'
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
  if (moduleFilter && !['head', 'site', 'links'].includes(moduleFilter)) {
    throw new Error(`unknown module ${moduleFilter} (built-ins: head, site, links)`)
  }
  const wantHead = !moduleFilter || moduleFilter === 'head'
  const wantSite = !moduleFilter || moduleFilter === 'site'
  const wantLinks = !moduleFilter || moduleFilter === 'links'
  let pages = walkHtml(dir)
  if (!pages.length) throw new Error(`No HTML files in ${dir}/.`)
  if (config.scope.skip.length) {
    pages = pages.filter((p) => !matchesSkip(relative(dir, p).split(sep).join('/'), config.scope.skip))
    if (!pages.length) throw new Error(`Every page in ${dir}/ was skipped by scope.skip.`)
  }
  if (wantHead) {
    for (const path of pages) {
      const pm = loadPage(dir, path)
      const is404 = config.scope.is404 ? config.scope.is404(pm.page) : pm.page === '404.html'
      auditHead(pm, f, { is404 })
    }
  }
  if (wantLinks) auditLinks(dir, pages, f, opts)
  const site = wantSite ? auditSite(dir, f, opts) : { sitemapLocs: null }
  const findings = applyOverrides([...f.fails, ...f.warns], config.checks)
  const counts = { fail: findings.filter((x) => x.level === 'fail').length, warn: findings.filter((x) => x.level === 'warn').length }
  return { dir, pagesChecked: pages.length, sitemapLocs: site.sitemapLocs, counts, findings, hasFails: counts.fail > 0, config: config.source }
}
