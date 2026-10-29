// src/checks/a11y.mjs - the a11y-lite module (PRD M2).
//
// Deliberately lite, and deliberately honest about what it can and cannot know.
// This is the oldest trap in automated accessibility: "is this image
// informative or decorative" is a CONTEXT question, and a file reader has no
// context. So the policy is stated, conservative, and never dressed up as a
// conformance claim:
//
//   - an <img> with NO alt attribute at all is the mechanical failure - the
//     author never made the decision, so it is a FAIL
//   - alt="" is RESPECTED as the explicit decorative choice (a real signal,
//     not an omission) and passes
//   - alt=" " (whitespace only) is treated as an omission, because it reads as
//     a slip rather than a decision
//
// The rest of the module is the small set of mechanical, non-contextual
// failures every baked page should clear:
//
//   a11y/img-alt-missing    an <img> with no alt (or whitespace-only) - FAIL
//   a11y/form-label-missing an <input>/<select>/<textarea> with no label: no
//                           <label for>, not wrapped in a <label>, and no
//                           aria-label/aria-labelledby (submit/hidden/button
//                           inputs are exempt) - FAIL
//   a11y/viewport-missing   no viewport meta, so the page renders unzoomed on
//                           mobile - FAIL
//   a11y/skip-link-absent   no in-page skip link to main content - WARN
//
// The policy note travels with the finding, so a human reviewing it knows
// exactly what was and was not claimed.
import { readFileSync } from 'node:fs'

const ENTITIES = { '&amp;': '&', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&lt;': '<', '&gt;': '>' }
const decode = (s) => s.replace(/&(?:amp|quot|#39|apos|lt|gt);/g, (m) => ENTITIES[m] || m)

const IMG_RE = /<img\b[^>]*>/gi
const INPUT_RE = /<(input|select|textarea)\b[^>]*>/gi
const ATTR = (tag, name) => {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'))
  return m ? m[1] : null
}
// A tag has the attribute even when its value is empty ('<img alt>' or alt="").
const HAS_ATTR = (tag, name) => new RegExp(`\\b${name}\\b`, 'i').test(tag)

// A control's own id, so we can look for a <label for="..."> elsewhere.
const CONTROL_ID = (tag) => ATTR(tag, 'id')

export function auditA11y(pageModel, f, opts = {}) {
  const { html, head, page } = pageModel
  const body = html.split('</head>')[1] || html

  // --- images ---
  for (const m of html.matchAll(IMG_RE)) {
    const tag = m[0]
    const role = (ATTR(tag, 'role') || '').toLowerCase()
    // role="presentation"/"none" is an explicit decorative claim, same posture
    // as alt="": respected, not flagged.
    if (role === 'presentation' || role === 'none') continue
    if (!HAS_ATTR(tag, 'alt')) {
      f.fail(page, 'a11y/img-alt-missing', 'an <img> has no alt attribute - decorative images need alt="" explicitly, informative ones need text')
      continue
    }
    const alt = decode(ATTR(tag, 'alt') ?? '')
    if (alt !== '' && alt.trim() === '') {
      f.fail(page, 'a11y/img-alt-missing', 'an <img> has a whitespace-only alt - use alt="" for decorative or real text for informative')
    }
  }

  // --- form controls ---
  for (const m of body.matchAll(INPUT_RE)) {
    const tag = m[0]
    const kind = m[1].toLowerCase()
    const type = (ATTR(tag, 'type') || '').toLowerCase()
    // Controls that carry their own accessible name or need none.
    if (kind === 'input' && ['submit', 'button', 'reset', 'hidden', 'image'].includes(type)) continue
    if (HAS_ATTR(tag, 'aria-label') || HAS_ATTR(tag, 'aria-labelledby') || HAS_ATTR(tag, 'title')) continue
    const id = CONTROL_ID(tag)
    if (id && new RegExp(`<label\\b[^>]*\\bfor\\s*=\\s*["']${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'i').test(body)) continue
    // A control wrapped in its own <label>...</label> is labelled implicitly.
    if (isWrappedInLabel(body, m.index)) continue
    f.fail(page, 'a11y/form-label-missing', `a <${kind}${type ? ` type="${type}"` : ''}> has no associated label (no <label for>, no wrapping <label>, no aria-label)`)
  }

  // --- viewport ---
  const viewport = head.match(/<meta\b[^>]*\bname\s*=\s*["']viewport["']/i)
  if (!viewport) f.fail(page, 'a11y/viewport-missing', 'no <meta name="viewport"> - the page will not scale on mobile')

  // --- skip link ---
  // An in-page anchor to a main-content target near the top of the body. The
  // target is a #fragment that resolves to an element with that id.
  const skip = body.match(/<a\b[^>]*\bhref\s*=\s*["']#([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i)
  const skipOk = skip && new RegExp(`\\bid\\s*=\\s*["']${skip[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'i').test(html)
  if (!skipOk) f.warn(page, 'a11y/skip-link-absent', 'no in-page skip link to main content')
}

// Is the control at `index` inside a <label>...</label>? A cheap backwards scan
// to the nearest unclosed <label> vs </label>, which is enough for baked HTML
// (no parser needed, per the zero-dep discipline).
function isWrappedInLabel(body, index) {
  const before = body.slice(0, index)
  const open = before.lastIndexOf('<label')
  if (open < 0) return false
  const close = before.lastIndexOf('</label>')
  return open > close
}
