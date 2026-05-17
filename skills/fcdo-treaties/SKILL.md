---
name: fcdo-treaties
description: Crawl and query FCDO UK Treaties Online (treaties.fcdo.gov.uk) -- the canonical UK government register of treaties and international agreements, ~21,957 records back to the early 19th century. Catalogue metadata only (title, parties, signed date / place, treaty series references, subject); signatory NAMES are NOT in the public-anonymous record, despite the prior design doc's claim. Use whenever the question is about UK treaties beyond the ~323-record Parliament Treaties API CRaG window, or treaties pre-2010.
license: Open Government Licence v3.0 (Crown copyright); skill text MIT.
metadata:
  cli-binary: scripts/fcdo_treaties_crawl.py
  provenance-policy: docs/provenance.md
  provenance:
    tier: 3
    operator: "FCDO (Foreign, Commonwealth & Development Office)"
    service: "treaties.fcdo.gov.uk (UK Treaties Online, Knowvation platform)"
    upstream-data: "21,957 treaty records as of 2026-05-17: title, parties (country list), signed date + place, definitive entry-into-force date, treaty-series + command-paper references, subject classification, bilateral/multilateral flag"
    citation-short: "UK Treaties Online (FCDO)"
    citation-formal: "UK Treaties Online, Foreign, Commonwealth & Development Office, retrieved {date} under OGL v3.0"
    confidence: derived
    confidence-notes: "Catalogue metadata is authoritative from FCDO. Per-record HTML fragment contains a country/action/action-date/effective-date table only -- no signatory NAMES. The design doc at third_party/data/fcdo_treaties/README.md originally claimed signatories were captured; data-quality audit found they are not present in the public-anonymous surface. Documented in the README. Logged-in / authenticated views may differ."
---

# `fcdo-treaties` — UK Treaties Online catalogue

FCDO publishes the UK's treaty register at
[`treaties.fcdo.gov.uk`](https://treaties.fcdo.gov.uk/). The public
SPA at `/responsive/app/consolidatedSearch/` is backed by an OGC CSW
endpoint at `/awweb/awfp/search/1` reachable with anonymous session
cookies.

## What's in scope

| Field | Source | Coverage |
|---|---|---|
| Title | search response | every record |
| Parties (country list) | search response | every record |
| Signed date | search response | almost every record |
| Signed place | search response | most records |
| Definitive entry-into-force date | search response | partial |
| Treaty-series + command-paper references | search response | most records |
| Subject (FCDO classification) | search response | every record |
| Bilateral / multilateral flag | search response (`field3` = `BI`/`MU`) | every record |
| **Signatory NAMES** | **NOT in public surface** | the design doc was wrong |

The detail HTML at `data/Library2/html/<id>.html` is a small
country/action/date table -- it adds a per-country `action`
("Signature", "Ratification", "Extension", "Accession", etc.) plus
the action date / effective date, but no names of people.

So the right framing for `fcdo-treaties`: a **catalogue** of every UK
treaty back to ~1815, joinable to the Parliament Treaties API by
treaty series number / signed date for the post-2010 CRaG subset.

## Pipeline

```sh
# 1. (One-off) Stage-0 endpoint discovery — drives the SPA with
#    Playwright + Chromium and records every XHR. Writes
#    endpoints.json. Already done; re-run if the SPA changes.
python3 scripts/fcdo_treaties_stage0_discover.py

# 2. Crawl. Pure HTTP (no headless browser needed once endpoints are
#    known). Politely paginates the OGC CSW search, fetches each
#    record's metadata + detail HTML fragment, writes JSON per
#    record + a one-line index. Restartable.
python3 scripts/fcdo_treaties_crawl.py --max 100              # test
python3 scripts/fcdo_treaties_crawl.py --resume               # incremental
python3 scripts/fcdo_treaties_crawl.py --resume --delay 0.5   # slower
python3 scripts/fcdo_treaties_crawl.py --resume --max 21957   # full

# 3. Lift to RDF (N-Quads, one named graph per treaty). Idempotent;
#    re-running is safe.
python3 scripts/fcdo_treaties_extract.py

# 4. Reconcile to Parliament Treaties API by Command Paper number.
#    Hits the public API politely; writes parliament-bridge.ttl
#    that owl:sameAs-merges into all.nq.
python3 scripts/fcdo_treaties_reconcile_parliament.py
```

### Politeness + restartability

The crawler is built around three restart-friendly properties:

- **`--resume`** reads `index.jsonl` and skips any UKTO id already
  recorded. Killing the script and re-running picks up where it left
  off. The full 21,957-record crawl can be run in 10-record chunks
  if needed.
- **JSESSIONID re-use** — one anonymous login per run is reused
  across every search + detail-fetch call. Avoids the politeness cost
  of repeated login.
- **Adaptive backoff** — HTTP 429 / 503 trigger the `Retry-After`
  header path; everything else is fatal so failures surface fast
  rather than silently mis-crawling.

Defaults: one worker, 500 ms inter-record delay, 100-record search
pages. `--delay 1.0 --page-size 50` is a politer alternative for
long-running unattended crawls.

## Storage layout

```
third_party/data/fcdo_treaties/
├── README.md                   the design doc (updated to reflect findings)
├── endpoints.json              CSW XHR map from stage-0 discovery
├── index.jsonl                 one summary line per crawled treaty (commit)
├── records/<ukto_id>.json      per-treaty structured record (commit)
├── html/<ukto_id>.html         detail HTML fragment (gitignored, ~1 KB)
└── crawl.log                   run log (gitignored)
```

## Joining to Parliament treaties

The Parliament `treaties` skill covers the CRaG window (treaties laid
since 2010, ~323 records). Each Parliament treaty has a `webLink`
pointing at gov.uk. To join to UKTO:

1. The Parliament record's `name` matches the UKTO `title`.
2. The Parliament `signedDate` matches the UKTO `signed_date`
   (after normalising DD/MM/YYYY ↔ ISO).
3. As a tiebreaker, UKTO's `references` list usually contains a
   "Country Series" or "Treaty Series" identifier shaped like
   `TS 5/2024` or `Country Series 12/2023` that gov.uk's
   publications metadata also carries.

That join is a candidate for a SHACL shape (planned, not yet
written).

## Querying

After crawl, the per-record JSONs are easy to query with `jq`:

```sh
# every treaty signed in Geneva
jq -s 'map(select(.signed_place=="Geneva")) | length' \
   third_party/data/fcdo_treaties/records/*.json

# bilateral treaties between UK and France
jq -s 'map(select(.bilateral_or_multilateral=="BI"
                  and (.parties|index("FRANCE"))))' \
   third_party/data/fcdo_treaties/records/*.json
```

An RDF lift script is planned (Dublin Core + a small `fcdo:` namespace
for the action / signed-place / treaty-series predicates). When written
it will materialise a local SPARQL endpoint alongside the gov.uk
one, with the same `data-quality` discipline (anchor cases against the
~10 most-cited treaties, cross-checks against the Parliament Treaties
API for the post-2010 subset).

## Upstream gaps

Filed via `data-quality` discipline:

- **Design-doc / reality mismatch**: the original folder README
  asserted UKTO records signatory names; the public-anonymous
  surface does not. README updated.
- **Backslash paths**: search responses include `document_url`
  values with literal `\` characters that the same server then 404s
  on. The crawler converts `\` → `/` -- it should be filed upstream.
- **No robots.txt / no documented API**: the OGC CSW endpoint is
  not documented externally. Treat the endpoint URL as observed
  behaviour, not contract.

## See also

- [`treaties`](../treaties/SKILL.md) — Parliament's CRaG treaties API (first-party Parliament)
- [`tna-discovery`](../tna-discovery/SKILL.md) — TNA's catalogue, holds FO 93 / FO 94 physical treaty records
- [`tna-legislation`](../tna-legislation/SKILL.md) — sibling pattern, Linked Data for legislation
- [`data-quality`](../data-quality/SKILL.md) — discipline this skill follows
