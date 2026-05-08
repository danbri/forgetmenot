# instruments-by-act — agent rules

A small demo: when statutory instruments are laid before Parliament,
plotted by enabling Act of Parliament. One line per Act, time on the
x-axis, count on the y-axis. The point is to surface spikes (e.g. COVID
under the Public Health (Control of Disease) Act 1984) and long tails
(e.g. EU exit under the European Union (Withdrawal) Act 2018).

This demo follows the rules in
[`skills/parliament-proxy/SKILL.md`](../../skills/parliament-proxy/SKILL.md).
The hard rules summarised:

1. **The proxy is the only path.** Pages must always go via `/api/...`
   on the same origin — Parliament APIs do not allow CORS.
2. **OPL attribution is non-negotiable.** Every page carries the
   "Contains Parliamentary information licensed under the Open
   Parliament Licence v3.0" line with a link to the licence.
3. **No semantic logic in the whitelist.** App decisions live in the
   page or in `extraRoutes` handlers, never in the proxy whitelist.
4. **TTL must reflect mutability.** SI search: 1 h. Per-id detail:
   24 h. Aggregations: 6 h. Read the `ttlPolicy` comments before
   widening any of these.
5. **Probe-then-render.** Before changing any handler that reads SI
   fields, `curl` the actual endpoint and read the JSON keys. The SI
   API uses a `value`-wrapped envelope and returns dates as
   ISO-without-Z; pattern-matching from a sibling endpoint is how you
   ship a confidently-wrong renderer.
6. **Defensive renderers fail loud.** If the data shape doesn't match,
   surface that — render a visibly-broken state with the keys that
   actually came back. Never substitute placeholder text.
7. **Accessibility.** Mobile-first (test at 360 px). Body text ≥16 px.
   Contrast ≥4.5:1 (`--ink-mute` is decoration only). Every chart has
   a data-table fallback. Tooltips don't trap focus. Touch targets ≥40 px.
8. **Honesty.** When data is missing, say so. Don't fabricate a smooth
   curve through a sparse series — gaps in the data mean gaps in
   parliamentary activity, and the chart should let that show.

## Layout

- `server.mjs` — declares the SI proxy route, the TTL policy, and the
  two extra-route handlers (`/api/agg/acts`,
  `/api/agg/instruments-by-act`). The mechanics live in
  `lib/proxy.mjs`.
- `web/index.html` — single-file SVG chart. No build step, no runtime
  deps. Module-scoped `<script>`.
- `tests/server.test.mjs` — smoke tests for the bucketing + the
  aggregation handler.

## Local

```sh
node demos/instruments-by-act/server.mjs
# open http://127.0.0.1:8788/
```

## Tests

```sh
node --test demos/instruments-by-act/tests/
```

## Honesty about coverage

The Statutory Instruments API only goes back to **mid-2017** (the
oldest entry has a Commons laying date of 2017-06-22). Acts older
than that may show fewer SIs in the chart than they have actually
made — only post-2017 SIs are visible to the API.
