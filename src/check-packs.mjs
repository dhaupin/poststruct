// src/check-packs.mjs - the HOST side of the packstruct check profile.
//
// A check-profile pack's default export is `{ checks: [Check] }` (packstruct
// SPEC v1, section 3, and profiles/check.md). Each Check is a pure-reading
// verifier over the tree the host points it at. This module is the host side
// of that contract: it validates each Check's shape, runs it against the armed
// ctx, namespaces the findings' ids by the pack name (SPEC section 4: ids live
// in the pack-slug namespace, never the bare check id), and folds them into
// the audit's Findings accumulator.
//
// Why this file exists. The profile was declared everywhere - SPEC section 3,
// profiles/check.md, docs/packs.md, the PRD - but nothing executed it: runAudit
// ran only the built-in modules, and the pack runner (scripts/run-packs.mjs)
// only ever called `run(ctx)` verdict packs. An armed check-profile pack was
// therefore inert, a green light wired to nothing. This realizes the host side
// so `packs:` in the config actually arms a pack's checks.
//
// Check shape (host-owned; the profile fixes the envelope, this fixes the Check):
//
//   {
//     id: 'negative-echo',   // REQUIRED, kebab-case, unique within the pack
//     level: 'warn',         // OPTIONAL default 'fail' | 'warn' (default 'warn')
//     run(ctx) {             // REQUIRED, returns an array of findings
//       return [{ page, message, count?, snippet?, level? }]
//     },
//   }
//
// A check never touches the filesystem directly; it reads through ctx, so the
// host owns path safety and the profile's "no transport, no network" boundary
// holds by construction. Config level overrides ride the namespaced id for
// free, because applyOverrides runs over the merged findings afterward.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { proseOf } from './core.mjs'

const RE_KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

// The ctx every check is armed with. Absolute `dir` plus read-only tree access,
// and the prose view (`docs`) the language-shaped checks want - baked pages as
// kind 'html' and the configured source text dirs. Path safety lives here, so a
// check cannot escape the tree the host pointed it at.
export function buildCheckCtx({ dir, pages, docs }) {
  const abs = (rel) => join(dir, String(rel ?? ''))
  return {
    dir,
    pages,
    docs,
    // The extracted prose of a `docs` entry, per its kind - the same extraction
    // the language module uses, so a check sees writing, never markup.
    prose(doc) {
      if (!doc || !doc.abs || !doc.kind) return null
      try { return proseOf(doc.kind, readFileSync(doc.abs, 'utf8')) } catch { return null }
    },
    readdir(rel) {
      try { return readdirSync(abs(rel)) } catch { return [] }
    },
    exists(rel) {
      return existsSync(abs(rel))
    },
    text(rel) {
      try { return readFileSync(abs(rel), 'utf8') } catch { return null }
    },
    readBuf(rel) {
      try { return readFileSync(abs(rel)) } catch { return null }
    },
  }
}

// Run every check a loaded pack declares. Refusals are instant, one-line, and
// name the pack (SPEC section 5). Returns the number of checks run, so the
// caller can tell an inert pack from a running one.
export function runCheckPacks(packs, f, ctx) {
  let ran = 0
  for (const pack of packs) {
    const checks = pack.module?.checks
    if (!Array.isArray(checks)) continue
    const seen = new Set()
    for (const check of checks) {
      const id = check?.id
      if (typeof id !== 'string' || !RE_KEBAB.test(id)) {
        throw new Error(`pack ${pack.name}: a check id must be a kebab-case string (got ${JSON.stringify(id)})`)
      }
      if (seen.has(id)) throw new Error(`pack ${pack.name}: duplicate check id "${id}"`)
      seen.add(id)
      if (typeof check.run !== 'function') {
        throw new Error(`pack ${pack.name}: check "${id}" does not export run(ctx)`)
      }
      const namespaced = `${pack.name}/${id}`
      const defaultLevel = check.level === 'fail' ? 'fail' : 'warn'
      let findings
      try {
        findings = check.run(ctx)
      } catch (err) {
        throw new Error(`pack ${pack.name}: check "${id}" refused - ${err.message}`)
      }
      if (findings == null) continue
      if (!Array.isArray(findings)) {
        throw new Error(`pack ${pack.name}: check "${id}" run(ctx) must return an array (got ${typeof findings})`)
      }
      for (const fd of findings) {
        if (!fd || typeof fd !== 'object') {
          throw new Error(`pack ${pack.name}: check "${id}" returned a non-object finding`)
        }
        const level = fd.level === 'fail' || fd.level === 'warn' ? fd.level : defaultLevel
        const emit = level === 'fail' ? f.fail.bind(f) : f.warn.bind(f)
        const detail = {}
        if (typeof fd.count === 'number') detail.count = fd.count
        if (fd.snippet) detail.snippet = fd.snippet
        emit(fd.page ?? '', namespaced, fd.message ?? '', Object.keys(detail).length ? detail : undefined)
      }
      ran += 1
    }
  }
  return ran
}
