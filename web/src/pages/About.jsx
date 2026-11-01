/**
 * pages/About.jsx - who builds poststruct, the family it belongs to, and the
 * license and provenance terms. The legal pages carry the surface facts.
 */
import { Link } from 'react-router-dom'
import usePageMeta from '../hooks/usePageMeta.js'

const SITE_URL = 'https://poststruct.creadev.org'

export default function About() {
  usePageMeta({
    siteUrl: SITE_URL,
    path: '/about',
    title: 'About | poststruct',
    description:
      'Who builds poststruct, the struct family it belongs to, and the MIT license and provenance terms.',
  })
  return (
    <>
      <section className="hero">
        <div className="wrap">
          <p className="eyebrow">about</p>
          <h1>
            Built in the open, <span className="accent">maintained by receipts.</span>
          </h1>
          <p className="lede">
            poststruct is one arm of the struct family: a set of small,
            zero-dependency tools that keep a suite of repos honest about
            itself. It is authored and maintained in public.
          </p>
          <div className="cta-row">
            <a className="btn btn-primary" href="https://github.com/dhaupin/poststruct">See the repo</a>
            <a className="btn btn-ghost" href="https://docs.creadev.org/poststruct/">Read the docs</a>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <h2 className="section-title">Who builds it</h2>
          <p className="lede" style={{ marginTop: 8 }}>
            poststruct is built by{' '}
            <a href="https://creadev.org" target="_blank" rel="noopener">Rook @ Creadev.org</a>{' '}
            and by AI agents working in the open. Every change lands through a
            pull request with its gates run, and the repo history keeps the
            receipts.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <h2 className="section-title">The struct family</h2>
          <p className="lede" style={{ marginTop: 8 }}>
            poststruct does not stand alone. The spec is{' '}
            <a href="https://github.com/dhaupin/packstruct">packstruct</a>; the
            adversarial lane is{' '}
            <a href="https://github.com/dhaupin/crashtest">crashtest</a>; the
            visual memory is{' '}
            <a href="https://github.com/dhaupin/eyestruct">eyestruct</a>; the
            governance layer is{' '}
            <a href="https://github.com/dhaupin/govstruct">govstruct</a>; the
            factory is{' '}
            <a href="https://github.com/dhaupin/monoforge">monoforge</a>. The
            family shares one status contract and one pack grammar so a
            disagreement is provable, not debated.
          </p>
          <p style={{ marginTop: 22 }}>
            <Link to="/status" className="btn btn-ghost">See the family status</Link>
          </p>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <h2 className="section-title">License and provenance</h2>
          <p className="lede" style={{ marginTop: 8 }}>
            poststruct is MIT-licensed. The tool and the site are both open
            source, so the honest summary is: read the code. The{' '}
            <Link to="/terms">terms</Link> and <Link to="/privacy">privacy</Link>{' '}
            pages carry the surface facts in plain language.
          </p>
        </div>
      </section>
    </>
  )
}
