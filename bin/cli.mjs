#!/usr/bin/env node
// bin/cli.mjs - poststruct audit [dir] [--json] [--module x] | lint-packs [--deep] [--json] [--against <lib>] [dir]
import { runAudit } from '../src/index.mjs'
import { loadConfig } from '../src/config.mjs'
import { runLintPacks } from '../src/lint-packs.mjs'

const args = process.argv.slice(2)
// The leading verb (flowforge/explore family convention: poststruct audit [dir])
// is a dispatch token, never a target path (issue#7 B1: the documented
// `poststruct audit dist/` form previously fed 'audit' into dirArg and died
// with "No HTML files in audit/"). The verbless form `poststruct dist` keeps
// working: only a known verb is ever stripped, so a typo'd first word cannot
// silently become a verb OR a fantasy directory.
const VERBS = new Set(['audit', 'lint-packs'])
if (args[0] === 'lint-packs') {
  // The pack lint lane as a discoverable verb (mirrors crashtest's
  // lint-packs, issue #32): the repo's own packstruct install, never
  // downloaded, pass-through exit codes, loud refusal when absent.
  process.exit(runLintPacks({ argv: args.slice(1), cwd: process.cwd(), json: args.includes('--json') }))
}
const rest = VERBS.has(args[0]) ? args.slice(1) : args
const json = rest.includes('--json')
// Flags that take a VALUE, and the value must never be mistaken for the dir.
// (issue#7 B2: the --module value was once silently fed into dirArg.)
const VALUED = ['--module', '--external-cache', '--external-concurrency', '--external-retries', '--external-timeout']
const flags = {}
for (const flag of VALUED) {
  const i = rest.indexOf(flag)
  if (i < 0) { flags[flag] = null; continue }
  const v = rest[i + 1]
  if (v === undefined || v.startsWith('-')) {
    console.error(`poststruct: ${flag} needs a value`)
    process.exit(2)
  }
  flags[flag] = v
}
const moduleFilter = flags['--module']
const consumed = new Set()
for (const flag of VALUED) {
  const at = rest.indexOf(flag)
  if (at >= 0) { consumed.add(at); consumed.add(at + 1) }
}
const explicitDir = rest.find((a, i) => !a.startsWith('-') && !consumed.has(i)) || null
const checkExternal = rest.includes('--check-external')
const num = (flag) => (flags[flag] != null ? Number(flags[flag]) : undefined)

try {
  const config = await loadConfig(process.cwd())
  // An explicit CLI dir wins; otherwise the config's dir, then the default.
  const dirArg = explicitDir || config.dir || 'dist'
  const external = checkExternal
    ? {
        cache: flags['--external-cache'],
        concurrency: num('--external-concurrency'),
        retries: num('--external-retries'),
        timeoutMs: num('--external-timeout'),
      }
    : null
  const r = await runAudit(dirArg, { module: moduleFilter, config, checkExternal, external })
  if (json) {
    console.log(JSON.stringify({ schema: 1, counts: r.counts, findings: r.findings, ...(r.external ? { external: r.external } : {}) }, null, 2))
  } else {
    const mod = moduleFilter ? ` (module: ${moduleFilter})` : ''
    const cfg = r.config ? `, config ${r.config}` : ''
    const ext = r.external ? `, external ${r.external.checked} url(s) (${r.external.cached} cached, ${r.external.broken} broken)` : ''
    console.log(`poststruct: ${r.pagesChecked} baked page(s) checked${mod}${cfg}${ext}, sitemap ${r.sitemapLocs == null ? 'not audited' : `has ${r.sitemapLocs} loc entries`}`)
    for (const fd of r.findings) console.log(`  ${fd.level.toUpperCase()} ${fd.page}: ${fd.message}`)
  }
  process.exit(r.hasFails ? 1 : 0)
} catch (e) {
  console.error(`poststruct: ${e.message}`)
  process.exit(2)
}
