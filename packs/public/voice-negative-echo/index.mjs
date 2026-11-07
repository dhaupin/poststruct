// packs/public/voice-negative-echo/index.mjs - the negative-echo voice check.
//
// A check-profile pack (packstruct SPEC v1, section 3): the default export is
// `{ checks: [Check] }`. poststruct's audit lane arms it through the config
// `packs:` entry and runs each check over the prose view; the check reads the
// tree only through the ctx the host hands it, so the profile's "no transport,
// no network" boundary holds by construction.
//
// The class it catches: a negative-polarity question answered by a BARE verdict
// sentence (a lone "Yes." or "No." on its own), whose next sentence then
// restates a content word from the question. The reader parses the bare verdict
// as answering the whole question, the restated term then looks like a
// contradiction, and only a later clause resolves the garden path. The classic
// shape:
//
//   Do you only work with businesses in Pennsylvania?
//   No. We are based in NW Pennsylvania and work with clients worldwide.
//
// "No" denies the whole question, then "NW Pennsylvania" seems to take it back.
// The fix is to join the verdict to its subject ("No, we work with clients
// worldwide.") so the answer leads with the fact instead of the echo. A joined
// verdict ("No, we ...") is fine and never fires; so is a bare verdict whose
// next sentence moves on to new terms.
//
// Why a check and not core: the rule needs the Q and A PAIR, and it is a
// judgment about register, not a mechanical character ban. Core keeps the
// physics (dashes, lorem, invisible characters); the voice packs keep the
// taste. This is the first check in that family.
//
// The check reads prose ONLY through ctx.prose(doc), the host's own extraction.
// It imports nothing from the host: a pack is portable (packstruct SPEC section
// 4, interop by public surface only), so it must run against any conforming
// host's ctx without reaching into that host's tree.

export const slug = 'voice'
export const PKG = 'packs/public/voice-negative-echo'

// A verdict that stands alone as a whole sentence ("No." / "Yes!"), as opposed
// to one joined to its subject ("No, we ..."). The comma form is the fix, so it
// must never match.
const BARE_VERDICT = /^(?:yes|no)[.!?]$/i

// Negative polarity in the question: a restricting or negating marker. A plain
// "Do you build sites?" is out of scope; the garden path needs the question to
// be deniable, so the bare verdict can deny the whole thing.
const NEGATIVE_POLARITY = /\b(?:only|just|never|not|without|unless|solely|merely|nothing|nobody|none|neither|nor|hardly|barely|scarcely|no)\b|n['\u2019]t\b/i

// Words that carry no topic, so an overlap on one is not an echo. Kept short on
// purpose: the check only fires when a real content word repeats.
const STOP = new Set(('a an the and or but if then than that this these those is are was were be been being do does did doing have has had having will would can could should shall may might must you your yours we our ours us i me my mine they them their theirs it its of to in on at for with from by as so not no yes only just also very more most much many some any all each every').split(' '))

// Sentences, each keeping its terminal punctuation. The question mark is the
// anchor the whole check hangs on, so it must stay attached to its sentence.
function sentences(prose) {
  return (prose.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) || []).map((s) => s.trim()).filter(Boolean)
}

// Content words: 4+ letters, not a stopword. Length is the cheap filter that
// keeps short function words and abbreviations out of the overlap.
function contentWords(text) {
  return (text.toLowerCase().match(/[a-z][a-z'-]{2,}/g) || []).filter((w) => w.length >= 4 && !STOP.has(w))
}

// The rule, over one document's prose. Returns one hit per offending pair.
export function negativeEchoes(prose) {
  const hits = []
  const ss = sentences(prose)
  for (let i = 0; i < ss.length - 2; i++) {
    const question = ss[i]
    if (!/\?\s*$/.test(question)) continue
    if (!NEGATIVE_POLARITY.test(question)) continue
    const verdict = ss[i + 1]
    if (!BARE_VERDICT.test(verdict)) continue
    const restatement = ss[i + 2]
    const asked = new Set(contentWords(question))
    const shared = [...new Set(contentWords(restatement))].filter((w) => asked.has(w))
    if (!shared.length) continue
    hits.push({ verdict: verdict.trim(), shared, snippet: `${question} ${verdict} ${restatement}` })
  }
  return hits
}

export function run(ctx) {
  const out = []
  const docs = [...(ctx.docs || [])].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  for (const doc of docs) {
    const prose = ctx.prose(doc)
    if (!prose) continue
    for (const hit of negativeEchoes(prose)) {
      out.push({
        page: doc.path,
        message: `negative-polarity question answered by a bare "${hit.verdict}" that then restates "${hit.shared.join(', ')}" from the question`,
        count: 1,
        snippet: hit.snippet.replace(/\s+/g, ' ').trim().slice(0, 120),
      })
    }
  }
  return out
}

export default {
  slug,
  checks: [
    { id: 'negative-echo', level: 'warn', run },
  ],
}
