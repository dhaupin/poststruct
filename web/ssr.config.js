/**
 * ssr.config.js - site identity + route map.
 * Fills the prestruct engine (inject-brand + prerender, via `prestruct build`)
 * with the site's SEO tags and route list. Fill the identity block once; add
 * one entry per Route in AppLayout.jsx.
 */
export default {
  siteUrl:  'https://poststruct.creadev.org',
  siteName: 'poststruct',
  author:   'dhaupin',
  tagline:  'Audit what shipped. A zero-dependency CLI that verifies the baked HTML against a head/site contract - FAIL findings exit non-zero so CI gates regressions.',
  ogImage:  'https://poststruct.creadev.org/og-image.png',
  keywords: 'poststruct, audit, seo, head-check, open-graph, json-ld, sitemap, robots, static-site, audit, baked-html, ci-check, struct-family, creadev, prerender, prestruct, cloudflare-pages',

  routes: [
    {
      path: '/',
      priority: '1.0',
      changefreq: 'monthly',
      meta: {
        title: 'poststruct - audit what shipped',
        description: 'A zero-dependency CLI that walks baked HTML and verifies head, links, and site hygiene against a contract - FAIL findings exit non-zero so CI gates regressions.',
      },
    },
    {
      path: '/why',
      priority: '0.6',
      changefreq: 'monthly',
      meta: {
        title: 'Why | poststruct',
        description: 'A page can build green and still ship broken. Why baked HTML needs an audit against a contract, with FAIL findings that exit non-zero instead of warning into green.',
      },
    },
    {
      path: '/what',
      priority: '0.6',
      changefreq: 'monthly',
      meta: {
        title: 'What | poststruct',
        description: 'One zero-dependency CLI that walks a directory of baked HTML and checks head, links, i18n, a11y-lite, language, feeds, and frontmatter against a contract. FAIL findings exit non-zero.',
      },
    },
    {
      path: '/about',
      priority: '0.5',
      changefreq: 'monthly',
      meta: {
        title: 'About | poststruct',
        description: 'Who builds poststruct, the struct family it belongs to, and the MIT license and provenance terms.',
      },
    },
    {
      path: '/packs',
      priority: '0.6',
      changefreq: 'weekly',
      meta: {
        title: 'Packs | poststruct',
        description: 'The check-profile pack catalog: eleven SPEC v1 packs that verify baked sites against their build shape, each carrying a permanent negative test so a regression is caught, not shipped.',
      },
    },
    {
      path: '/terms',
      priority: '0.3',
      changefreq: 'yearly',
      meta: {
        title: 'Terms of Use | poststruct',
        description: 'Terms of use for poststruct and this site: the auditor ships as is under MIT, runs on your own builds, and the verdicts it gates are yours.'
      },
    },
    {
      path: '/privacy',
      priority: '0.3',
      changefreq: 'yearly',
      meta: {
        title: 'Privacy | poststruct',
        description: 'What poststruct and this site collect: the CLI collects nothing, audits read your own build output, and the site tracks nothing hidden.'
      },
    },
    {
      path: '/status',
      priority: '0.5',
      changefreq: 'weekly',
      meta: {
        title: 'Live status | poststruct',
        description: 'The audit verdicts on main, read straight from the committed ledgers - the same files a fresh agent session owns. No server, no hidden state.'
      },
    },
    // add more routes per AppLayout.jsx
  ],

  // The static 404 the host serves every miss; the shape + copy match
  // pages/NotFound.jsx so the host-not-found and the hydrate-not-found read
  // as one page, not two.
  notFound: {
    heading: '404',
    body: 'That page does not exist here.',
    primaryCta: { label: 'Back home', href: '/' },
  },
}
