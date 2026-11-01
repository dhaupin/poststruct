/**
 * pages/Why.jsx - why poststruct exists: a page can build green and still
 * ship broken. Shell conventions kept (usePageMeta in the component body).
 */
import { Link } from 'react-router-dom'
import usePageMeta from '../hooks/usePageMeta.js'

const SITE_URL = 'https://poststruct.creadev.org'

export default function Why() {
  usePageMeta({
    siteUrl: SITE_URL,
    path: '/why',
    title: 'Why | poststruct',
    description:
      'A page can build green and still ship broken. Why baked HTML needs an audit against a contract, with FAIL findings that exit non-zero instead of warning into green.',
  })
  return (
    <>
      <section className="hero">
        <div className="wrap">
          <p className="eyebrow">why</p>
          <h1>
            Green build, <span className="accent">broken page.</span>
          </h1>
          <p className="lede">
            A static site generator will happily ship a page with a missing
            title, a dead canonical, a broken link, and no description. The
            build passes because nothing looked at the output. poststruct looks.
          </p>
          <div className="cta-row">
            <Link className="btn btn-primary" to="/what">What poststruct is</Link>
            <a className="btn btn-ghost" href="https://docs.creadev.org/poststruct/">Read the docs</a>
            <a className="btn btn-ghost" href="https://github.com/dhaupin/poststruct">See the repo</a>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <h2 className="section-title">The problem: nothing audits the output</h2>
          <p className="lede" style={{ marginTop: 8 }}>
            Every generator tests its inputs. Almost none audits what it wrote
            to disk. The gap is the whole class of bug that ships: the tag that
            never rendered, the relative link that resolved to a 404, the feed
            that points at a URL the host does not serve.
          </p>
          <p className="lede" style={{ marginTop: 8 }}>
            The fix is an audit that reads the baked tree the way a crawler
            would: every page, every link, every head field, checked against a
            contract that lives in the repo. The output is the input.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <h2 className="section-title">The thesis: findings that fail, not warn</h2>
          <p className="lede" style={{ marginTop: 8 }}>
            An audit that warns is an audit nobody reads. poststruct classifies
            every finding and exits non-zero on the FAIL class, so a regression
            stops the merge instead of landing in a log. A check that cannot
            fail is not a check.
          </p>
          <p className="lede" style={{ marginTop: 8 }}>
            The contract is explicit and per-check disableable. A project turns
            a check off by naming it, so the set of live checks is a decision on
            record, not a default nobody chose.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <h2 className="section-title">Who it is for</h2>
          <p className="lede" style={{ marginTop: 8 }}>
            Anyone shipping baked HTML: the docs site that must not deploy a
            broken canonical, the marketing page that must not ship a dead link,
            and the CI that has to prove the output is as good as the source.
          </p>
          <p style={{ marginTop: 22 }}>
            <Link to="/what" className="btn btn-ghost">Next: what poststruct is</Link>
          </p>
        </div>
      </section>
    </>
  )
}
