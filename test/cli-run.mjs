// test/cli-run.mjs - the argv parser is a real contract (issue#7 B2: a valued
// flag's value was once silently fed into dirArg). This drives the real binary
// and pins: the dir is still found alongside valued flags on either side, a
// valued flag with no value refuses with exit 2, and --check-external rides
// without opening a socket when the fixture's only external link is reachable
// by the injected cache (here: a prewarmed cache file, so no network at all).
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const fail = (m) => { console.error(`FAIL cli: ${m}`); process.exit(1) }
const dirs = []
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'ps-cli-')); dirs.push(d); return d }

// Runs the binary, returns { code, out }. Never throws on a non-zero exit.
function run(args) {
  try {
    const out = execFileSync('node', ['bin/cli.mjs', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    return { code: 0, out }
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout || ''}${e.stderr || ''}` }
  }
}

try {
  // The dir is found whether it sits before or after a valued flag, and the
  // flag's value is never mistaken for it.
  const a = run(['audit', 'test/fixtures/bad', '--module', 'links'])
  if (!/2 baked page\(s\)/.test(a.out)) fail(`dir after --module value: got "${a.out.trim()}"`)
  const b = run(['audit', '--module', 'links', 'test/fixtures/bad'])
  if (!/2 baked page\(s\)/.test(b.out)) fail(`dir before --module value: got "${b.out.trim()}"`)

  // A valued flag with no value refuses loudly with the usage exit code.
  const c = run(['audit', 'test/fixtures/good', '--external-timeout'])
  if (c.code !== 2) fail(`missing flag value must exit 2, got ${c.code}`)
  if (!/--external-timeout needs a value/.test(c.out)) fail(`refusal must name the flag, got "${c.out.trim()}"`)

  // --check-external reads the cache and opens no socket: the good fixture's
  // only external URL is prewarmed as reachable, so the run resolves offline.
  const cache = join(tmp(), 'cache.json')
  writeFileSync(cache, JSON.stringify({ schema: 1, entries: { 'https://example.com': { status: 200, ok: true, finalUrl: 'https://example.com', checkedAt: Date.now() } } }))
  const d = run(['audit', 'test/fixtures/good', '--check-external', '--external-cache', cache])
  if (d.code !== 0) fail(`cached external run must be clean, got ${d.code}: ${d.out.trim()}`)
  if (!/external 1 url\(s\) \(1 cached, 0 broken\)/.test(d.out)) fail(`expected a cached external summary, got "${d.out.trim()}"`)

  console.log('cli self-test: dir-vs-value + missing-value refusal + cached external run - PASS')
} finally {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
}
