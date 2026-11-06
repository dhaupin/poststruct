---
version: 1.1.0
permalink: /discussions/announcing-v1.1.0
layout: default
title: Announcing v1.1.0
nav_order: 23
description: v1.1.0 hardens the auditor's one outbound lane - the external link check refuses a private host before any socket and re-checks the host on every redirect hop.
---

# Announcing v1.1.0

poststruct is the auditor that walks the HTML that actually ships. v1.1.0 is the security round for the one lane that dials a network. The auditor is offline by default; `--check-external` is the single opt-in pass that fetches the URLs a baked tree names, and a baked tree can be attacker-influenced (a CMS field, a scraped page, a dependency's demo HTML). That made the lane a server-side request forgery primitive, and v1.1.0 closes it - twice.

## What landed

**A private host is refused before any socket.** `--check-external` classifies each URL's host literal and refuses a private, loopback, link-local, unique-local, or otherwise non-public address before the pool runs - a network-free, deterministic call. The classifier covers every spelling a parser accepts: the dotted quad, the bare 32-bit integer, octal, hex, the short dotted forms (`127.1`), IPv6, and IPv4-mapped IPv6. The shorthand encodings a naive four-octet check misses (`2130706433`, `0177.0.0.1`, `0x7f.0.0.1`) are caught too, and the v6 side classifies the host the URL parser actually yields, so `::ffff:127.0.0.1` - rewritten to `::ffff:7f00:1` - is resolved to its embedded v4 and refused. The reserved names `localhost` and `*.local` are refused by name. A refused URL is a WARN finding (`links/external-blocked`), never a silent skip, and it does not count as `checked`; `--external-allow-private` opts a tree that deliberately links an internal host back into the old behavior, and the `--json` block and CLI summary gain a `blocked` count.

**The host is re-checked on every redirect hop.** The literal guard checks the URL the lane is handed - not where the server points it. The probe used `redirect: 'follow'`, so a public URL (say `https://attacker.example/`) could answer `302 Location: http://169.254.169.254/latest/meta-data/` and the runtime would open the socket to the metadata IP before the guard ever saw the target, then report the status back in the findings. The probe now follows redirects manually, one hop at a time, resolving each `Location` against the current hop and re-running the host check on every hop; a hop that lands on a private host is a final refusal (reported by name, never retried, so a retry cannot re-open the socket), and `MAX_REDIRECTS` (5) bounds the chain.

**The docs lane is one lane.** The family built docs from four topologies and the reusable lanes had drifted (ruby 3.2 vs 3.4, pagefind `latest` scrape vs npm pin). The lane is now one canonical reusable workflow in `dhaupin/freestruct`, and this repo is a thin caller of it.

**The release ladder's `verify` job waits for `release`.** `verify` declares `needs: [publish, release]` (was a bare `needs: publish`), closing a race where it ran CONCURRENTLY with the release mint: on a fresh cut the registry read replicas had not settled and the tarball was not yet attached, so a publish that in fact succeeded failed red and needed a manual re-run (first seen on the packstruct 1.1.0 cut). The release-attach poll widened 120s -> 300s and the registry poll 120s -> 360s, and the release-lane test pins the dependency so a regression fails by name.

## Quality layer

The SSRF legs are hermetic: a classifier table, a no-socket refusal, an allow-private opt-in, and a redirect leg that drives a real loopback redirect server - so the guard is proven without ever dialing a private address. Every fix was reproduced first, then corrected, then pinned. A public name that DNS-rebinds to a private address is a separate class (TOCTOU at resolution time) a literal check cannot see; it is noted, not claimed.

## Links

- Repo and docs: https://github.com/dhaupin/poststruct / https://poststruct.creadev.org
- Changelog: https://github.com/dhaupin/poststruct/blob/main/CHANGELOG.md
- Issues: https://github.com/dhaupin/poststruct/issues
