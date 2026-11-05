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

// ---- the host policy (SSRF guard) -----------------------------------------
//
// The lane fetches URLs a BAKED TREE names, and a baked tree can be
// attacker-influenced (a CMS field, a dependency's demo HTML, a scraped
// page). Left open, `--check-external` is a server-side request forgery
// primitive: a link to `http://169.254.169.254/...` (cloud metadata),
// `http://127.0.0.1:<port>/` (a co-located service), or an internal
// `http://10.0.0.5/` would make the CI runner fetch it and report the status
// in the findings - a probe an attacker cannot run directly. The policy
// closes that: a host literal that names a private, loopback, link-local,
// unique-local, or otherwise non-public address is REFUSED before any socket
// opens (a network-free, deterministic call). It is opt-out, not opt-in, so
// the secure shape is the default: `--external-allow-private` restores the
// old behavior for a tree that deliberately links an internal host.
//
// The check is on the URL's host LITERAL, in every spelling a parser accepts
// (dotted-quad, bare integer, octal, hex, short forms, IPv6, IPv4-mapped
// IPv6). A public name that DNS-rebinds to a private address is a separate
// class (TOCTOU at resolution time) that a literal check cannot see and that
// pinning the resolved IP would be needed to close - noted honestly, not
// silently claimed. The common SSRF targets (the metadata IP, loopback,
// RFC1918, IPv6 unique-local) are literals and are refused here.

// CIDR blocks (v4) refused by default: this-network, private, CGNAT,
// link-local (includes the 169.254.169.254 metadata IP), IETF protocol
// assignments, benchmarking, reserved, and broadcast.
const V4_BLOCKS = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4], ['255.255.255.255', 32],
]

function v4ToInt(ip) {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let n = 0
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null
    const b = Number(p)
    if (b > 255) return null
    n = (n * 256) + b
  }
  return n
}

// A host literal that names a non-public v4 address, in every spelling the C
// `inet_aton` rules (which Node's URL parser follows) accept: a dotted quad,
// a bare 32-bit integer (`2130706433` = 127.0.0.1), octal (`0177.0.0.1`), hex
// (`0x7f.0.0.1`), and short dotted forms (`127.1`, `0x7f.1`). A naive
// four-octet check misses all but the first; this resolves each group the way
// the OS would, then classifies the 32-bit value.
function isPrivateV4Literal(host) {
  const groups = host.split('.')
  if (groups.length > 4) return false
  const nums = []
  for (const g of groups) {
    let n
    if (/^0x[0-9a-f]+$/i.test(g)) n = parseInt(g, 16)
    else if (/^0[0-7]+$/.test(g)) n = parseInt(g, 8)
    else if (/^\d+$/.test(g)) n = Number(g)
    else return false
    if (!Number.isInteger(n) || n < 0) return false
    nums.push(n)
  }
  if (!nums.length) return false
  // inet_aton: the last group fills the low-order bytes (256^(5-n) of them);
  // every earlier group is a single byte. Out-of-range groups mean the string
  // is not an address, so it is not a private literal.
  const maxLast = 256 ** (5 - nums.length)
  if (nums[nums.length - 1] >= maxLast) return false
  for (let i = 0; i < nums.length - 1; i++) if (nums[i] > 255) return false
  let value = 0
  for (let i = 0; i < nums.length - 1; i++) value = (value * 256) + nums[i]
  value = (value * maxLast) + nums[nums.length - 1]
  return V4_BLOCKS.some(([base, bits]) => (value >>> (32 - bits)) === (v4ToInt(base) >>> (32 - bits)))
}

// Parse an IPv6 literal into its eight 16-bit groups, or null when the
// string is not a well-formed v6 address. Handles `::` compression and an
// embedded dotted-quad tail (`::ffff:127.0.0.1`), which the group split
// would otherwise reject - the URL parser normalizes that form to hex
// (`::ffff:7f00:1`) before we ever see it, so both spellings must parse.
function v6Groups(host) {
  let h = String(host).toLowerCase()
  if (!h.includes(':')) return null
  const dotted = h.match(/(\d{1,3}(?:\.\d{1,3}){3})$/)
  if (dotted) {
    const n = v4ToInt(dotted[1])
    if (n === null) return null
    h = h.slice(0, dotted.index) + ((n >>> 16).toString(16)) + ':' + ((n & 0xffff).toString(16))
  }
  const halves = h.split('::')
  if (halves.length > 2) return null
  const toGroups = (s) => (s === '' ? [] : s.split(':').map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : null)))
  const head = toGroups(halves[0])
  const tail = halves.length === 2 ? toGroups(halves[1]) : []
  if (head.includes(null) || tail.includes(null)) return null
  if (halves.length === 1) return head.length === 8 ? head : null
  const fill = 8 - head.length - tail.length
  if (fill < 0) return null
  return [...head, ...Array(fill).fill(0), ...tail]
}

const v4FromGroups = (hi, lo) => `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`

// IPv6 loopback/unspecified, IPv4-mapped/translated/compatible, NAT64, 6to4,
// and the unique-local (`fc00::/7`) + link-local (`fe80::/10`) ranges.
// Brackets are stripped by the caller. The embedded-IPv4 forms are the ones a
// naive dotted-suffix check misses: Node's URL parser rewrites
// `::ffff:127.0.0.1` to `::ffff:7f00:1`, so the loopback is only visible once
// the 32 low bits are reassembled from the hex groups.
function isPrivateV6Literal(host) {
  const g = v6Groups(host)
  if (!g) return false
  // `::` (unspecified) and `::1` (loopback).
  if (g.every((x) => x === 0)) return true
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true
  // IPv4-mapped `::ffff:a.b.c.d` and IPv4-translated `::ffff:0:a.b.c.d` -
  // both carry the v4 in the low 32 bits.
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return isPrivateV4Literal(v4FromGroups(g[6], g[7]))
  if (g.slice(0, 4).every((x) => x === 0) && g[4] === 0xffff && g[5] === 0) return isPrivateV4Literal(v4FromGroups(g[6], g[7]))
  // IPv4-compatible `::a.b.c.d` (deprecated but still routed by some stacks).
  if (g.slice(0, 6).every((x) => x === 0) && (g[6] || g[7])) return isPrivateV4Literal(v4FromGroups(g[6], g[7]))
  // NAT64 well-known prefix `64:ff9b::/96`.
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return isPrivateV4Literal(v4FromGroups(g[6], g[7]))
  // 6to4 `2002::/16` embeds the IPv4 in groups 1-2.
  if (g[0] === 0x2002) return isPrivateV4Literal(v4FromGroups(g[1], g[2]))
  if ((g[0] & 0xfe00) === 0xfc00) return true // fc00::/7 unique-local
  if ((g[0] & 0xffc0) === 0xfe80) return true // fe80::/10 link-local
  return false
}

export function isPrivateHostLiteral(host) {
  // A trailing dot is the explicit-root FQDN spelling of the SAME host
  // (`localhost.` == `localhost`, `metadata.google.internal.` likewise); the
  // URL parser keeps it, so normalize it away or every name/address rule
  // below is bypassable with one appended dot.
  const h = (host || '').replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase()
  if (!h) return false
  // Well-known non-public NAMES that need no DNS to recognize: loopback, the
  // mDNS/local suffixes, and the cloud metadata hostname. A literal check
  // cannot resolve an arbitrary name, but these are reserved and always
  // resolve locally, so blocking them is free and covers the common probes.
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h === 'metadata.google.internal') return true
  // A hostname (letters outside the numeric/hex alphabet) is not a private
  // literal; DNS-based rebinding is out of scope for a literal check.
  if (/^[0-9a-fx.]+$/.test(h)) {
    if (isPrivateV4Literal(h)) return true
  }
  return isPrivateV6Literal(h)
}

const PRIVATE_HOST_REASON = 'names a private, loopback, link-local, or otherwise non-public address (SSRF guard)'

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
    allowPrivate = false,
    now = Date.now(),
  } = opts
  if (typeof fetchImpl !== 'function') throw new Error('--check-external needs a fetch implementation (Node 20+)')
  // A bad bound is a usage error, never a silent skip: `concurrency: 0`
  // (or NaN) would spawn zero pool workers, and a NaN `retries` would skip
  // the probe loop entirely - either way every URL reads unprobed yet the
  // audit reports broken: 0. Refuse instead of faking a pass.
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error(`--external-concurrency must be an integer >= 1, got "${String(concurrency)}"`)
  }
  if (!Number.isInteger(retries) || retries < 0) {
    throw new Error(`--external-retries must be an integer >= 0, got "${String(retries)}"`)
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error(`--external-timeout must be an integer >= 1, got "${String(timeoutMs)}"`)
  }

  const cache = loadCache(cachePath)
  const htmlAt = (abs) => readFileSync(abs, 'utf8')
  const byPage = []
  for (const abs of pages) {
    const found = collectExternal([abs], htmlAt)
    if (found.length) byPage.push({ page: relative(dist, abs).split(sep).join('/'), urls: found })
  }
  const urls = [...new Set(byPage.flatMap((p) => p.urls))].sort()
  if (!urls.length) return { checked: 0, cached: 0, broken: 0, blocked: 0 }

  // The SSRF guard runs BEFORE any socket: a host that names a private
  // address is refused here (network-free, deterministic) and never handed to
  // the pool. A refused URL is a finding, not a silent skip - the same
  // honesty the bad-bound refusal carries. `--external-allow-private` opts a
  // tree that deliberately links an internal host back into the old behavior.
  const blocked = []
  const allowed = []
  for (const u of urls) {
    let host = null
    try { host = new URL(u).hostname } catch { /* an unparsable absolute URL still probes and fails honestly */ }
    if (!allowPrivate && host && isPrivateHostLiteral(host)) blocked.push(u)
    else allowed.push(u)
  }
  for (const { page, urls: found } of byPage) {
    for (const url of found) {
      if (blocked.includes(url)) f.warn(page, 'links/external-blocked', `external link ${url} refused: ${PRIVATE_HOST_REASON} (pass --external-allow-private to probe it)`)
    }
  }

  const fresh = (e) => e && typeof e.checkedAt === 'number' && now - e.checkedAt < ttlMs
  const stale = allowed.filter((u) => !fresh(cache.entries[u]))
  const results = new Map(allowed.filter((u) => fresh(cache.entries[u])).map((u) => [u, cache.entries[u]]))

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
  return { checked: allowed.length, cached: allowed.length - stale.length, broken, blocked: blocked.length }
}
