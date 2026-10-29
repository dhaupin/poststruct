/**
 * pages/Status.jsx - the live committed-ledger status page, plus the family
 * table. Same honest-data rule as the family dialect: the island fetches the
 * siblings' served /status.json at load, no server, no guessed numbers.
 * Refresh to re-read. poststruct's own row is served from its own generated
 * /status.json, which this page also links.
 */
import usePageMeta from '../hooks/usePageMeta.js'

const SITE_URL = 'https://poststruct.creadev.org'
const RAW = 'https://github.com/dhaupin/poststruct/blob/main'
const DOCS = 'https://docs.creadev.org/poststruct'

export default function Status() {
  usePageMeta({
    siteUrl: SITE_URL,
    path: '/status',
    title: 'Live status | poststruct',
    description: 'The audit verdicts on main, read straight from the committed ledgers - the same files a fresh agent session owns. No server, no hidden state.',
  })
  return (
    <>
      <section className="hero">
        <div className="wrap">
          <p className="eyebrow">status</p>
          <h1>
            The committed memory, <span className="accent">live.</span>
          </h1>
          <p className="lede">
            poststruct serves its own verdicts at{' '}
            <code>/status.json</code>, generated from the committed ledgers on
            every web build. This page reads its own file and the family's,
            the way a fresh agent session would - no server, no numbers
            fresher than the commits. Refresh to re-read.
          </p>
          <div className="cta-row">
            <a className="btn btn-ghost" href="/status.json">/status.json</a>
            <a className="btn btn-ghost" href={`${RAW}/packs/eye-ledger.json`}>packs/eye-ledger.json</a>
            <a className="btn btn-ghost" href={`${RAW}/labs/battery.json`}>labs/battery.json</a>
            <a className="btn btn-ghost" href="https://github.com/dhaupin/poststruct/actions/workflows/test.yml">CI runs</a>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <h2>What you are looking at</h2>
          <p className="sub">
            Each number is a receipt from a CI leg, not a marketing claim.
          </p>
          <div className="grid">
            <div className="card">
              <h3><span className="glyph">◉</span> the pack campaign</h3>
              <p>The committed verdict ledger (<code>packs/eye-ledger.json</code>):
              every pack's check rows over the tree the campaign fires at. A
              new EXPLOITED fails CI; a verdict change fails until re-baselined.</p>
            </div>
            <div className="card">
              <h3><span className="glyph">⇄</span> the audit battery</h3>
              <p>The fixture corpus's refusal contract
              (<code>labs/battery.json</code>): the exact FAIL ids the bad
              fixture must produce. The same list test/run.mjs reconciles
              against on every push.</p>
            </div>
            <div className="card">
              <h3><span className="glyph">✗</span> packs shipped</h3>
              <p>The packstruct@1 packs this repo exports. Every committed
              manifest must carry ledger rows - a pack the campaign never
              fires is refused, never served as zero.</p>
            </div>
            <div className="card">
              <h3><span className="glyph">✓</span> exploited, ever</h3>
              <p>The only number that should always read 0. If it does not,
              the next CI run is red and the fix comes before any release
              post cites these ledgers again.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <h2>The family, one dialect</h2>
          <p className="sub">
            Four repos serve the same status contract: one schema, one fixed
            path, ledger-derived numbers only.
          </p>
          <pre-island data-pre-island="family-status" data-pre-load="idle">
            <span className="island-loading">Reading the family's served status files...</span>
          </pre-island>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <h2>When it goes red</h2>
          <p className="sub">
            A red gate names its artifact and reason-code. The triage map
            lives in the docs: which leg failed, what the row means, and the
            mechanical fix.
          </p>
          <div className="cta-row">
            <a className="btn btn-primary" href={`${DOCS}/ci/`}>CI guide</a>
            <a className="btn btn-ghost" href={`${DOCS}/checks/`}>Check catalog</a>
            <a className="btn btn-ghost" href={`${DOCS}/packs/`}>Packs</a>
          </div>
        </div>
      </section>
    </>
  )
}
