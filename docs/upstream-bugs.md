# Upstream bugs we have observed

A short ledger of issues against UK Parliament APIs that we have
confirmed are server-side. Re-test before reporting — flakes
happen, but persistent failures across days are worth filing
with `data@parliament.uk`.

## `api.parliament.uk/query/constituency_lookup_by_postcode` → HTTP 500

The Parameterised-Query (PQ) template
`constituency_lookup_by_postcode` returns HTTP 500 ("An error has
occurred.") for every postcode tested, including known-good ones
(`SW1P 3JA`, `SW1A 2AA`, `SW1A 0AA`). The fault is **specific to
this template** — other PQ templates (`person_mps`,
`constituency_current`, `party_current`, `house_index`) return
200 from the same host.

- First observed: 2026-05-17
- Still failing: 2026-05-18
- Workaround: use the Members API search-by-postcode endpoint
  (`parl members search --postcode "SW1P 3JA"`) which calls
  `/api/Location/Constituency/Search?searchText=` and is unaffected.
- CLI reproducer:
  ```
  node bin/parl.mjs pq run constituency_lookup_by_postcode --postcode "SW1P 3JA"
  ```
- Raw reproducer (no CLI):
  ```
  curl -sS -o /dev/null -w '%{http_code}\n' \
    'https://api.parliament.uk/query/constituency_lookup_by_postcode?postcode=SW1P+3JA'
  # → 500
  ```

If/when filed: include the URL, the day, and the surprising fact
that sibling templates are fine.

## `treaties-api` does not list the Council of Europe AI Framework Convention

Searching the Treaties API for `artificial intelligence`,
`Council of Europe Framework`, etc. returns zero items as of
2026-05-18. This is plausibly *not* a bug — the UK may simply
not have laid the Convention under the Constitutional Reform and
Governance Act 2010 yet — but worth tracking. The Members API,
Hansard and written-questions all show active parliamentary
discussion of the Convention.

## DDP post-2024 incumbency latency

The DDP graph (the public one at `api.parliament.uk/sparql`) is
missing post-2024-election `parl:memberHasParliamentaryIncumbency`
rows for at least these current Commons cabinet members:

| MNIS | Member | Cabinet role | Constituency (post-2024) |
|---|---|---|---|
| 632 | Douglas Alexander | Secretary of State for Scotland | Lothian East |
| 4038 | Heidi Alexander | Secretary of State for Transport | Swindon South |
| 4077 | Emma Reynolds | Secretary of State for Environment, Food and Rural Affairs | Wycombe |
| 5333 | Lucy Rigby | Chief Secretary to the Treasury | Northampton North |

All four were elected at GE 2024-07-04 (confirmed via the
psephology corpus and via the Members API directly). DDP knows
they exist (each resolves on `parl:memberMnisId`) but doesn't
have a current — no-`parliamentaryIncumbencyEndDate` —
incumbency row attached. This is the well-documented DDP
lag-behind-REST behaviour mentioned in
[`docs/sparql-endpoints.md`](sparql-endpoints.md); the gap looks
real and is reproducible by `scripts/test-cabinet-won.mjs`.

Surfaced: 2026-05-23 by `scripts/test-cabinet-won.mjs`.

## identity-graph — Nick Thomas-Symonds GOV.UK page → MNIS bridge missing

`scripts/build-identity-graph.mjs` could not bridge GOV.UK people
slug `nick-thomas-symonds` (current Paymaster General, MNIS 4479)
because his GOV.UK page didn't yield a `schema:name@en` literal at
factoid-extraction time, so the name-matching step had nothing to
match against. Should be fixed by re-crawling his GOV.UK page or
falling back to a slug-only match for that slug pattern.

Surfaced: 2026-05-23 by `scripts/test-cabinet-won.mjs`.

## Resolved / not-bugs

- **`si search --term`** — earlier suspected of ignoring the
  `--term` filter, but verified working on 2026-05-18. The CLI
  passes `--term` through to the API's `Name` query parameter,
  which performs substring matching server-side. Example:
  `parl si search --term "Online Safety"` returns 12 hits;
  `parl si search --term "artificial intelligence"` returns one
  (the *Data Protection Act 2018 (Code of Practice on AI and
  Automated Decision-Making) Regulations 2026*). No fix needed.
