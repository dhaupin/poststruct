/**
 * pages/Packs.jsx - the extension surface, the human-readable face of
 * packs/public/ + the check-profile catalog. Deep grammar and authoring
 * details live in the docs packs page; the manifest grammar is the family
 * SPEC at dhaupin/packstruct.
 */
import usePageMeta from '../hooks/usePageMeta.js'

const SITE_URL = 'https://poststruct.creadev.org'
const DOCS = 'https://docs.creadev.org/poststruct'
const RAW = 'https://github.com/dhaupin/poststruct/blob/main'

export default function Packs() {
  usePageMeta({
    siteUrl: SITE_URL,
    path: '/packs',
    title: 'Packs | poststruct',
    description:
      'The check-profile pack catalog: eleven SPEC v1 packs that verify baked sites against their build shape, each with a permanent negative test - good bake clean, every bad bake hits exactly its expected id.',
  })
  return (
    <>
      <section className="hero">
        <div className="wrap">
          <p className="eyebrow">packs</p>
          <h1>
            Check what shipped, <span className="accent">per build shape.</span>
          </h1>
          <p className="lede">
            A pack is a self-contained bundle of pure-reading verifiers over
            files on disk - no transport, no mocks. poststruct ships the
            family's check profile: each pack knows the head and routing sins
            one build shape reliably produces, and each carries a permanent
            negative test.
          </p>
          <div className="cta-row">
            <a className="btn btn-primary" href={`${DOCS}/packs/`}>Full pack grammar</a>
            <a className="btn btn-ghost" href="#shipped">What ships today</a>
            <a className="btn btn-ghost" href={`${RAW}/packs/public`}>packs/public/</a>
          </div>
        </div>
      </section>

      <section className="section" id="shipped">
        <div className="wrap">
          <h2>The packs, live</h2>
          <p className="sub">
            Eleven SPEC v1 check-profile packs under <code>packs/public/</code>,
            each a declarative verifier over files on disk. Lint the manifest
            grammar with <code>npx packstruct lint packs/</code>; run a pack
            through the audit lane with <code>poststruct lint-packs --deep</code>.
          </p>
          <div className="table-wrap">
            <table className="attacks">
              <thead>
                <tr><th>pack</th><th>what it verifies</th><th>verdict</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td className="mod">eyes-reference</td>
                  <td><span className="what">the eye companion</span>
                  <div className="why">every og/twitter image a baked page
                  declares must be real pixels the scrapers see</div></td>
                  <td><span className="passed">PASS</span></td>
                </tr>
                <tr>
                  <td className="mod">prestruct-shapes</td>
                  <td><span className="what">the engine's own contract</span>
                  <div className="why">the SSR marker on every app mount, one
                  deploy-id across the tree, og:url in step with rel=canonical,
                  no shell placeholder surviving the inject pass</div></td>
                  <td><span className="passed">PASS</span></td>
                </tr>
                <tr>
                  <td className="mod">freestruct-shapes</td>
                  <td><span className="what">the docs layer's contract</span>
                  <div className="why">one build hash across the tree and on
                  every cache-bust param, no head tag doubled by a rebuild,
                  canonicals absolute on one origin, the 404 noindex contract</div></td>
                  <td><span className="passed">PASS</span></td>
                </tr>
                <tr>
                  <td className="mod">eyestruct-shapes</td>
                  <td><span className="what">an eyestruct-shaped lab's .eyes
                  canon tree</span><div className="why">ledger honesty,
                  dangling rows, the manifest pin + route matrix, verdict
                  coverage, receipt provenance</div></td>
                  <td><span className="passed">PASS</span></td>
                </tr>
                <tr>
                  <td className="mod">jekyll-shapes</td>
                  <td><span className="what">the Jekyll ecosystem shape</span>
                  <div className="why">excerpt-as-description via
                  jekyll-seo-tag, head tags doubled by hand meta, hreflang
                  links pointing at unbuilt language siblings</div></td>
                  <td><span className="passed">PASS</span></td>
                </tr>
                <tr>
                  <td className="mod">wp-seo-shapes</td>
                  <td><span className="what">the WordPress ecosystem shape</span>
                  <div className="why">an SEO plugin and a theme both emitting
                  head SEO so description / og:title / the JSON-LD graph ship
                  twice, attachment pages inheriting the front canonical</div></td>
                  <td><span className="passed">PASS</span></td>
                </tr>
                <tr>
                  <td className="mod">astro-shapes</td>
                  <td><span className="what">a site baked by Astro</span>
                  <div className="why">the head and routing sins the Astro
                  build shape reliably produces</div></td>
                  <td><span className="passed">PASS</span></td>
                </tr>
                <tr>
                  <td className="mod">eleventy-shapes</td>
                  <td><span className="what">a site baked by Eleventy</span>
                  <div className="why">the URL and collection sins the 11ty
                  build shape reliably produces</div></td>
                  <td><span className="passed">PASS</span></td>
                </tr>
                <tr>
                  <td className="mod">gatsby-shapes</td>
                  <td><span className="what">a site baked by Gatsby</span>
                  <div className="why">the head and indexing sins the Gatsby
                  build shape reliably produces</div></td>
                  <td><span className="passed">PASS</span></td>
                </tr>
                <tr>
                  <td className="mod">hugo-shapes</td>
                  <td><span className="what">a site baked by Hugo</span>
                  <div className="why">the head and taxonomy sins the Hugo
                  build shape reliably produces</div></td>
                  <td><span className="passed">PASS</span></td>
                </tr>
                <tr>
                  <td className="mod">shopify-liquid-shapes</td>
                  <td><span className="what">a Shopify storefront via Liquid</span>
                  <div className="why">the head and pagination sins the Liquid
                  render reliably produces</div></td>
                  <td><span className="passed">PASS</span></td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="sub">
            Each pack ships a permanent negative test: a good bake comes clean,
            every bad bake hits exactly its expected id, and an absent tree
            dockets BOUNDED rather than a fabricated pass. The ledger rides
            <code> packs/eye-ledger.json</code>.
          </p>
        </div>
      </section>

      <section className="section" id="taxonomy">
        <div className="wrap">
          <h2>The verdict taxonomy</h2>
          <p className="sub">
            Every scenario lands in exactly one of four buckets. Adoption is
            explicit - a new verdict only enters the ledger through a reviewed
            commit, never a silent rebuild.
          </p>
          <div className="grid">
            <div className="card">
              <h3><span className="passed">REFUSED</span></h3>
              <p>The surface said no, cleanly, with its named code. A
              regression here is loud, not quiet.</p>
            </div>
            <div className="card">
              <h3><span className="passed">BOUNDED</span></h3>
              <p>The damage was contained to a documented limit - a byte cap,
              a fixture lifespan. Bounds live in the ledger, not in prose.</p>
            </div>
            <div className="card">
              <h3><span className="passed">PASSED</span></h3>
              <p>The safe path works end to end: checks, gates, roundtrips.</p>
            </div>
            <div className="card">
              <h3><span className="failed">FAILED</span></h3>
              <p>A check that should have caught the bad bake did not. A new
              FAILED or the regression of any recorded row fails CI.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="running">
        <div className="wrap">
          <h2>Running the lane</h2>
          <p className="sub">
            The audit lane reads each pack's declared checks over the tree.
            Exit 0 on green, 1 on findings.
          </p>
          <pre className="code"><span className="cm"># run every pack over the repo</span>{'\n'}<span className="k">npm</span> run packs{'\n\n'}<span className="cm"># manifest + entry + id-census grammar (packstruct)</span>{'\n'}<span className="k">npm</span> run lint:packs{'\n\n'}<span className="cm"># conformance audit against the family runner shape</span>{'\n'}<span className="k">npm</span> run conform:packs</pre>
          <div className="cta-row">
            <a className="btn btn-primary" href={`${DOCS}/packs/`}>Write a pack</a>
            <a className="btn btn-ghost" href="/status">See the live verdicts</a>
            <a className="btn btn-ghost" href="https://github.com/dhaupin/packstruct">packstruct</a>
          </div>
        </div>
      </section>
    </>
  )
}
