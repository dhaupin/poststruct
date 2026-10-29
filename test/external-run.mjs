// test/external-run.mjs - the external lane is the one network-bound check, so
// its behavior is pinned against a CANNED fetch: no socket is ever opened.
// Covers: what counts as external, broken -> WARN, retry-on-transient,
// HEAD->GET fallback, the cache (a fresh entry is not re-fetched), TTL expiry,
// and the concurrency bound. The seam exists precisely so this runs offline.
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { auditExternal, collectExternal } from '../src/checks/external.mjs'
import { Findings } from '../src/core.mjs'
import { walkHtml } from '../src/core.mjs'

const fail = (m) => { console.error(`FAIL external: ${m}`); process.exit(1) }
const dirs = []
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'ps-ext-')); dirs.push(d); return d }

// A canned fetch: `routes` maps url -> { status } | { statuses: [...] } (a
// queue, for retry tests). Records every call so we can assert cache behavior.
function cannedFetch(routes, { onCall } = {}) {
  const calls = []
  const impl = async (url, init) => {
    calls.push({ url, method: init.method })
    if (onCall) onCall(url, init, calls)
    const r = routes[url]
    if (!r) return { status: 200, ok: true, url }
    if (r.reject) throw Object.assign(new Error(r.reject), { name: r.name || 'Error' })
    let status = r.status
    if (r.statuses) status = r.statuses.shift() ?? r.statuses[r.statuses.length - 1] ?? r.status
    return { status, ok: status >= 200 && status < 400, url }
  }
  impl.calls = calls
  return impl
}

const GOOD = 'test/fixtures/good'

try {
  // 1. What counts as external: absolute http(s) only. The good fixture also
  //    carries mailto:, a protocol-relative //cdn..., and relative hrefs, none
  //    of which the lane may probe.
  const htmlAt = (abs) => readFileSync(abs, 'utf8')
  const external = collectExternal(walkHtml(GOOD), htmlAt)
  if (!external.includes('https://example.com')) fail('absolute http(s) href must be collected')
  if (external.some((u) => u.includes('cdn.example.com'))) fail('protocol-relative must not be treated as external')
  if (external.some((u) => u.startsWith('mailto:'))) fail('mailto must not be collected')

  // 2. A broken external link is a WARN (transient-host friendly default).
  {
    const f = new Findings()
    const fetchImpl = cannedFetch({ 'https://example.com': { status: 404 } })
    const res = await auditExternal(GOOD, walkHtml(GOOD), f, { fetchImpl, retries: 0 })
    if (res.broken !== 1) fail(`expected 1 broken, got ${res.broken}`)
    const w = f.warns.find((x) => x.id === 'links/external-broken')
    if (!w) fail('a broken external link must WARN')
    if (!w.message.includes('404')) fail('the finding must name the HTTP status')
    if (w.page !== 'index.html') fail(`the finding must name the page, got ${w.page}`)
  }

  // 3. Retry only heals what can heal: 500 then 200 passes, and the run does
  //    not report the transient blip.
  {
    const f = new Findings()
    const fetchImpl = cannedFetch({ 'https://example.com': { statuses: [500, 200] } })
    const res = await auditExternal(GOOD, walkHtml(GOOD), f, { fetchImpl, retries: 2 })
    if (res.broken !== 0) fail('a 500-then-200 must not be reported as broken')
    if (fetchImpl.calls.length !== 2) fail(`expected 2 probes (retry), got ${fetchImpl.calls.length}`)
  }

  // 4. A 4xx is final: it must NOT be retried.
  {
    const f = new Findings()
    const fetchImpl = cannedFetch({ 'https://example.com': { status: 404 } })
    await auditExternal(GOOD, walkHtml(GOOD), f, { fetchImpl, retries: 3 })
    if (fetchImpl.calls.length !== 1) fail(`a 404 must not be retried, got ${fetchImpl.calls.length} probes`)
  }

  // 5. HEAD -> GET fallback: a 405 on HEAD is retried once as GET, and the GET
  //    answer is what counts.
  {
    const f = new Findings()
    const impl = async (url, init) => {
      impl.calls.push(init.method)
      return init.method === 'HEAD' ? { status: 405, ok: false, url } : { status: 200, ok: true, url }
    }
    impl.calls = []
    const res = await auditExternal(GOOD, walkHtml(GOOD), f, { fetchImpl: impl, retries: 0 })
    if (res.broken !== 0) fail('a HEAD-405/GET-200 must resolve clean')
    if (impl.calls.join(',') !== 'HEAD,GET') fail(`expected HEAD then GET, got ${impl.calls.join(',')}`)
  }

  // 6. Transport failure (timeout) is caught and reported, never thrown.
  {
    const f = new Findings()
    const fetchImpl = cannedFetch({ 'https://example.com': { reject: 'timed out', name: 'TimeoutError' } })
    const res = await auditExternal(GOOD, walkHtml(GOOD), f, { fetchImpl, retries: 0 })
    if (res.broken !== 1) fail('a transport failure must count as broken')
    if (!f.warns.some((x) => x.id === 'links/external-broken' && x.message.includes('timeout'))) fail('a timeout must be named')
  }

  // 7. The cache: a fresh entry is reused, so a second run opens NO socket.
  {
    const cache = join(tmp(), 'ext-cache.json')
    const fetchImpl = cannedFetch({ 'https://example.com': { status: 200 } })
    const now = 1_000_000
    await auditExternal(GOOD, walkHtml(GOOD), new Findings(), { fetchImpl, cache, now })
    if (fetchImpl.calls.length !== 1) fail('the first run must probe once')
    const before = fetchImpl.calls.length
    const r2 = await auditExternal(GOOD, walkHtml(GOOD), new Findings(), { fetchImpl, cache, now: now + 1000 })
    if (fetchImpl.calls.length !== before) fail('a fresh cache entry must not be re-fetched')
    if (r2.cached !== 1) fail(`expected 1 cached, got ${r2.cached}`)
    if (!existsSync(cache)) fail('the cache file must be written for CI reuse')

    // 8. TTL expiry re-fetches the same URL.
    const r3 = await auditExternal(GOOD, walkHtml(GOOD), new Findings(), { fetchImpl, cache, now: now + 8 * 24 * 60 * 60 * 1000 })
    if (fetchImpl.calls.length === before) fail('a stale entry must be re-fetched')
    if (r3.cached !== 0) fail('a stale entry must not count as cached')
  }

  // 9. The concurrency bound: with a pool of 3 and a slow handler, no more than
  //    3 probes are ever in flight at once.
  {
    const urls = Array.from({ length: 12 }, (_, i) => `https://example.com/${i}`)
    let inFlight = 0
    let peak = 0
    const impl = async (url) => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight--
      return { status: 200, ok: true, url }
    }
    const dir = tmp()
    // A page linking all 12, so the lane collects them.
    writeFileSync(join(dir, 'index.html'), `<html><head></head><body>${urls.map((u) => `<a href="${u}">x</a>`).join('')}</body></html>`)
    const f = new Findings()
    const res = await auditExternal(dir, walkHtml(dir), f, { fetchImpl: impl, concurrency: 3 })
    if (res.checked !== 12) fail(`expected 12 checked, got ${res.checked}`)
    if (peak > 3) fail(`concurrency 3 must cap in-flight probes, peaked at ${peak}`)
  }

  console.log('external self-test: collect + broken-warn + retry + HEAD/GET + timeout + cache + ttl + concurrency - PASS')
} finally {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
}
