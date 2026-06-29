---
name: sparqling-cleanup
description: Tidy a messy SPARQL query into the house style WITHOUT changing what it means, and prove the meaning is unchanged. Use whenever you are cleaning up, reformatting, commenting, or de-duplicating a SPARQL query (e.g. the queries embedded in the api.parliament.uk procedure-browser pages) and need a repeatable methodology plus a checker that confirms the before/after pair is equivalent. Bundles the cleanup rules, a worked before/after example, and `bin/sparql-equiv.sh` — an equivalence checker using Apache Jena ARQ (canonical algebra) plus optional live-endpoint result-set comparison.
license: MIT (this skill's wrapper); Apache Jena is Apache-2.0
metadata:
  provenance:
    operator: "forgetmenot (wrapper around Apache Jena ARQ)"
    citation-short: "sparqling-cleanup skill"
    confidence: tooling
---

# SPARQL cleanup — tidy without changing meaning

A messy SPARQL query should become readable **without changing what it
computes**. This skill is the methodology + the proof tool.

The cardinal rule: **the formal meaning of the query must be unchanged.** So
split every edit into two buckets and treat them differently:

## A. Meaning-preserving edits (the checker must stay green)

These change only the *text*, never the *algebra*. Apply freely; `sparql-equiv.sh`
should report **IDENTICAL ALGEBRA** after each.

1. **Uppercase SPARQL keywords** — `PREFIX SELECT WHERE FILTER OPTIONAL UNION
   ORDER BY GROUP BY BIND VALUES DISTINCT LIMIT`. (Keywords are case-insensitive
   to the parser, so this never changes meaning.)
2. **Consistent indentation** — 2 spaces per level; one triple per line; align
   the predicate–object list under a shared subject; one space around `;` `.`.
3. **Prune PREFIX declarations** — keep only namespaces the query actually uses.
   (Removing an *unused* prefix is meaning-preserving; the checker proves it.)
4. **Delete dead whitespace** — collapse runs of blank lines; trim trailing
   spaces.
5. **Comment to explain** — `# …` lines describing each block. Comments are
   inert; they never affect meaning.
6. **Keep adaptable bits, commented out** — e.g. a date-range `FILTER` the next
   person may want — *commented*, so it stays inert until uncommented.
7. **Do NOT import another page's extra filtering** as commented cruft. If a
   sibling page has a more-filtered variant, that filtering belongs on *that*
   page, not pasted (even commented) here.

## B. Interface-changing edits (NOT meaning-preserving — coordinate first)

These change the **result shape**, so the checker *will and should* flag them.
Never apply silently:

8. **Renaming a projected variable** (incl. lower-casing a returned "data
   property", e.g. `?LegislatureName` → `?legislatureName`) renames an output
   **column**. Anything consuming the results (the getter) must be updated in
   lock-step. Expect `sparql-equiv.sh` to report a header/results difference;
   verify the *only* difference is the column name.
9. **Changing the projection** (`SELECT *` ⇄ explicit columns, adding/removing
   a variable, adding `DISTINCT`) changes results — that's a behaviour change,
   not a cleanup.

## C. Packaging (around the query, not in it)

10. Store each query as a structured record — `{ title, link, query }` — not a
    bare string; include the page/tab title in the `link`.

## The discipline

> After every edit, run the checker. For bucket-A edits the goal is **identical
> algebra** (a *proof* of equivalence). For a deliberate bucket-B edit, confirm
> the checker's only complaint is the renamed column — nothing structural.

SPARQL equivalence is undecidable in general, so the checker is two
*complementary* oracles, not one decision procedure:
- **Identical algebra ⇒ provably equivalent** (sufficient, not necessary).
- **Identical results on a real endpoint ⇒ strong evidence** (necessary on that
  data, not sufficient as proof).

## Worked example

`examples/houses-of-legislature.before.rq` (as captured from a procedure-browser
page) → `examples/houses-of-legislature.after.rq`. The cleanup applies A1–A6:
lowercases→UPPERCASES keywords, drops the unused `rdfs:` prefix, fixes
indentation, removes blank-line noise, adds comments, and keeps the `FILTER`
documented as the swap-point. Variable names are left **unchanged** (no bucket-B
edit), so it is provably equivalent:

```
$ skills/sparqling-cleanup/bin/sparql-equiv.sh \
    skills/sparqling-cleanup/examples/houses-of-legislature.before.rq \
    skills/sparqling-cleanup/examples/houses-of-legislature.after.rq \
    --endpoint https://api.parliament.uk/sparql
== algebra (Jena ARQ SSE) ==
  ✓ IDENTICAL ALGEBRA — the queries are provably equivalent.
== results @ https://api.parliament.uk/sparql ==
  ✓ IDENTICAL RESULTS (same columns + same row multiset).
  ⇒ EQUIVALENT
```

## The checker — `bin/sparql-equiv.sh`

```
sparql-equiv.sh A.rq B.rq [--endpoint URL] [--jena-version X.Y.Z]
```

- **Syntax** — parses both with Jena ARQ `qparse`; a parse error fails loud.
- **Algebra** — compiles each to the SPARQL algebra (`qparse --print=op`),
  canonicalises it (`bin/sse-canon.py`: drops the prefix prologue and expands
  prefixed names to absolute IRIs), and diffs. Robust to formatting, keyword
  case, unused/relabelled prefixes; sensitive — by design — to variable names,
  structure, projection, ordering.
- **Results** (with `--endpoint`) — runs both, canonicalises the JSON result
  sets (column list + sorted row multiset), and diffs.
- **Exit 0** iff algebra identical **or** results identical; non-zero otherwise.
- Apache Jena (~the ARQ tools) downloads once to `~/.cache/forgetmenot/` (tries
  `dlcdn.apache.org`, falls back to `archive.apache.org`). Needs `java`,
  `curl`, `python3`.

See `reference.md` for the canonicalisation details and known limits.
