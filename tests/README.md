# Tests

Three layers, all runnable from the repo root.

| Layer | Command | Network? | Time | What it covers |
|---|---|---|---|---|
| Unit | `npm run test:unit` | No | <1 s | Pure functions and parsers. Fast, deterministic. |
| Integration | `npm run test:integration` | No (mocked fetch) | <2 s | Multi-module flows with a stubbed `globalThis.fetch`. |
| Smoke | `npm run test:smoke` and `npm run test:cli` | Yes | ~30 s | Hits live UK Parliament endpoints to detect upstream drift. Run before merging changes that touch facility modules. |

Run everything with `npm test`.

## Layout

```
tests/
  README.md
  unit/            # node:test files for pure functions
    archival.test.mjs
    sites.test.mjs
    members.test.mjs
    appg.test.mjs
    http.test.mjs
  integration/     # multi-module flows using a mock fetch
    sites-crawl.test.mjs
    archival-end-to-end.test.mjs
  fixtures/        # canned HTML/JSON used by extractor tests
    appg-group.htm
    members-contact.json
    site-wordpress.htm
    site-squarespace.htm
    site-wix.htm
  test_endpoints.sh   # legacy smoke test (live HTTP)
  test_cli.sh         # legacy smoke test (CLI, live HTTP)
```

## Conventions

- Use Node 18+ built-in `node:test` and `node:assert/strict`.
- One test file per module under test (`lib/foo.mjs` → `tests/unit/foo.test.mjs`).
- Fixtures are checked-in real-world snapshots, never invented HTML
  — drift between fixtures and live data is an honest signal that a
  parser needs an update.
- Integration tests stub `globalThis.fetch` so the test runner stays
  offline. The mock is a small per-test helper, not a framework.

## Why not Jest / Mocha / Vitest

The repo's house rule is "stdlib-only, browser-portable". Node 18+
ships a perfectly capable test runner; pulling in Jest would
contradict that and bloat install. If we ever need watch mode or
coverage, both are available via `node --test --watch` and
`node --test --experimental-test-coverage`.

## Drift monitoring

`tests/unit/` and `tests/integration/` should pass on every commit.
`tests/smoke/` flakes when an upstream API ships a breaking change
— that flake is the point: rerun smoke tests as a CI nightly so
upstream drift is detected within 24 h. A failing smoke test
should open a refresh of the relevant facility module and
`_specs/` cache, never be silenced.
