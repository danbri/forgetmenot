# Worked application of the `sparqling-cleanup` skill

The skill (`skills/sparqling-cleanup/`) applied to a real messy query captured
from the Trello card — the procedure-step COUNT query on the Northern Ireland
Assembly procedure-browser page. Chosen because it is non-trivial: an aggregate
(`COUNT … AS`), `GROUP BY`, and an `OPTIONAL`.

| File | What |
|---|---|
| `procedure-steps.before.rq` | The messy original, captured verbatim (lowercase keywords, unused `rdfs:` prefix, ragged indentation, blank-line noise). |
| `procedure-steps.after.rq` | Cleaned with **bucket-A edits only** (uppercase keywords, drop unused prefix, fix indentation, add comments). Variable names and the `OPTIONAL`'s **position** are left unchanged — moving an `OPTIONAL` changes the algebra, so it stays put. |
| `procedure-steps.equiv.log` | Checker output: **✓ identical algebra + ✓ identical results (57 rows)** on `api.parliament.uk/sparql` ⇒ provably equivalent. |
| `procedure-steps.lowercased.rq` | The same cleanup **plus** lower-casing the projected variables (style rule 6 — a **bucket-B** interface change). |
| `procedure-steps.lowercased.equiv.log` | Checker output: **✗ flagged** — algebra differs (`?Legislature`→`?legislature`) and result *columns* differ (`"Legislature"`→`"legislature"`), though the 57 data rows are otherwise the same. This is the renamed-interface warning: the consumer/getter must be updated in lock-step. |

Reproduce:

```sh
skills/sparqling-cleanup/bin/sparql-equiv.sh \
  sparqling/cleaned/procedure-steps.before.rq \
  sparqling/cleaned/procedure-steps.after.rq \
  --endpoint https://api.parliament.uk/sparql
```
