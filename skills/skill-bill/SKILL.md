---
name: skill-bill
description: Research dossier + method for reconciling UK Bills across every surface that records them — the Bills REST API, the UK Parliament Thesaurus (LEG terms), the DDP SPARQL store (ActOfParliament / StatutoryInstrumentPaper), legislation.gov.uk, Wikidata (via QLever), modern Hansard and Historic Hansard (1803–2005), and the Journals of the House. Use when you need to know WHERE a bill (especially a pre-2015 historical one) is recorded, how complete each source is, whether matching them is a SPARQL/ETL job or an AI/fuzzy one, and how to build a bill-identity crosswalk graph (billId ↔ LEG term ↔ Hansard stages ↔ resulting Act ↔ legislation.gov.uk ↔ Wikidata QID). Complements the `bills` skill (which just wraps the live Bills API).
license: Open Parliament Licence v3.0 / OGL v3.0 for Parliament sources; CC0 for Wikidata; third-party licences vary (noted inline).
metadata:
  provenance:
    tier: 1
    note: "Counts below were measured live on 2026-06-17 against the named endpoints; treat as orders-of-magnitude, re-probe before relying on exact figures."
---

# skill-bill — where UK Bills are recorded, and how to reconcile them

## What a Bill *is* (primer)

A **Bill is a *proposed* law** — a draft text formally before Parliament.
Only if it clears every stage and gets **Royal Assent** does it become an
**Act** (the law). So **Bill = proposal in motion; Act = enacted result**;
"Bill" names the *document* while it travels through the Houses. Types:
**Public** (most — Government or Private Members'), **Private** (a specific
body/place, e.g. `Greater Manchester (Light Rapid Transit System) Bill`),
**Hybrid** (a mix, e.g. HS2).

**Bills are intensely printed objects** — print is a formal procedural act,
not packaging:
- At First Reading a Bill is **"ordered to be printed"** → published as a
  numbered House paper (**"Bill 120"** of the session); that print is the
  authoritative debated text.
- It is **reprinted every time it changes** (as introduced → as amended in
  committee → as amended on report → as sent to the other House); each
  reprint is its own numbered paper, amendments on separate Marshalled-List
  sheets. The `[HL]` tag is a printing convention (Lords-origin).
- On passing, the Act was traditionally **engrossed on vellum** (two copies,
  kept by the Parliamentary Archives) until archival paper replaced it ~2017.

So one bill spawns **many numbered printed artifacts** over its life — which
is why they live as **Sessional Papers** and why the `bill-papers` API lists
*publications per bill* (as-introduced, Explanatory Notes, Amendment Papers,
the Act as passed). The "deep historical bill record" is, physically, a pile
of numbered printed papers, digitised wholesale only in paywalled ProQuest.

## Why this exists

UK **Bills** are the worst-served legislative record. The structured
sources skew to either *recent* bills or *passed* bills (Acts), so the
historical long tail — failed bills, private bills, drafts, anything
before the digital era — falls through every gap. The **UK Parliament
Thesaurus** is the only place that indexes 7,475 Bills back to the early
1990s, but it holds **titles only, no machine identifiers**. Building a
proper bill register means *reconciling* these surfaces; this skill is
the map of the terrain and the recommended method.

(For the live Bills API itself, see [`bills`](../bills/SKILL.md). For the
thesaurus crawl, see [`parliament-thesaurus`](../parliament-thesaurus/SKILL.md).)

## The data landscape (measured 2026-06-17)

| Source | Bills | Acts | SIs | Form / identifiers | Coverage |
|---|---|---|---|---|---|
| **Bills API** `bills-api.parliament.uk` | **3,928** | — | — | JSON, `billId`, stages, sponsors, sessions | ~2015→ (digital era) |
| **Bill Papers** `api.parliament.uk/bill-papers` | 3,929 | (as-passed) | — | CSV/RSS, document trail | same modern set — **no historical depth** |
| **Parliament Thesaurus (LEG)** | **7,475** | 3,349 | 322 | SKOS, **title only — NO id** | early-1990s→, the unique historical index |
| **DDP SPARQL** `api.parliament.uk/sparql` | **0 (absent)** | **17,612** `ActOfParliament` | ~11,787 (`StatutoryInstrumentPaper` 6,978 + `MadeStatutoryInstrumentPaper` 4,809) | RDF URIs + structured metadata | Acts/SIs rich; **Bills not modelled at all** |
| **legislation.gov.uk** | — | all UK Acts (canonical) | tens of thousands | URIs, FRBR | passed legislation only |
| **Wikidata** (via QLever) | **~2–20** | **19,134** | — | QID, CC0 | Acts well-covered (≈DDP); **Bills effectively absent** |
| **Modern Hansard API** `hansard-api` | stage debates | — | — | JSON, full-text | 1988→ |
| **Historic Hansard** `api.parliament.uk/historic-hansard` | **per-bill stage pages** | per-Act pages | — | **HTML only** (`/bills/{slug}`) | 1803–2005 |
| **Journals of the House** | authoritative stages | " | " | **no open data** (BHO HTML / ProQuest / PDF) | centuries |

LEG composition (of 11,149): **7,475 Bills · 3,349 Acts · 322 SIs/Orders/Regs · 3 other**;
of which 1,579 are Lords-origin `[HL]` and 176 `Draft`.

## Is matching a SPARQL job or an AI job? — per record type

The deciding fact: a thesaurus **LEG term carries only a title string +
hierarchy + notation — zero identifiers** linking to the canonical
record, and the canonical records live in *different stores*. So:

- **Acts → fancy SPARQL/ETL, ~no AI.** DDP `ActOfParliament` already
  carries `actOfParliamentName`, `actOfParliamentYear`,
  `actOfParliamentNumber`, `actOfParliamentRoyalAssentDate`, **and the
  `actOfParliamentUrl` = the legislation.gov.uk URI**, plus `enabling`
  (→ the SIs it enables). Matching a LEG Act is a deterministic
  normalise-and-join on **name + year**; the legislation.gov.uk crosswalk
  comes free. The thesaurus is the *poorer, redundant* side here.
- **SIs → SPARQL too.** DDP holds ~11,787 structured SI papers vs the
  thesaurus's 322. DDP is canonical; same deterministic join.
- **Bills → the only genuinely hard / unique case.** Bills are in
  **neither** DDP, legislation.gov.uk, nor Wikidata. The Bills API covers
  ~3,928 (≈2015→); the thesaurus uniquely holds **7,475** back to the
  '90s. So: title+session normalisation join against the REST API for the
  recent overlap, **fuzzy/AI only for the messy tail** (`[HL]` variants,
  session formats `2000/01` vs `2000-01`, `Draft`, carry-overs, renames),
  and for the **pre-API historical half there is simply no canonical
  record to match to** — the thesaurus *is* the register.

**Verdict:** ~80 % deterministic (normalise + join), ~20 % fuzzy. Lead
with SPARQL/ETL; reserve AI for the residue. The missing artifact isn't
intelligence — it's a **stable-ID crosswalk** nobody has published.

## skosdex Solr — the matching engine

skosdex (`skosdex.fly.dev`) re-hosts the full 141,822-term thesaurus and
exposes a **Solr** index that does what our exact-label matcher can't:
**fuzzy / proximity search**. Verified: `prefLabel_en:"Elections Bill"~2`
returns the real LEG terms ranked by score (`Elections Bill 2000/01`,
`…2021-22`). Caveat: Solr **stores** only `id` + `scheme` but **indexes**
`prefLabel_en` / `altLabel_en`; **`notation` is not a Solr field**. So
the clean two-stage pattern is:

1. **Solr** → fuzzy bill title → candidate term IDs (recall), then
2. **SPARQL** (skosdex or our fpkg) → confirm `notation = LEG`, pull
   year/type, join onward (precision).

```
# Solr fuzzy candidate generation
GET https://skosdex.fly.dev/solr/skos/select?q=prefLabel_en:"<title>"~2
    &fq=scheme:"http://data.parliament.uk/terms/"&fl=id,score&wt=json
```

### The `notation` typing (record-kind) is the key denoiser

`skos:notation` is a per-term record-kind code. Distribution over the
141,822 terms:

| notation | n | kind |
|---|---|---|
| ORG | 53,570 | organisations |
| *(blank)* | 49,197 | uncoded mix (people, orgs, concepts…) |
| NAME | 12,320 | people |
| **LEG** | **11,149** | **legislation (Bills/Acts/SIs)** |
| ID | 8,660 | identifiers / regions |
| SIT | 4,059 | Subject Indexing Terms (topical subjects) |
| DEP, TPG, CTP, PBT, INT | ~3k | departments, specialist categories |

Filtering matches by `notation` removes named-entity false-positives
(e.g. a feed/title "Justice" hitting the **charity "JUSTICE" (ORG)**).
For bills specifically, restrict to `notation = "LEG"`.

## The crosswalk to build (RDF shape)

Fits the repo's named-graph pattern (`identity-graph`, `psephology`,
`fcdo-treaties`): a `.nq.gz` loaded into the fpkg Oxigraph store with a
SHACL shape. `billId`-keyed, "Bills-API-meets-thesaurus":

```turtle
:bill a parl:Bill ;
  parl:billId 3774 ;                          # Bills-API canonical key
  skos:prefLabel "Elections Bill 2021-22" ;
  parl:session "2021-22" ; parl:billType "Public" ;
  parl:originatingHouse "Commons" ;
  parl:currentStage … ; parl:sponsor <member> ;       # ← Bills API
  skos:exactMatch <…/terms/NNN> ;             # ← thesaurus LEG term (historical + subject index)
  parl:debatedAt  <hansard sitting> , … ;     # ← Hansard / Historic Hansard stage refs
  parl:resultingAct <ddp ActOfParliament> ;   # ← DDP (gives legislation.gov.uk URI free)
  owl:sameAs <wikidata QID> .                 # ← only the notable few
```

What's already free vs the real work:
- **Acts/SIs side is basically done in DDP** — reference it, don't rebuild
  (DDP `ActOfParliament` → `actOfParliamentUrl` legislation.gov.uk +
  `enabling` → SIs).
- **The work is Bills:** Bills-API spine + reconciling the 7,475 LEG
  bills (Solr-fuzzy + `notation=LEG` confirm) with a
  `judgment_needed.jsonl` for the `[HL]`/draft/session tail — the same
  playbook as the `appg` officer resolver.

## Filling the historical gap — Historic Hansard `/bills/`

The pre-2015 bills exist nowhere structured, but **Historic Hansard
already aggregates a bill's whole debate history per page** (verified):

- `…/historic-hansard/bills/index.html` — **A–Z index of every bill slug**
  (`abandonment-bill`, `abattoirs-bill`, …) → enumerable.
- `…/historic-hansard/bills/{slug}` — one page per bill name, linking
  **every dated stage debate** (`/commons|lords/{yyyy}/{mon}/{dd}/…`).
  Example: `bills/companies-bill` → **531 stage links** spanning 1859,
  1860, … 1989.
- **HTML only** — no `.xml`/`.json`/content-negotiation (all 404). The
  only structured alternative is mySociety **`parlparse`** XML
  (`scrapedxml/debates/`, `lordspages/`), the data behind TheyWorkForYou
  (see [`mysoc-twfy`](../mysoc-twfy/SKILL.md)).
- ⚠ **Disambiguation caveat:** slugs are by **bill *name***, conflating
  same-named bills across centuries (one `companies-bill` for 1860 *and*
  1989). Split by sitting-date clusters / session before trusting it.

**Do NOT ingest full Hansard text into fpkg** (≈10⁹ words, wrong shape).
Crawl only the `/bills/` (and `/acts/`) index → a compact
`bill → {stage, date, house}` graph. Use the resumable per-URL cache
pattern from [`parliament-thesaurus`](../parliament-thesaurus/SKILL.md).

### Journals of the House — authoritative, but not a crawl target

The Journals are the *legally definitive* procedural record (what was
*done*, not just said). But: **no open data** — verified no LDA/DDP
dataset; historical volumes are transcribed HTML on **British History
Online** (Commons Journal ~1547–1830s, Lords Journal) and comprehensively
in paywalled **ProQuest U.K. Parliamentary Papers**; recent sessions are
**PDF** on publications.parliament.uk. Extraction = BHO scrape + OCR,
high cost, largely redundant with Hansard for bill purposes. **Use as a
phase-2 authoritative cross-check, not an ingest.**

## Who already uses this (don't reinvent the text)

- **Historic Hansard** is *heavily* used: the site itself is mySociety's
  crawl (was `hansard.millbanksystems.com`) powering **TheyWorkForYou**;
  the **Hansard Corpus** (~1.6 bn words, 1803–2005, Glasgow/SAMUELS) and
  **Hansard at Huddersfield** are serious academic digitisations.
- **Journals** are used by historians via BHO/ProQuest — as reading text,
  not data.

So the *text* is well-trodden. **The un-built, defensible artifact is the
structured bill-identity crosswalk** (`billId ↔ LEG term ↔ Hansard
stages ↔ resulting Act ↔ legislation.gov.uk ↔ Wikidata`) — that's what
this graph would add.

## What becomes of a bill — and the catalogue question

- **Passes → Act:** canonical record = the Act (legislation.gov.uk digital;
  original vellum in the **Parliamentary Archives**, copy at TNA).
- **Fails / withdrawn:** survives as a printed **Sessional Paper** (HC/HL
  Bill No. *N*, per session) — paper, not data.

**Scrapeable OPAC? Mostly no** (probed 2026-06-17, all gated):
- **ProQuest U.K. Parliamentary Papers** — *the* comprehensive catalogue +
  full text of every printed Bill (1715→), but **paywalled** (auth-redirect).
- **Parliamentary Archives** catalogue ("Portcullis") is **retired /
  migrating** (Victoria Tower R&R); `archives.parliament.uk` 301s to a
  bot-gated parliament.uk page.
- **Commons Library catalogue** = `search.parliament.uk` → **Microsoft
  login** (internal, not public).
- Open-ish: **Jisc Library Hub Discover**, **British Library** OPAC — list
  parliamentary papers, scrapeable but holdings-oriented / partial.

**Key reframe — we already hold the Library's bill index.** The thesaurus
*is* the **House of Commons Library's own controlled index** (skosdex labels
it "Commons Library"; heritage of the old POLIS indexing). Its **7,475 LEG
bill terms ARE the Library's catalogue of bills**, so "scrape the Library
OPAC" ≈ *already done*. What it lacks (printed bill numbers, holdings, exact
dates) is what's locked in ProQuest / the migrating Archives catalogue.

## Where it's all kept — the archival reality (per the TNA Parliament guide)

Source: <https://www.nationalarchives.gov.uk/help-with-your-research/research-guides/parliament/> (read 2026-06-17). This explains why **no comprehensive open bill dataset exists or can**:

1. **The 1834 fire** — *"almost all the original records of the House of
   Commons were lost in the fire that destroyed the building in 1834."*
   Pre-1834 Commons bill papers are largely **gone**; the Lords side
   survived (hence original **Acts from 1497** do).
2. **Unprinted Private Acts** — *"Private Acts were not always printed or
   published"* → some legislation has **no published record to crawl**.
3. **No official pre-1803 debates** — Hansard starts 1803; earlier =
   unofficial (see the must-have below).

### ⭐ MUST-HAVE: pre-1803 debates — Cobbett's Parliamentary History (1066–1803)

Per the TNA guide: *"Before 1803 parliamentary debates were unofficial.
The most complete collection of these is **Cobbett's Parliamentary
History of England, 1066–1803** via Digital Bodleian."* This is the only
substantial pre-Hansard record of what Parliament discussed — **essential
for any ancient bill-mention search.**

- Collection (page scans, IIIF): <https://digital.bodleian.ox.ac.uk/collections/cobbetts-parliamentary-history/>
- Cited from: <https://www.nationalarchives.gov.uk/help-with-your-research/research-guides/parliament/>
- ~36 volumes (publ. 1806–1820). **Bodleian gives page *images*** → would
  need OCR. But the work is long out of copyright, so **OCR'd full text
  almost certainly already exists** on Internet Archive / HathiTrust /
  Google Books — *check-then-fill*: pull existing full text rather than
  re-OCR scans. Target dir: `third_party/data/cobbetts-parl-history/`.

So the open structured sources (7,475 thesaurus bills, 3,928 API, ~17–19k
Acts in DDP/Wikidata, legislation.gov.uk) are **modern / in-force /
published slices** — the real historical volume (19th-C railway / canal /
enclosure Local & Personal Acts + all *failed* bills) is many tens of
thousands, uncountable cleanly.

**The map of homes:**

| Record | Home | Online |
|---|---|---|
| **Parliament Rolls 1275–2010** | TNA `SC 9` (1289–1322), `C 65` (1327–2010) | transcripts 1275–1504 on BHO (free onsite TNA) |
| **Original Acts** | **<1497 TNA**; **1497→ Parliamentary Archives** | legislation.gov.uk (in-force + most published) |
| **Parliamentary Papers** (printed Bills) | TNA + legal-deposit libraries | **ProQuest UKPP** HC 1715–2015 / HL 1714–1911 (paywalled) |
| **Journals** (what was *done*) | TNA (manuscript + print) | Commons 1835–2015, Lords 1997–2017 on parliament.uk; pre-1835 partial BHO |
| **Hansard** (what was *said*) | — | **free** (Historic 1803–2005 + modern) |
| Comprehensive statutes | Statutes of the Realm / at Large (TNA ref library) | The Statutes Project; VLex Justis (Acts from 1235, free onsite TNA) |

**🚨 The Parliamentary Archives has physically RELOCATED to The National
Archives** (recent; reopening "in phases") — so the whole PA collection
(Acts 1497→, Journals, bill papers) is now at TNA, which already held the
pre-1497 Acts and the departmental records behind Command/Deposited Papers.
That's why `archives.parliament.uk` redirects and the catalogue is in flux.

**ProQuest "monopoly":** UKPP is the ex-Chadwyck-Healey digitisation of the
printed Papers — *de facto* sole comprehensive full-text, **subscription
but free onsite at TNA Kew + university libraries**. Hansard (debates) is
free and "peripheral"; the larger, older **Papers** corpus is the gated
part — Crown-copyright public records behind a commercial platform.

**Physical access:** open to anyone, free, onsite at TNA Kew (incl. free
ProQuest/VLex/BHO there) and via legal-deposit / university libraries.
The barrier is *free-from-home digital*, not access.

Also: **History of Parliament Trust** (historyofparliamentonline.org) —
MP biographies + constituencies from the 13th C; the natural spine for the
"for any MP, their bills" / "for any session, its bills" joins.

## Building the bill-mention archive (the OCR question)

"Actual bill mentions" do **not** need OCR — **Historic Hansard `/bills/` is
HTML** and already aggregates them per bill (`companies-bill` → 531 dated
stage links). So the mention-archive is a **crawl, not an OCR project**
(→ future `skill-bill-hansard`). OCR is only for genuinely un-digitised
scans (Journals, printed Sessional Papers), and **much of that is already
OCR'd by others** (ProQuest, Glasgow Hansard Corpus ~1.6 bn words, British
History Online) — so the task is *check-then-fill*, not re-digitise from
scratch. Sequence: crawl the HTML mentions first; OCR only what's provably
missing.

## Build status & the joins (the bill-centric graph)

What's pulled into `third_party/` and derived so far:

- **`cobbetts-parl-history/`** — pre-1803 debates: 36 canonical OCR volumes
  (BSB), gzipped; alternates re-fetchable via `scripts/fetch-cobbetts.mjs`.
- **`historic-hansard-bills/`** — bill stages 1803–2005:
  `bills.json` / `bills.nq.gz` (2,590 pages, 7,355 dated stage refs) →
  **`bills-disambiguated.json`** (2,843 instances; `scripts/disambiguate-hh-bills.mjs`
  splits same-named bills by >4yr gaps — e.g. `armed-forces-bill` → the eight
  quinquennial Acts 1965…2001) → **`bills-by-session.json`** (instances grouped
  by start year). **Join key = `(slug, yearStart)`.**

Join status — what each needs:

| Join | Now | Needs |
|---|---|---|
| **bill → debates** | ✅ `bills.nq.gz` (`debatedAt` → dated sitting) | — |
| **session/year → bills** | ✅ `bills-by-session.json` (year as session proxy) | map year → named session (whatson/calendar) |
| **bill → resulting Act** | — | title+year → DDP `ActOfParliament` → legislation.gov.uk (phase 1, deterministic) |
| **MP → their bills** | partial | modern: **Bills-API sponsors**; historical: crawl the **speakers on each bill's sitting pages** (Historic Hansard) — the sittings are already linked, just not yet fetched |
| **bill → votes** | — | Historic Hansard `/divisions/` + `commons-votes`/`lords-votes` APIs |
| **person spine** | — | **History of Parliament Trust** (MPs/members, 13th C→) |

⚠ Data-quality: the HH crawl's bill index missed some pages (e.g.
`companies-bill` resolves live but is absent from `bills.json`) — needs a
reconcile pass against the live `/bills/index.html`.

## Recommended phases

1. **Deterministic spine (cheap 80 %).** Pull the Bills-API 3,928; join
   passed bills → DDP `ActOfParliament` on name+year → inherit
   legislation.gov.uk URI. Pure ETL.
2. **Historical bills.** Crawl Historic Hansard `/bills/` index → stage
   graph; reconcile to LEG terms (Solr-fuzzy + `notation=LEG`); ambiguous
   → `judgment_needed.jsonl`.
3. **Validate** against the Journals (sampled), sprinkle Wikidata QIDs on
   the notable few.

## Reproducible probes

```sh
# DDP: Act shape (title + year + legislation.gov.uk URL + enabling)
curl -s -H 'Accept: application/sparql-results+json' \
  --data-urlencode 'query=SELECT ?p ?o WHERE { ?s a <https://id.parliament.uk/schema/ActOfParliament> . ?s ?p ?o } LIMIT 25' \
  https://api.parliament.uk/sparql

# skosdex: notation distribution (record kinds)
curl -s -H 'Accept: application/sparql-results+json' --data-urlencode \
  'query=SELECT ?v (COUNT(*) AS ?n) WHERE { GRAPH <http://data.parliament.uk/terms/> { ?s <http://www.w3.org/2004/02/skos/core#notation> ?v } } GROUP BY ?v ORDER BY DESC(?n)' \
  https://skosdex.fly.dev/query

# Wikidata via QLever (WDQS times out): UK Acts count
curl -s -H 'Accept: application/sparql-results+json' --data-urlencode \
  'query=PREFIX wd: <http://www.wikidata.org/entity/> PREFIX wdt: <http://www.wikidata.org/prop/direct/> SELECT (COUNT(DISTINCT ?a) AS ?n) WHERE { ?a wdt:P31/wdt:P279* wd:Q4677783 }' \
  https://qlever.dev/api/wikidata

# Historic Hansard: a bill's whole stage history (HTML)
curl -s https://api.parliament.uk/historic-hansard/bills/companies-bill   # 531 dated stage links
```

## Cross-references

- [`bills`](../bills/SKILL.md) — live Bills API (the spine).
- [`bill-papers`](../bill-papers/SKILL.md) — per-bill document catalogue.
- [`parliament-thesaurus`](../parliament-thesaurus/SKILL.md) — the LEG
  terms + the resumable crawl pattern.
- [`sparql`](../sparql/SKILL.md) — DDP store (`ActOfParliament`,
  `StatutoryInstrumentPaper`).
- [`statutory-instruments`](../statutory-instruments/SKILL.md),
  [`tna-legislation`](../tna-legislation/SKILL.md) — SIs / legislation.gov.uk.
- [`hansard`](../hansard/SKILL.md),
  [`historic-hansard`](../historic-hansard/SKILL.md) — stage debates.
- [`wikidata`](../wikidata/SKILL.md) — QLever endpoint (`qlever-wikidata`).
- [`mysoc-twfy`](../mysoc-twfy/SKILL.md) — parlparse / TheyWorkForYou.
- [`identity-graph`](../identity-graph/SKILL.md) — the reconciliation
  pattern this would follow, for legislation instead of people.
