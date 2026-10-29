// test/feeds-run.mjs - the feeds module (PRD M3). Fixtures scaffolded into a
// temp dir at run time (zero committed bytes). Real code paths: runAudit walks
// real files, the feeds module reads real feed XML off disk.
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runAudit } from '../src/index.mjs'

const fail = (m) => { console.error(`FAIL feeds: ${m}`); process.exit(1) }
const dirs = []
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'ps-feeds-')); dirs.push(d); return d }
const write = (d, p, body) => { const full = join(d, p); mkdirSync(join(full, '..'), { recursive: true }); writeFileSync(full, body) }
// A page that clears the other modules; `extra` adds head links.
const PAGE = (extra = '') => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Fixture Page Title Here</title><meta name="description" content="A fixture description that sits inside the seventy to one hundred and sixty five character band so it does not warn."><link rel="canonical" href="https://example.com/">${extra}</head><body><a href="#main">Skip</a><main id="main"><h1>x</h1></main></body></html>`
const ids = (r, level) => r.findings.filter((x) => x.level === level).map((x) => x.id)

const GOOD_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>
<title>Fixture</title><link>https://example.com/</link>
<atom:link href="https://example.com/feed.xml" rel="self" type="application/rss+xml"/>
<item><title>One</title><link>/about/</link></item>
</channel></rss>`

try {
  // Clean: a page linking a well-formed feed that resolves is silent.
  {
    const d = tmp()
    write(d, 'dist/index.html', PAGE('<link rel="alternate" type="application/rss+xml" href="/feed.xml">'))
    write(d, 'dist/about/index.html', PAGE())
    write(d, 'dist/feed.xml', GOOD_RSS)
    const r = await runAudit(join(d, 'dist'), { module: 'feeds', cwd: d })
    if (r.findings.length) fail(`a clean feed must be silent, got ${JSON.stringify(r.findings)}`)
  }
  // alternate-dangling: a declared feed that was not built.
  {
    const d = tmp()
    write(d, 'dist/index.html', PAGE('<link rel="alternate" type="application/rss+xml" href="/feed.xml">'))
    const r = await runAudit(join(d, 'dist'), { module: 'feeds', cwd: d })
    if (!ids(r, 'fail').includes('feeds/alternate-dangling')) fail('a declared-but-missing feed must FAIL')
  }
  // malformed: unclosed tag and a wrong root element.
  {
    const d = tmp()
    write(d, 'dist/index.html', PAGE('<link rel="alternate" type="application/rss+xml" href="/feed.xml">'))
    write(d, 'dist/feed.xml', '<rss><channel><title>x</channel></rss>')
    const r = await runAudit(join(d, 'dist'), { module: 'feeds', cwd: d })
    if (!ids(r, 'fail').includes('feeds/malformed')) fail('unbalanced tags must FAIL malformed')
    const d2 = tmp()
    write(d2, 'dist/index.html', PAGE('<link rel="alternate" type="application/atom+xml" href="/feed.atom">'))
    write(d2, 'dist/feed.atom', '<html><body>not a feed</body></html>')
    const r2 = await runAudit(join(d2, 'dist'), { module: 'feeds', cwd: d2 })
    if (!ids(r2, 'fail').includes('feeds/malformed')) fail('a wrong root element must FAIL malformed')
  }
  // empty feed WARNs; no-self-link WARNs.
  {
    const d = tmp()
    write(d, 'dist/index.html', PAGE('<link rel="alternate" type="application/rss+xml" href="/feed.xml">'))
    write(d, 'dist/feed.xml', '<rss version="2.0"><channel><title>x</title><link>https://example.com/</link></channel></rss>')
    const r = await runAudit(join(d, 'dist'), { module: 'feeds', cwd: d })
    if (!ids(r, 'warn').includes('feeds/empty')) fail('an itemless feed must WARN empty')
    if (!ids(r, 'warn').includes('feeds/no-self-link')) fail('a feed with no rel=self must WARN no-self-link')
  }
  // item-link-dangling: an RSS item link to a page not built.
  {
    const d = tmp()
    write(d, 'dist/index.html', PAGE('<link rel="alternate" type="application/rss+xml" href="/feed.xml">'))
    write(d, 'dist/feed.xml', GOOD_RSS.replace('<link>/about/</link>', '<link>/missing-page/</link>'))
    const r = await runAudit(join(d, 'dist'), { module: 'feeds', cwd: d })
    if (!ids(r, 'fail').includes('feeds/item-link-dangling')) fail('an item link to an unbuilt page must FAIL')
  }
  // sitemap.xml is never mistaken for a feed (the .xml scoping guard).
  {
    const d = tmp()
    write(d, 'dist/index.html', PAGE())
    write(d, 'dist/sitemap.xml', '<urlset><url><loc>https://example.com/</loc></url></urlset>')
    const r = await runAudit(join(d, 'dist'), { module: 'feeds', cwd: d })
    if (r.findings.length) fail(`sitemap.xml must not be graded as a feed, got ${JSON.stringify(r.findings)}`)
  }
  // Atom: <entry> items and <link rel=self> are the atom twins.
  {
    const d = tmp()
    write(d, 'dist/index.html', PAGE('<link rel="alternate" type="application/atom+xml" href="/feed.atom">'))
    write(d, 'dist/about/index.html', PAGE())
    write(d, 'dist/feed.atom', `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>x</title><link rel="self" href="https://example.com/feed.atom"/><entry><title>One</title><link href="/about/"/></entry></feed>`)
    const r = await runAudit(join(d, 'dist'), { module: 'feeds', cwd: d })
    if (r.findings.length) fail(`a clean atom feed must be silent, got ${JSON.stringify(r.findings)}`)
  }

  console.log('feeds self-test: alternate-dangling + malformed + empty + no-self-link + item-link-dangling + atom + sitemap-scope - PASS')
} finally {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
}
