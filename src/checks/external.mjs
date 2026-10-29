// src/checks/external.mjs - the opt-in external link lane (PRD M1).
//
// This is the one lane that touches the network, and only when asked: the
// audit is a file reader by contract, so external validation is gated behind
// --check-external and never runs otherwise. The lane is shaped by three
// constraints the rest of the tool does not have:
//
// 1. Network answers are not deterministic, so results are CACHED. A fresh
//    cache entry is reused instead of re-fetched, which is what makes a CI
//    run repeatable: only new or stale URLs hit the wire. The cache is a
//    plain JSON file CI can persist as an artifact and restore next run.
// 2. A remote host can fail for reasons outside the tree's control (rate
//    limits, transient DNS, a 5xx blip), so transient failures are RETRIED
//    and the finding defaults to WARN - promote it to FAIL via config once a
//    project's external set is stable, the same way anchors graduate.
// 3. One dead host must not stall the run, so probes are bounded by a
//    CONCURRENCY limit and a per-URL TIMEOUT.
//
// `fetchImpl`, `now`, and the cache path are injectable so the lane can be
// tested against canned responses and a frozen clock with no network - the
// external boundary is the one place a seam is required for a network-free
// test suite (the same reason the sibling checks take no seam at all).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, relative, sep } from 'node:path'

const ABS = /^https?:\/\//i

const ENTITIES = { '&amp;': '&', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&lt;': '<', '&gt;': '>' }
const decode = (s) => s.replace(/&(?:amp|quot|#39|apos|lt|gt);/g, (m) => ENTITIES[m] || m)

const UA = (() => {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
    return `poststruct/${pkg.version} (+https://github.com/dhaupin/poststruct)`
  } catch {
    return 'poststruct (+https://github.com/dhaupin/poststruct)'
  }
})()

// Every absolute http(s) href in the baked tree, deduped and sorted so the
// findings order is stable run to run. Relative and root-absolute hrefs are
// internal (the links module owns them); mailto:/tel:/data: are not links a
// fetch can validate.
export function collectExternal(pages, htmlAt) {
  const urls = new Set()
  for (const abs of pages) {
    for (const m of htmlAt(abs).matchAll(/<a\b[^>]*?\shref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
      const href = decode(m[1] ?? m[2] ?? '').trim()
      if (ABS.test(href)) urls.add(href)
    }
  }
  return [...urls].sort()
}

function loadCache(path) {
  if (!path || !existsSync(path)) return { schema: 1, entries: {} }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'))
    if (raw && raw.schema === 1 && raw.entries && typeof raw.entries === 'object') return raw
  } catch { /* a corrupt cache is a cold cache, never a hard failure */ }
  return { schema: 1, entries: {} }
}

function saveCache(path, cache) {
  if (!path) return
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(cache, null, 2) + '\n')
}

// One probe. HEAD first (cheap), falling back to GET only when the host says
// HEAD is not allowed - some servers 405/501 a HEAD they would answer fine.
async function probe(url, { fetchImpl, timeoutMs }) {
  const init = { redirect: 'follow', signal: AbortSignal.timeout(timeoutMs), headers: { 'user-agent': UA } }
  let res = await fetchImpl(url, { ...init, method: 'HEAD' })
  if (res.status === 405 || res.status === 501) res = await fetchImpl(url, { ...init, method: 'GET' })
  return res
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Retry only what can heal: transport errors, 5xx, and 429. A 4xx is the
// server's final answer and retrying it just wastes the run.
function transient(status) {
  return status === 429 || (status >= 500 && status <= 599)
}

async function probeWithRetry(url, { fetchImpl, timeoutMs, retries }) {
  let last
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt) await sleep(250 * attempt)
    try {
      const res = await probe(url, { fetchImpl, timeoutMs })
      last = { status: res.status, ok: res.status >= 200 && res.status < 400, finalUrl: res.url || url }
      if (!transient(res.status)) return last
    } catch (err) {
      last = { status: 0, ok: false, error: err?.name === 'TimeoutError' || err?.name === 'AbortError' ? 'timeout' : String(err?.message || err) }
    }
  }
  return last
}

// A worker pool: `limit` probes in flight, each worker pulling the next URL.
async function runPool(urls, limit, fn) {
  const results = new Map()
  let next = 0
  const worker = async () => {
    while (next < urls.length) {
      const i = next++
      results.set(urls[i], await fn(urls[i]))
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, urls.length) }, worker))
  return results
}

export async function auditExternal(dist, pages, f, opts = {}) {
  const {
    fetchImpl = globalThis.fetch,
    concurrency = 8,
    retries = 2,
    timeoutMs = 10000,
    cache: cachePath = null,
    ttlMs = 7 * 24 * 60 * 60 * 1000,
    now = Date.now(),
  } = opts
  if (typeof fetchImpl !== 'function') throw new Error('--check-external needs a fetch implementation (Node 20+)')

  const cache = loadCache(cachePath)
  const htmlAt = (abs) => readFileSync(abs, 'utf8')
  const byPage = []
  for (const abs of pages) {
    const found = collectExternal([abs], htmlAt)
    if (found.length) byPage.push({ page: relative(dist, abs).split(sep).join('/'), urls: found })
  }
  const urls = [...new Set(byPage.flatMap((p) => p.urls))].sort()
  if (!urls.length) return { checked: 0, cached: 0, broken: 0 }

  const fresh = (e) => e && typeof e.checkedAt === 'number' && now - e.checkedAt < ttlMs
  const stale = urls.filter((u) => !fresh(cache.entries[u]))
  const results = new Map(urls.filter((u) => fresh(cache.entries[u])).map((u) => [u, cache.entries[u]]))

  if (stale.length) {
    const probed = await runPool(stale, concurrency, (u) => probeWithRetry(u, { fetchImpl, timeoutMs, retries }))
    for (const [u, r] of probed) {
      results.set(u, r)
      cache.entries[u] = { ...r, checkedAt: now }
    }
    saveCache(cachePath, cache)
  }

  let broken = 0
  for (const { page, urls: found } of byPage) {
    for (const url of found) {
      const r = results.get(url)
      if (r && !r.ok) {
        broken++
        f.warn(page, 'links/external-broken', `external link ${url} -> ${r.error ? r.error : `HTTP ${r.status}`}`)
      }
    }
  }
  return { checked: urls.length, cached: urls.length - stale.length, broken }
}
