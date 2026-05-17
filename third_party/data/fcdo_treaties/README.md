# FCDO UK Treaties Online — crawl + extract plan

`treaties.fcdo.gov.uk` is the canonical UK government register of
treaties and international agreements. It is the **only** public UK
source that consistently records **signatories** (the persons who
actually signed) alongside parties, dates, treaty series number, and
the full treaty text. It is **not** covered by any of the JSON APIs
we already wrap — see the comparison table below.

This folder will hold the output of a headless-browser crawl of UKTO.
The crawler does not exist yet — this README drafts the design.

## Why we need this

The structured data we already have stops short of "signed by whom":

| Source | Surfaces | Tells us signatory member? |
|---|---|---|
| Parliament **Treaties API** (CRaG-laid only, ~323 records since 2010) | `id, name, signedDate, laidDate, leadDepartment, layingBodyDepartment, webLink` | ❌ No `signedBy` field |
| Parliament **SPARQL** / **OData** | Procedural data lives in the DD store, **not on the public endpoint** | ❌ |
| **gov.uk Content API** (`document_type=international_treaty`, ~1,681 docs) | `details.body` (prose), `details.attachments` (PDFs), `links.organisations`, `links.government` | ❌ No structured `ministers` / `people`. Signatories live inside the prose / PDF |
| **TNA Discovery API** (FO 93 protocols 8,916; FO 94 ratifications 3,300) | File-level catalogue metadata — description, dates, reference, repository | ❌ Catalogue-level only — file titles, not signatory names |
| **FCDO UK Treaties Online** (this folder) | Per-treaty record: parties, signed date, place of signature, EIF date, depositary, treaty series number, **signatories**, full PDF | ✅ This is the gap-filler |

A typical question we cannot answer today: "Which UK treaties have
been signed by Members who are still sitting MPs / peers?" Most
treaties are not signed by parliamentarians at all — they are signed
by senior officials, ambassadors, or FCDO Permanent Secretaries —
but the ones that ARE signed by a Secretary of State or Prime
Minister are the politically interesting subset, and that signal is
only in UKTO.

## What UKTO is, technically

- Hosted at `https://treaties.fcdo.gov.uk/`
- Product: **Knowvation™** (an Access Innovations / Lucidea
  document-management platform) running on JBoss Web 2.1.3 / Apache
  Tomcat (Coyote) — a stack from c. 2010.
- Two front-ends bolted onto the same backend:
  - **Legacy**: `/awweb/main.jsp` — login-gated (302 → `/awweb/login.jsp`)
  - **Modern (responsive SPA)**: `/responsive/app/consolidatedSearch/`
    — a Backbone.js single-page app that loads jQuery widgets and
    speaks XHR to an unknown set of backend endpoints (none of the
    guessable paths — `/responsive/api/search`, `/rest/search`,
    `/api/v1/*` — return 200).
- No `robots.txt` (path returns 404 by default).
- No public REST/JSON API documented anywhere FCDO publishes.

Because every page of substance is hydrated by client-side JS, plain
`curl` will not see treaty data. We need either:
1. A **headless browser** to drive the SPA and read the rendered DOM
   (Playwright / Puppeteer), or
2. **Network capture** of XHR endpoints while a browser drives the
   UI, then call those endpoints directly (faster but fragile against
   any backend change).

The recommended approach below uses (1) first, falls back to (2)
once endpoint URLs and parameter shapes are observed.

## Crawl plan

### Stage 0 — endpoint discovery (one-off, by hand)

Open `https://treaties.fcdo.gov.uk/responsive/app/consolidatedSearch/`
in a real browser with DevTools → Network. Perform:
- a list-all-treaties browse,
- a per-treaty record open,
- a PDF download.

Record the URLs, methods, headers, and JSON payloads of every XHR.
Save these into `third_party/data/fcdo_treaties/endpoints.json`
(committed) so subsequent runs of the crawler can hit the same
endpoints without re-running the discovery step.

### Stage 1 — full headless crawl

Driver: **Playwright** (Node — same stack as the rest of the repo).

```
scripts/crawl-fcdo-treaties.mjs

  --concurrency N        default 1 (be polite; this is one server)
  --delay-ms MS          default 500
  --out DIR              default third_party/data/fcdo_treaties
  --resume               continue from index.jsonl
  --max N                cap for testing
  --refetch              re-fetch even if cached
  --headed               run with browser visible (debug)
```

Flow per run:

1. Launch Chromium headless with a polite User-Agent string
   (`forgetmenot-treaty-crawler/0.1 +https://github.com/danbri/forgetmenot`).
2. Navigate to the SPA, wait for the search-results widget to
   render.
3. Iterate page-by-page through the result set (URL or pagination
   button), recording `treaty_id` (UKTO's internal record number)
   for every row.
4. For each `treaty_id` not yet in `index.jsonl`:
   - Open the record-detail panel / page.
   - `waitForSelector` on the field labels (`Title`, `Parties`,
     `Place of Signature`, `Date of Signature`, `Date of Entry into
     Force`, `Depositary`, `Treaty Series`, `Signatories`, …).
   - Extract each field via `page.evaluate` into a `record` object.
   - Save `<out>/html/<treaty_id>.html` (raw page) and
     `<out>/records/<treaty_id>.json` (structured).
   - Append a one-line summary to `<out>/index.jsonl`.
   - If the record links to a PDF, fetch with the same browser
     context (preserves session cookies) and save to
     `<out>/pdfs/<treaty_id>.pdf`. Hash on save to avoid duplicates.
   - Sleep `--delay-ms`, then continue.
5. On completion, print a summary line and exit non-zero if any
   record failed to extract a required field.

### Data shape (per-treaty JSON)

```json
{
  "ukto_id": "12345",
  "title": "Agreement between …",
  "parties": ["United Kingdom", "Switzerland"],
  "place_of_signature": "Bern",
  "date_of_signature": "1995-03-14",
  "date_of_entry_into_force": "1996-05-01",
  "treaty_series_number": "TS 17/1996",
  "command_paper": "Cm 3145",
  "depositary": "United Kingdom",
  "signatories": [
    { "name": "Douglas Hurd", "role": "Foreign Secretary",
      "for_party": "United Kingdom" },
    { "name": "Jean-Pascal Delamuraz",
      "role": "Federal Councillor",
      "for_party": "Switzerland" }
  ],
  "pdf_path": "pdfs/12345.pdf",
  "pdf_sha256": "…",
  "html_path": "html/12345.html",
  "source_url": "https://treaties.fcdo.gov.uk/responsive/app/consolidatedSearch/#…",
  "captured_at": "2026-05-16T22:40:00Z"
}
```

The `signatories[]` array is the whole point of this exercise.
Where a signatory's `name` matches a current or historical UK MP /
peer, a second pass will resolve them to a `member_id` via
`parl members search --name "<name>"` and write back into a
`resolved_member_id` field — same pattern as the APPG resolution
chain documented at [`skills/appg/SKILL.md`](../../../skills/appg/SKILL.md).

### Storage layout

```
third_party/data/fcdo_treaties/
├── README.md                 (this file)
├── endpoints.json            (XHR URL map from stage 0 — gitignored if large)
├── index.jsonl               (one summary line per crawled treaty; commit)
├── records/<ukto_id>.json    (per-treaty structured record; commit)
├── html/<ukto_id>.html       (raw rendered HTML; gitignored)
├── pdfs/<ukto_id>.pdf        (signed-instrument PDF; gitignored, hashed)
└── crawl.log                 (run log; gitignored)
```

`records/` is the commitable knowledge graph. `html/` and `pdfs/`
are bulky derivatives — gitignore them and reproduce on demand from
`records/<id>.json.source_url` + `index.jsonl`.

### Politeness

- Single concurrent worker by default.
- 500 ms minimum delay between record fetches.
- Stop on any HTTP 429 / 503 and back off exponentially.
- User-Agent identifies the project and links the repo.
- Respect any `Retry-After` header.
- Cache aggressively — re-runs should produce zero network requests
  for already-fetched treaties (`--refetch` to override).

### Open questions for stage 0

These need to be answered by watching the DevTools Network tab
during a real browse, before the crawler can be written:

1. What is the XHR endpoint for the result list, and what params
   control pagination / filtering?
2. Does the UI use a stable `treaty_id` in URLs / fragments, or are
   detail panels opened by an internal Backbone route only?
3. Is the field set per record consistent, or does it vary by
   treaty type (bilateral / multilateral / declaration)?
4. Are PDFs served from the same host, and do they require the
   session cookie or a one-time token?
5. What does the SPA do for treaties withheld under exemption — is
   there a `withdrawn` flag in the record JSON, or is it just absent
   from results?

## Related upstream sources we already wrap

For comparison and triangulation:

- **Parliament treaties** — `parl treaties search …` covers the
  CRaG window (treaties laid before Parliament since 2010). Use
  this to enumerate the modern subset and follow `webLink` to
  gov.uk.
- **gov.uk Content API** — `https://www.gov.uk/api/search.json
  ?filter_content_store_document_type=international_treaty` gives
  ~1,681 publications, each with `details.body` (HTML) and PDF
  attachments. Useful for the post-2010 modern subset, but
  signatories are only in prose.
- **TNA Discovery API** —
  `https://discovery.nationalarchives.gov.uk/API/search/records
  ?sps.recordSeries=FO%2094` is the catalogue of physical
  treaty ratifications held at Kew (3,300 records in FO 94, 8,916
  in FO 93). File-level metadata only; ordering the actual document
  requires a TNA reader-room visit or a paid copy order.

## Status

- 2026-05-16: Folder + this design doc created.
- 2026-05-17: **Stage 0 done** via Playwright (see
  `scripts/fcdo_treaties_stage0_discover.py`). Endpoint discovery
  output committed at `endpoints.json`. Key finding: the data plane is
  an OGC CSW service at `POST /awweb/awfp/search/1`, anonymous
  session, JSESSIONID cookie. No headless browser needed for the
  crawl proper.
- 2026-05-17: **Stage 1 done** via pure-HTTP Python
  (`scripts/fcdo_treaties_crawl.py`). Smoke-tested on the first 30
  records (1815 onward); 21,957 records total.
- 2026-05-17: **Signatory-names claim corrected.** The original draft
  of this README asserted UKTO records signatories. The
  public-anonymous surface does **not**: detail HTML fragments
  contain a country / action / action-date / effective-date table,
  no person names. Logged-in views may differ; we have no
  credentials to test. See "What we actually capture" below.
- TODO: Run the full crawl (will produce ~22 MB of JSON across
  21,957 files).
- TODO: RDF lift (Dublin Core + small `fcdo:` namespace).
- TODO: SHACL shape for the Parliament-API ↔ UKTO join.

## What we actually capture (post-stage-0)

Per record, in `records/<id>.json`:

| Field | From | Notes |
|---|---|---|
| `id`, `uuid` | CSW search response | UKTO's internal record number + a UUID |
| `title` | search | always present |
| `parties` | `country_name` (semicolon-split) | always present |
| `signed_date` | `signed_event_date` | DD/MM/YYYY in source |
| `signed_place` | `signed_event_location` | mostly present, city name |
| `definitive_eif_date` | `definative_eif_event_date` | sic; FCDO's typo |
| `references` | semicolon-split refs | Treaty Series, Command Paper, BSP, etc. |
| `subject` | search | FCDO classification (e.g. TRADE, FRIENDSHIP) |
| `bilateral_or_multilateral` | `field3` | `BI` / `MU` |
| `parties_detail` | detail HTML fragment | per-country `action` + dates |

What is **not** captured (because not present anonymously):
signatory names, full text of the treaty, ratification status by
person, declarations/reservations text. Some of these may be in the
PDF when a treaty has been published as a command paper -- the PDFs
themselves are not in UKTO either, they're at `assets.publishing.
service.gov.uk` and reached via gov.uk's content API.
