// test/post-permalinks-run.mjs - the release-post permalink law.
//
// A dotted, slashless permalink (permalink: /discussions/announcing-v1.0.0)
// makes Jekyll emit an EXTENSIONLESS file: Ruby reads the ".0" as a file
// extension, so Jekyll skips appending ".html". freestruct's page scanner
// matches only `.html`/`.htm`, so the page is invisible to the whole SEO
// pipeline - no sitemap <loc>, no og/canonical/JSON-LD - even though it serves
// 200. The trailing-slash form emits <slug>/index.html and is seen. Ported
// from eyestruct, the same bug fixed there first.
//
// Two legs, per the house rule: every post permalink carries the slash, and
// the index lists exactly the post files (one row each, linking the slash
// form), so a new post without an index row reds this too.
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const fail = (m) => { console.error(`FAIL post-permalinks: ${m}`); process.exit(1) }
const DIR = join(resolve(new URL('.', import.meta.url).pathname, '..'), 'docs', 'discussions')
const posts = () => readdirSync(DIR).filter((f) => /^announcing-v.+\.md$/.test(f)).sort()

const files = posts()
if (files.length < 3) fail(`expected the release posts to be present, found ${files.length}`)

for (const f of files) {
  const m = readFileSync(join(DIR, f), 'utf8').match(/^permalink:\s*(\S+)\s*$/m)
  if (!m) fail(`${f}: no permalink`)
  if (!/\/$/.test(m[1])) {
    fail(`${f}: permalink "${m[1]}" must end with "/" so Jekyll emits index.html (a dotted, slashless slug is extensionless on disk and freestruct never sees it)`)
  }
}

const index = readFileSync(join(DIR, 'index.md'), 'utf8')
const linked = [...index.matchAll(/\]\(\/poststruct\/discussions\/(announcing-v[0-9.]+)\/?\)/g)]
  .map((m) => `${m[1]}.md`)
  .sort()
if (JSON.stringify(linked) !== JSON.stringify(files)) {
  fail(`the index must list exactly the post files, one row each, by their slash permalinks\n  index: ${linked.join(', ')}\n  files: ${files.join(', ')}`)
}

console.log(`post-permalinks self-test: ${files.length} post(s) slash-terminated, the index lists them exactly - PASS`)
