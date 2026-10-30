/**
 * pages/What.jsx - the concrete surface: the CLI, the check catalog, and the
 * findings contract. Deep reference lives in docs/checks.md and docs/cli.md.
 */
import { Link } from 'react-router-dom'
import usePageMeta from '../hooks/usePageMeta.js'

const SITE_URL = 'https://poststruct.creadev.org'

export default function What() {
  usePageMeta({
    siteUrl: SITE_URL,
    path: '/what',
    title: 'What | poststruct',
    description:
      'One zero-dependency CLI that walks a directory of baked HTML and checks head, links, i18n, a11y-lite, language, feeds, and frontmatter against a contract. FAIL findings exit non-zero.',
  })
  return (
    <>
      <section className="hero">
        <div className="wrap">
          <p className="eyebrow">what</p>
          <h1>
            One CLI, <span className="accent">a catalog of checks.</span>
          </h1>
          <p className="lede">
            poststruct is a zero-dependency CLI. Point it at a baked tree, and it
            verifies the output against a contract you can read and edit.
          </p>
          <div className="cta-row">
            <Link className="btn btn-primary" to="/packs">The pack surface</Link>
            <a className="btn btn-ghost" href="https://docs.creadev.org/poststruct/checks/">Check catalog</a>
            <a className="btn btn-ghost" href="https://github.com/dhaupin/poststruct">See the repo</a>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <h2 className="section-title">The verbs</h2>
          <p className="lede" style={{ marginTop: 8 }}>
            Init a contract, audit a tree, read the report.
          </p>
          <pre className="code"><span className="cm"># write a contract + empty report ledger</span>{'\n'}<span className="k">poststruct</span> <span className="k">init</span>{'\n'}{'\n'}<span className="cm"># walk the baked tree against the contract</span>{'\n'}<span className="k">poststruct</span> <span className="k">audit</span> ./dist{'\n'}{'\n'}<span className="cm"># CI: exit non-zero on the FAIL class</span>{'\n'}<span className="k">poststruct</span> <span className="k">gate</span></pre>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <h2 className="section-title">The check catalog</h2>
          <p className="lede" style={{ marginTop: 8 }}>
            Every check is one module: head, site, links, i18n, a11y-lite,
            language, feeds, frontmatter. Each is individually disableable, and
            each is scoped to the file-on-disk contract.
          </p>
          <p className="lede" style={{ marginTop: 8 }}>
            Findings carry a severity, and the FAIL class sets the exit code, so
            the audit is a gate rather than a report. A project tunes the live
            set by naming checks in the contract, not by hoping.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <h2 className="section-title">Where it sits</h2>
          <p className="lede" style={{ marginTop: 8 }}>
            poststruct is the artifact-audit arm of the struct family: it reads
            what the other members bake. Its blocks are the proven templates{' '}
            <a href="https://github.com/dhaupin/monoforge">monoforge</a> stamps
            from, and its packs ride the same grammar as{' '}
            <a href="https://github.com/dhaupin/crashtest">crashtest</a>.
          </p>
          <p style={{ marginTop: 22 }}>
            <Link to="/about" className="btn btn-ghost">Next: about the project</Link>
          </p>
        </div>
      </section>
    </>
  )
}
