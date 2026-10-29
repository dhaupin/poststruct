// test/language-run.mjs - the language module and its text-shaped input profile
// (issue#7). Fixtures are scaffolded into a temp dir at run time (zero committed
// bytes). Real code paths only: runAudit walks real files, proseOf extracts real
// prose per kind, and the language module grades it.
//
// The determinism contract (issue#7 req 5) is pinned too: two runs over one tree
// produce identical findings in identical order.
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runAudit } from '../src/index.mjs'

const fail = (m) => { console.error(`FAIL language: ${m}`); process.exit(1) }
const dirs = []
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'ps-lang-')); dirs.push(d); return d }
const write = (d, p, body) => { const full = join(d, p); mkdirSync(join(full, '..'), { recursive: true }); writeFileSync(full, body) }
// A baked page that clears the other modules, so language findings are the only
// ones and there is no cross-module bleed. Pass extra body prose.
const HTML = (prose) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Fixture Page Title Here</title><meta name="description" content="A fixture description that sits inside the seventy to one hundred and sixty five character band so it does not warn."><link rel="canonical" href="https://example.com/"></head><body><a href="#main">Skip</a><main id="main"><h1>Fixture</h1><p>${prose}</p></main></body></html>`
const ids = (r, level) => r.findings.filter((x) => x.level === level).map((x) => x.id)
// A tree with one baked page and a config that points the text profile at `src`.
const treeWithText = (htmlProse, textFiles, language) => {
  const d = tmp()
  write(d, 'dist/index.html', HTML(htmlProse))
  for (const [p, body] of Object.entries(textFiles)) write(d, p, body)
  write(d, 'poststruct.config.json', JSON.stringify({ language }))
  return d
}

try {
  // Clean prose is silent on every language check.
  {
    const d = treeWithText('Plain declarative sentences only here.', { 'src/note.md': 'A plain note with no tells.\n' }, { textDirs: ['src'] })
    const r = await runAudit(join(d, 'dist'), { module: 'language', cwd: d })
    if (r.findings.length) fail(`clean prose must be silent, got ${JSON.stringify(r.findings)}`)
  }

  // Dash classes: an em dash and an en dash both FAIL, with count + snippet.
  {
    const d = treeWithText('An em\u2014dash and an en\u2013dash in the body.', {}, { textDirs: [] })
    const r = await runAudit(join(d, 'dist'), { module: 'language', cwd: d })
    const dash = r.findings.filter((x) => x.id === 'language/dash-class')
    if (dash.length !== 2) fail(`em + en dash must each FAIL dash-class, got ${dash.length}`)
    if (!dash.every((x) => typeof x.count === 'number' && x.snippet)) fail('dash findings must carry count + snippet')
  }
  // A config can allow a dash class (physics by default, tunable).
  {
    const d = treeWithText('An en\u2013dash the project allows.', {}, { dashClasses: { 'em-dash': '\\u2014' } })
    const r = await runAudit(join(d, 'dist'), { module: 'language', cwd: d })
    if (ids(r, 'fail').includes('language/dash-class')) fail('an allowed dash class must not fire')
  }

  // Cliche lexicon WARNs and carries the tell label + snippet.
  {
    const d = treeWithText('We delve into the tapestry of ideas.', {}, {})
    const r = await runAudit(join(d, 'dist'), { module: 'language', cwd: d })
    const cl = r.findings.filter((x) => x.id === 'language/cliche')
    if (cl.length !== 2) fail(`"delve" + "tapestry" must each WARN cliche, got ${cl.length}`)
    if (!cl.every((x) => x.snippet)) fail('cliche findings must carry a snippet')
  }

  // Lorem ipsum FAILs.
  {
    const d = treeWithText('Lorem ipsum dolor sit amet, consectetur.', {}, {})
    const r = await runAudit(join(d, 'dist'), { module: 'language', cwd: d })
    if (!ids(r, 'fail').includes('language/lorem')) fail('lorem ipsum must FAIL')
  }

  // Whitespace disasters WARN: a non-breaking space and a zero-width char.
  {
    const d = treeWithText('A\u00a0non-breaking space here.', { 'src/ws.md': 'A zero\u200bwidth character.\n' }, { textDirs: ['src'] })
    const r = await runAudit(join(d, 'dist'), { module: 'language', cwd: d })
    const ws = r.findings.filter((x) => x.id === 'language/whitespace')
    if (ws.length !== 2) fail(`nbsp + zero-width must each WARN whitespace, got ${ws.length}`)
  }

  // Banned terms: silent until configured; the config level decides fail vs warn.
  {
    const quiet = treeWithText('A sentence with the word foobar in it.', {}, {})
    const rq = await runAudit(join(quiet, 'dist'), { module: 'language', cwd: quiet })
    if (rq.findings.some((x) => x.id === 'language/banned-term')) fail('banned terms must be silent until configured')
    const d = treeWithText('A sentence with the word foobar in it.', {}, { bannedTerms: [{ term: 'foobar', level: 'fail' }] })
    const r = await runAudit(join(d, 'dist'), { module: 'language', cwd: d })
    if (!ids(r, 'fail').includes('language/banned-term')) fail('a configured fail-term must FAIL')
  }

  // Text profile: markdown, YAML values, JSON string values, plain text, and a
  // second HTML page all get graded - not only the baked HTML.
  {
    const files = {
      'src/a.md': 'Body prose with an em\u2014dash.\n\n```\ncode with an em\u2014dash is literal\n```\n',
      'src/b.yml': 'title: A value with an em\u2014dash\n# comment with an em\u2014dash\n',
      'src/c.json': '{"note": "a string with an em\u2014dash"}\n',
      'src/d.txt': 'plain text with an em\u2014dash\n',
    }
    const d = treeWithText('clean body', files, { textDirs: ['src'] })
    const r = await runAudit(join(d, 'dist'), { module: 'language', cwd: d })
    const pages = new Set(r.findings.filter((x) => x.id === 'language/dash-class').map((x) => x.page))
    for (const p of ['src/a.md', 'src/b.yml', 'src/c.json', 'src/d.txt']) {
      if (!pages.has(p)) fail(`the ${p} prose must be graded (text profile), pages seen: ${[...pages]}`)
    }
    // The fenced code block's dash is literal data, so a.md reports exactly one.
    const md = r.findings.find((x) => x.id === 'language/dash-class' && x.page === 'src/a.md')
    if (md.count !== 1) fail(`markdown code fence must be excluded, a.md count was ${md.count}`)
  }

  // Frontmatter: malformed block FAILs; a well-formed block is stripped so its
  // delimiters are not read as writing.
  {
    const bad = treeWithText('clean', { 'src/broken.md': '---\ntitle: x\nno closing delimiter\n' }, { textDirs: ['src'] })
    const rb = await runAudit(join(bad, 'dist'), { module: 'language', cwd: bad })
    if (!ids(rb, 'fail').includes('language/frontmatter-unparsed')) fail('an unclosed frontmatter block must FAIL')
    const good = treeWithText('clean', { 'src/ok.md': '---\ntitle: A page\ndescription: A description\n---\nBody text.\n' }, { textDirs: ['src'] })
    const rg = await runAudit(join(good, 'dist'), { module: 'language', cwd: good })
    if (rg.findings.some((x) => x.id === 'language/frontmatter-unparsed')) fail('a well-formed frontmatter block must not FAIL')
  }

  // Determinism (issue#7 req 5): two runs, identical findings and order.
  {
    const d = treeWithText('We delve\u2014here.', { 'src/z.md': 'A tapestry\u2013note.\n', 'src/a.md': 'Lorem ipsum.\n' }, { textDirs: ['src'] })
    const a = await runAudit(join(d, 'dist'), { module: 'language', cwd: d })
    const b = await runAudit(join(d, 'dist'), { module: 'language', cwd: d })
    if (JSON.stringify(a.findings) !== JSON.stringify(b.findings)) fail('two runs must be byte-identical (determinism)')
  }

  console.log('language self-test: text profile (md/yaml/json/txt/html) + dashes + cliche + banned + lorem + whitespace + frontmatter + determinism - PASS')
} finally {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
}
