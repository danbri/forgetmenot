# Possible sources to wrap next

Snapshot of the UK-authority data landscape, with current API status
(probed 2026-05-17) and provenance-prefix assignments per
[`docs/provenance.md`](provenance.md). Repo focus stays **UK
Parliament**; everything below is judged by how well it joins to
that core.

Tier letters indicate priority for `forgetmenot` to wrap. Tier names
are NOT the same as the provenance tier (1/2/3) — these are
implementation priorities. Producer slugs are stable across all
skills from the same operator.

## 🟢 Tier A — strong joins, clean APIs, high value (DO NEXT)

| Source | Producer slug | What it gives us | Join | API status |
|---|---|---|---|---|
| **ONS Open Geography Portal** | `ons-geo` | Westminster constituency boundaries (`PCON24CD` / `PCON24NM`) as GeoJSON. Also wards, LADs, regions, ceremonial counties, historical sets back to 1995. ArcGIS REST FeatureServer. | `members` constituency ↔ `PCON24CD` | ✅ Confirmed: `E14001063 / Aldershot` cleanly. No auth. |
| **mySociety MapIt** | `mysoc-mapit` | Postcode / lat-lon → every administrative area it sits in (constituency, ward, council, region, parish), each with a MapIt id and ONS code. | postcode → `PCON24CD` → `members` | ✅ Confirmed: `SW1P3JA` → "Cities of London and Westminster". |
| **Nomis (ONS labour-market + Census)** | `ons-nomis` | 1,616 datasets — every Census table by constituency (2021), labour-market series, employment, claimant counts, all at PCON granularity. Free anonymous SDMX-JSON. | `PCON24CD` join | ✅ Confirmed: 1,616 datasets enumerated. |
| **Ordnance Survey OpenData** | `os` | Bulk downloads: Boundary-Line (constituency/ward/council polygons), Code-Point Open (postcode centroids), OpenNames (gazetteer). OS Data Hub APIs need a free key. | constituency code, postcode | ✅ OS Data Hub root 200; bulk OpenData downloadable without key. |

## 🟢 Tier B — devolved legislatures

| Source | Producer slug | What it gives us | API status |
|---|---|---|---|
| **Scottish Parliament Open Data** | `sp` | MSPs, motions, votes, written questions, committees, sittings | ✅ `data.parliament.scot/api/` works with `Accept: application/json`. Useful cross-mandate join via Wikidata QIDs. |
| **Senedd Cymru (Wales)** | `senedd` | MSs, motions, votes, Welsh SIs, committees | ⚠️ ModernGov ASMX (SOAP). Bigger lift to wrap. |
| **NI Assembly Open Data** | `nia` | MLAs, NI Hansard, written questions, committees | ⚠️ ASMX SOAP-only. |
| **StatsWales** | `wales-stats` | Welsh public-sector statistics (OData v3) | ✅ Public OData. |
| **statistics.gov.scot** | `scotgov-stats` | Scottish stats portal, SPARQL endpoint over linked-data cube | ✅ SPARQL — similar pattern to our `sparql` wrap. |
| **NISRA** | `nisra` | NI census + economic stats | Static dataset downloads + some CKAN; no clean unified API. |

## 🟢 Tier C — wider stats & geography, looser joins

| Source | Producer slug | What it gives us | API status |
|---|---|---|---|
| **ONS Beta Datasets API** | `ons` | Modern ONS "Customise My Data" platform: macroeconomic time series, balance of payments, public finances. | `api.beta.ons.gov.uk/v1/datasets` — works (proper paths). |
| **Boundary Commission for England (+ Wales/Scotland/NI)** | `bce` / `bcw` / `bcs` / `bcni` | Review-cycle reports, recommended-boundary GeoJSON, consultation submissions. Useful for "why did this constituency change between 2010 and 2024." | Mostly PDF + HTML; some downloadable GeoJSON. |
| **Local Government Boundary Commission for England** | `lgbce` | Local council ward reviews. Tangential to Westminster. | HTML + downloads. |
| **Greater London Authority Datastore** | `gla` | London data (CKAN) — borough stats, transport, environment. | `data.london.gov.uk` — CKAN. |
| **TfL Unified API** | `tfl` | Tube / bus / cycle / road network. London-only. | Public endpoints by line/stop/journey; free key. |
| **Met Office DataPoint / Hub** | `met` | Weather observations + forecasts. | Most useful data is paid (DataHub). |
| **NHS Digital / NHS England Data** | `nhs` | Hospital activity, prescribing, GP practices. | Many endpoints; uneven coverage and licensing. |
| **DVLA / DVSA** | `dvla` | Vehicle data; MOT history. | Open + key APIs. Tangential. |

## 🟢 Tier D — judicial / legal

Already wrapped or stubbed under the third-party producer prefix
convention. Status as of 2026-05-17:

| Skill | What it gives us | Status |
|---|---|---|
| `tna-legislation` | Enacted text of every Act + SI via legislation.gov.uk (Atom + Akoma Ntoso). | ✅ Skill exists (SPARQL queries, RDF fetcher, ShEx shapes). |
| `tna-caselaw` | Approved judgments from Supreme Court, Court of Appeal, High Court, Upper Tribunals. | ⏳ Stub skill. |
| `tna-discovery` | Catalogue of physical records at Kew (treaty ratifications in FO 94, etc.). | ⏳ Stub skill. |
| `fcdo-treaties` | UK Treaties Online (treaty signatories — the FCDO Knowvation crawler). | ✅ Crawler + 5663 records + skill. |

## 🟢 Tier E — civic tech / commentary (third-party operators)

| Source | Producer slug | What it gives us | API status |
|---|---|---|---|
| **TheyWorkForYou** | `mysoc-twfy` | MP-level joins via TWFY `person_id`; voting summaries, news feeds, "rebellion" detection. | ✅ Free API key. |
| **WhatDoTheyKnow** | `mysoc-wdtk` | FOI requests as data; can back parliamentary questions. | Alaveteli API + RSS. UA-gated. |
| **DemocracyClub Candidates** | `dc-candidates` | Who stood / standing. Includes prior elections, sources, party. | ✅ JSON, no auth. |
| **EveryElection** | `dc-elections` | Every UK election (Westminster, devolved, mayoral, local, PCCs, parishes). | ✅ JSON, no auth. |
| **Electoral Commission** | `ec-donations` / `ec-spending` / `ec-loans` | Donations to MPs / parties / candidates. Cross-checks the Register. | ✅ JSON, no auth. |
| **Wikidata SPARQL** | `wikidata` | Cross-ID meta-glue (P5388 MP id, P6213 Lords id, P2009 TWFY id, P10428 PEP id). | ✅ Public SPARQL. Already partly used by the `govuk-orgchart` bridge (`third_party/data/wikidata/`). |
| **OpenCorporates** | `oc` | Company data — directors, addresses, jurisdictions. | API with daily limit. |
| **Companies House** | `ch-companies` | Official UK company register. | Free API key. |
| **Charity Commission** | `cc-charities` | Registered charities. APPG-adjacent funding. | Free API key. |
| **Bank of England** | `boe` | Macro stats. | Free CSV / XML. |
| **FullFact** | (no API) | RSS only — no clean API. Per-fact-check pages use Schema.org ClaimReview. | RSS at `/feed/`. |

## On boundary history specifically

The user-facing question "constituency maps, history" needs:

| Time | Source | Producer slug |
|---|---|---|
| Current (2024 boundaries, 650 seats) | ONS Open Geography Portal — `Westminster_Parliamentary_Constituencies_July_2024_Boundaries_UK_BUC` | `ons-geo` |
| 2010 boundaries (533 / 59 / 40 / 18 = 650) | ONS Geoportal historical layers — `PCON_DEC_2010_UK_*` | `ons-geo` |
| Why constituencies changed (2024 review) | Boundary Commission Final Reports (PDF + interactive viewer) | `bce` / `bcw` / `bcs` / `bcni` |
| Old MP → new constituency mapping | mySociety + manual research; no canonical source | tier-3 derivation |
| Pre-2010 boundaries (back to 1885 reform) | Vision of Britain (Univ. Portsmouth) + History of Parliament Trust | `vob-history` / `hopt` |

`ons-geo` covers the modern + 2010 question structurally. The "why
did this seat's shape change" question is BCE-PDF territory and
wants an LLM-extraction layer over the published reports.

## Recommended next order

1. **`mysoc-mapit`** + **`ons-geo`** — paired PR for postcode/coord → constituency. Highest leverage; small surface; this PR.
2. **`ons-nomis`** — constituency-level Census/labour-market data.
3. **`mysoc-twfy`** — voting summaries, complements `members`.
4. **`tna-caselaw`** — finish the stub; pair with `tna-legislation`.
5. **`dc-candidates`** + **`dc-elections`** — electoral history.
6. **`ec-donations`** — joins with `interests`.
7. **`wikidata`** — narrow SPARQL preset facility (the data is already used by `govuk-orgchart`'s bridge; this exposes it as a first-class facility).
8. **`sp`** — devolved cross-mandate.
9. **`os`** — Boundary-Line + Code-Point Open downloaders.
10. **`senedd`** / **`nia`** — SOAP, bigger lift.

## NOT recommended

- **Met Office, DVLA/DVSA, NHS, Companies House, Charity Commission**: wide surfaces, low Parliament-join value unless a specific question is in mind. Companies House + Charity Commission gain value once joined to `interests` (MPs' Register), but they need free API keys.
- **GLA / TfL**: London-only; relevant only for London-MP questions.
- **LGBCE**: ward-level, below Westminster's concern.

## Provenance reminder

All third-party skills land with `metadata.provenance.tier: 3` and a
producer slug from the table above. The cite-once-per-paragraph rule
from [`provenance.md`](provenance.md) applies; `_field_sources`
required only when a single facility *mixes* producer tiers (e.g.
joining Parliament SI metadata to legislation.gov.uk enacted text).
