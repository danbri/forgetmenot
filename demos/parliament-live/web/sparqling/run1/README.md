# run1 — SPARQL cleanup, applied + runnable

A worked run of the [`sparqling-cleanup`](../../skills/sparqling-cleanup/SKILL.md)
skill on real queries captured from the Trello card, plus a small in-browser
runner that showcases the before/after and runs them live.

## The queries (both versions of each)

| Query | Before | After | Notes |
|---|---|---|---|
| Houses of a legislature | `houses-of-legislature.before.rq` | `.after.rq` | simple SELECT; the cleanest tidy-up |
| Procedure steps + counts | `procedure-steps.before.rq` | `.after.rq` | aggregate + `GROUP BY` + `OPTIONAL` (position preserved) |
| Procedure steps, vars lower-cased | — | `procedure-steps.lowercased.rq` | a deliberate **bucket-B** interface change, for contrast |

Equivalence-checker output is captured alongside:
`procedure-steps.equiv.log` (✓ identical algebra + 57 identical rows) and
`procedure-steps.lowercased.equiv.log` (✗ correctly flagged — renamed columns).
Reproduce with:

```sh
skills/sparqling-cleanup/bin/sparql-equiv.sh \
  sparqling/run1/procedure-steps.before.rq \
  sparqling/run1/procedure-steps.after.rq \
  --endpoint https://api.parliament.uk/sparql
```

## The runner

`runner.html` — a canned gallery with a **before / after** toggle, SPARQL
syntax highlighting (a small self-contained lexer, so comments + keyword case
show), and a **Run** button that queries the public UK Parliament endpoint
(`https://api.parliament.uk/sparql`).

- Execution + result rendering reuse the repo's own framework-free engine,
  `sparql-core.js` (vendored here from `demos/parliament-live/web/kgx/js/`). No CDN.
- A served copy lives at `demos/parliament-live/web/sparqling/run1/` →
  **`/sparqling/run1/runner.html`** on the fpkg site.
- `runner.html` is generated from the `.rq` files by `build-runner.py` (so the
  embedded gallery never drifts). Re-run `python3 build-runner.py` after editing
  a query.

Endpoint note: the page calls the public Parliament endpoint directly (it sends
CORS `access-control-allow-origin: *`), the same way the kgx `playground` /
`studio` clients do.
