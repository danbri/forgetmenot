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

## Resolved / not-bugs

- **`si search --term`** — earlier suspected of ignoring the
  `--term` filter, but verified working on 2026-05-18. The CLI
  passes `--term` through to the API's `Name` query parameter,
  which performs substring matching server-side. Example:
  `parl si search --term "Online Safety"` returns 12 hits;
  `parl si search --term "artificial intelligence"` returns one
  (the *Data Protection Act 2018 (Code of Practice on AI and
  Automated Decision-Making) Regulations 2026*). No fix needed.
