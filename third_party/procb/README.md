# `third_party/procb/` — procedure-browser SPARQL query library (mirror + cleanup)

A **read-only mirror** of the 130 SPARQL queries in
[`ukparliament/procedure-browser/lib/sparql/queries/`](https://github.com/ukparliament/procedure-browser/tree/main/lib/sparql/queries),
plus a house-style cleanup of each, verified meaning-preserving.

We have no write access to that repo, so this is a local working copy — **no PRs**.

## Layout

| Path | What |
|---|---|
| `extract.py` | Fetches the 130 `*.rb` query wrappers, pulls the SPARQL out of each `[title, link, query]` array → `queries/<name>.before.rq`, writes `manifest.json`. |
| `queries/<name>.before.rq` | The query verbatim from the repo (the "before"). |
| `queries/<name>.after.rq` | House-style cleaned (uppercase keywords, prune unused prefixes, consistent indentation, lower-camelCase variables per checklist rule 6). |
| `manifest.json` | Per query: title, link, source URL, classification + why. |
| `getter-deltas.json` | Per query whose returned variables were renamed: the getter file (`lib/sparql/get/<name>.rb`) and the `row['Old'] → row['new']` search/replace needed there. |

## Equivalence

Cleanups follow the [`sparqling-cleanup`](../../skills/sparqling-cleanup/SKILL.md)
methodology. Because rule 6 lower-cases **returned** variables (renaming result
columns), strict column-identical equivalence does not hold; instead each pair
is verified **α-equivalent** (rename-insensitive): same query up to a consistent
variable renaming. The column renames are logged in `getter-deltas.json` so the
getters can be updated in lock-step later.
