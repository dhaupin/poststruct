---
title: "Why poststruct"
description: "A page can build green and still ship broken. Why baked HTML needs an audit against a contract, with FAIL findings that exit non-zero instead of warning into green."
author: "Creadev.org"
lang: "en"
date: 2026-10-29
last_modified_at: 2026-10-29
nav_order: 7
layout: default
version: 0.9.0
permalink: /why
---

# Why poststruct

A static site generator will happily ship a page with a missing title, a dead
canonical, a broken link, and no description. The build passes because nothing
looked at the output. poststruct looks.

## The problem: nothing audits the output

Every generator tests its inputs. Almost none audits what it wrote to disk. The
gap is the whole class of bug that ships: the tag that never rendered, the
relative link that resolved to a 404, the feed that points at a URL the host
does not serve.

The fix is an audit that reads the baked tree the way a crawler would: every
page, every link, every head field, checked against a contract that lives in
the repo. The output is the input.

## The thesis: findings that fail, not warn

An audit that warns is an audit nobody reads. poststruct classifies every
finding and exits non-zero on the FAIL class, so a regression stops the merge
instead of landing in a log. A check that cannot fail is not a check.

The contract is explicit and per-check disableable. A project turns a check off
by naming it, so the set of live checks is a decision on record, not a default
nobody chose.

## Who it is for

Anyone shipping baked HTML: the docs site that must not deploy a broken
canonical, the marketing page that must not ship a dead link, and the CI that
has to prove the output is as good as the source.

<div class="crosslinks">
<p><strong>Next:</strong>
<a href="{{ '/what/' | relative_url }}">what poststruct is</a> ·
<a href="{{ '/about/' | relative_url }}">about the project</a></p>
</div>
