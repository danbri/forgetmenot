# forgetmenot — UK Parliament APIs and datasets, as skills + CLI

A repository of skills (one folder per facility under `skills/`) plus
a Node CLI (`bin/parl.mjs`, installed as `parl`) and a JS library
(`lib/facilities/`) that wrap every UK Parliament-operated API and
dataset I could identify, plus the third-party data sources (mySociety,
ONS, OS, TNA, Electoral Commission, Wikidata, …) that join into them.

Skills are plain Markdown with YAML frontmatter; they document each
facility with enough information for a language model to construct
correct HTTP requests directly. The CLI and library exist so the same
behaviour is callable from a shell or a Node program without an LLM
in the loop.

Starting point: the catalogue at <https://explore.data.parliament.uk/>
and the developer hub at <https://developer.parliament.uk/>. The
tier-3 sources are documented inside their own skills.

## Layout

```
forgetmenot/
├── readme.md                          # this file
├── CLAUDE.md                          # repo-wide instructions + the facility table
├── docs/
│   ├── worklog.md                     # append-only narrative
│   ├── todo.md                        # deferred items
│   ├── installation.md                # wiring the skills + CLI up
│   ├── provenance.md                  # tier 1/2/3 naming + citation rules
│   └── triple-stores.md               # DDP vs DD vs the internal third store
├── bin/
│   └── parl.mjs                       # the CLI dispatcher (installs as `parl`)
├── lib/
│   ├── http.mjs                       # shared fetch wrapper
│   └── facilities/<slug>.mjs          # one JS module per facility
├── browser/                           # browser entry point + demo HTML
├── scripts/                           # refetch / probe / skill-update + per-corpus crawlers
├── _specs/                            # cached OpenAPI specs + endpoint tables
├── skills/<slug>/                     # one folder per facility, each with SKILL.md + reference.md
├── third_party/data/                  # crawled corpora (gov.uk content, FCDO treaties, MP sites, …)
└── tests/
    ├── test_endpoints.sh              # endpoint smoke test
    └── test_cli.sh                    # CLI smoke test
```

## Facilities

Naming follows `docs/provenance.md`: facilities with no prefix are
**tier 1** — first-party Parliament data. Facilities prefixed with a
producer (`mysoc-`, `ons-`, `tna-`, `ec-`, `dc-`, `mysoc-`, …) are
**tier 3** — operated by another body but joining onto the Parliament
graph by postcode, member id, date, or shared identifier. The
`appg` skill is tier 2 — Parliament publishes the source HTML, we
interpret it with heuristics.

The authoritative listing is the table in
[`CLAUDE.md`](CLAUDE.md). At a glance:

### Tier 1 — first-party Parliament

| Skill | Endpoint |
|---|---|
| [`members`](skills/members/SKILL.md) | `members-api.parliament.uk` |
| [`bills`](skills/bills/SKILL.md) | `bills-api.parliament.uk` |
| [`committees`](skills/committees/SKILL.md) | `committees-api.parliament.uk` |
| [`hansard`](skills/hansard/SKILL.md) | `hansard-api.parliament.uk` |
| [`commons-votes`](skills/commons-votes/SKILL.md) | `commonsvotes-api.parliament.uk` |
| [`lords-votes`](skills/lords-votes/SKILL.md) | `lordsvotes-api.parliament.uk` |
| [`oral-questions-and-edms`](skills/oral-questions-and-edms/SKILL.md) | `oralquestionsandmotions-api.parliament.uk` |
| [`written-questions-and-statements`](skills/written-questions-and-statements/SKILL.md) | `questions-statements-api.parliament.uk` |
| [`statutory-instruments`](skills/statutory-instruments/SKILL.md) | `statutoryinstruments-api.parliament.uk` |
| [`treaties`](skills/treaties/SKILL.md) | `treaties-api.parliament.uk` (the ~323-record CRaG window) |
| [`interests`](skills/interests/SKILL.md) | `interests-api.parliament.uk` |
| [`erskine-may`](skills/erskine-may/SKILL.md) | `erskinemay-api.parliament.uk` |
| [`now`](skills/now/SKILL.md) | `now-api.parliament.uk` (live annunciator) |
| [`petitions`](skills/petitions/SKILL.md) | `petition.parliament.uk` |
| [`historic-hansard`](skills/historic-hansard/SKILL.md) | `api.parliament.uk/historic-hansard/` (HTML; 1803–2005) |
| [`members-data-platform`](skills/members-data-platform/SKILL.md) | `data.parliament.uk/membersdataplatform/` (legacy MNIS) |
| [`data-parliament-uk-datasets`](skills/data-parliament-uk-datasets/SKILL.md) | catalogue of the 19 explore.data.parliament.uk datasets |
| [`whatson`](skills/whatson/SKILL.md) | `whatson-api.parliament.uk` — calendar, sittings, sessions, procedural dates |
| [`guide-to-procedure`](skills/guide-to-procedure/SKILL.md) | `guidetoprocedure-api.parliament.uk` |
| [`bill-papers`](skills/bill-papers/SKILL.md) | `api.parliament.uk/bill-papers` — CSV catalogue + per-bill RSS |
| [`library-feeds`](skills/library-feeds/SKILL.md) | `api.parliament.uk/library-feeds` — Commons / Lords / POST briefings RSS |

Linked-data / RDF stack:

| Skill | Endpoint |
|---|---|
| [`sparql`](skills/sparql/SKILL.md) | `api.parliament.uk/sparql` (DDP store, inference off) |
| [`odata`](skills/odata/SKILL.md) | `api.parliament.uk/odata/` — 183 entity sets |
| [`parameterised-query`](skills/parameterised-query/SKILL.md) | `api.parliament.uk/query/` — 124 named SPARQL templates |
| [`linked-data-api`](skills/linked-data-api/SKILL.md) | `lda.data.parliament.uk` (Elda; legacy datasets) |

### Tier 2 — scraped Parliament HTML

| Skill | Source |
|---|---|
| [`appg`](skills/appg/SKILL.md) | All-Party Parliamentary Groups Register on `publications.parliament.uk` (no JSON API) |

### Tier 3 — third-party producers joining onto Parliament

| Skill | Operator |
|---|---|
| [`mysoc-mapit`](skills/mysoc-mapit/SKILL.md) | mySociety — postcode / lat-lon → every administrative area, including Westminster constituency |
| [`ons-geo`](skills/ons-geo/SKILL.md) | ONS — authoritative constituency / ward / LAD boundary polygons |
| [`ons-nomis`](skills/ons-nomis/SKILL.md) | ONS — Census 2021 + labour-market data per constituency / LAD / OA |
| [`os`](skills/os/SKILL.md) | Ordnance Survey OpenData — Boundary-Line, Code-Point Open, OpenNames, OpenUPRN, OpenRoads, … |
| [`mysoc-twfy`](skills/mysoc-twfy/SKILL.md) | mySociety — TheyWorkForYou debate transcripts + mySociety voting summaries (API key) |
| [`tna-caselaw`](skills/tna-caselaw/SKILL.md) | TNA — Find Case Law judgments (Supreme Court, Court of Appeal, High Court, Upper Tribunals) |
| [`tna-discovery`](skills/tna-discovery/SKILL.md) | TNA — Discovery catalogue (~37M descriptions across TNA + 2,500 partner archives) |
| [`tna-legislation`](skills/tna-legislation/SKILL.md) | TNA — legislation.gov.uk as Linked Data (Acts, SIs, devolved-legislature, retained-EU) |
| [`dc-candidates`](skills/dc-candidates/SKILL.md) | DemocracyClub — every UK electoral candidate with stable IDs |
| [`dc-elections`](skills/dc-elections/SKILL.md) | DemocracyClub — every UK election with canonical IDs |
| [`ec-donations`](skills/ec-donations/SKILL.md) | Electoral Commission — donations, spending, loans, registered campaigners |
| [`wikidata`](skills/wikidata/SKILL.md) | Wikidata — SPARQL + label search; cross-ID glue across UK political identifier ecosystems |
| [`nao`](skills/nao/SKILL.md) | National Audit Office — Value-for-Money reports feeding the PAC |
| [`obr`](skills/obr/SKILL.md) | Office for Budget Responsibility — EFO / FSR / policy costings |
| [`osr`](skills/osr/SKILL.md) | Office for Statistics Regulation — censures of misused statistics |
| [`ico`](skills/ico/SKILL.md) | Information Commissioner's Office — FOI / data-protection / EIR enforcement notices |
| [`gov-data`](skills/gov-data/SKILL.md) | data.gov.uk CKAN — ~58,000 datasets from central departments + ~4,275 councils |
| [`gov-content`](skills/gov-content/SKILL.md) | gov.uk Content + Search API — every gov.uk page as structured JSON |
| [`govuk-orgchart`](skills/govuk-orgchart/SKILL.md) | gov.uk Whitehall org chart — ministerial roles, holders, organisations, past office-holders |
| [`sp`](skills/sp/SKILL.md) | Scottish Parliament Open Data — MSPs, parties, committees, constituencies, regions |
| [`nia`](skills/nia/SKILL.md) | NI Assembly Open Data — MLAs, NI constituencies, Stormont Hansard, divisions |
| [`senedd`](skills/senedd/SKILL.md) | **Stub.** Senedd Cymru ModernGov SOAP service; WSDL discovery only |
| [`scotgov-stats`](skills/scotgov-stats/SKILL.md) | statistics.gov.scot — Scottish Government RDF DataCube SPARQL |
| [`eur-lex`](skills/eur-lex/SKILL.md) | EUR-Lex CELLAR SPARQL — EU law as Linked Data (Retained EU Law cross-references) |
| [`ea-flood`](skills/ea-flood/SKILL.md) | Environment Agency Real-Time Flood Monitoring (England) |
| [`fsa`](skills/fsa/SKILL.md) | Food Standards Agency — every E/W/NI food business rated 0–5 (~660k records) |
| [`mysoc-fms`](skills/mysoc-fms/SKILL.md) | mySociety — FixMyStreet street-level issue reports (RSS only) |
| [`fcdo-treaties`](skills/fcdo-treaties/SKILL.md) | FCDO UK Treaties Online — ~21,957 treaty records back to the early 19th century, lifted to RDF |

CLI conventions are documented as a top-level skill at
[`skills/parl`](skills/parl/SKILL.md) — every per-facility skill
references it. Data-quality discipline is documented at
[`skills/data-quality`](skills/data-quality/SKILL.md).

## How to use

```sh
git clone https://github.com/danbri/forgetmenot
cd forgetmenot
npm install                         # CLI deps (Node ≥ 20)
bash scripts/install-skills.sh      # wires skills/ into .claude/skills/
                                    # via absolute symlinks (gitignored)
```

Then open the repo with Claude Code — every skill auto-discovers.
Use `--user` to install personally (available in every project),
`--copy` for Windows / restricted filesystems, `--uninstall` to undo.

The CLI is callable as `node bin/parl.mjs <facility> <command> [args]`
or, if you alias / npm-link it, `parl <facility> <command>`. Run
`parl --help` for the full facility list and `parl <facility> --help`
for commands.

The long answer (Anthropic Agent SDK, Claude API, claude.ai, other
LLM platforms) is in [`docs/installation.md`](docs/installation.md).

A no-LLM use also works: the cached OpenAPI specs in `_specs/` are
self-contained and the discovery scripts let you re-run the cataloguing
yourself.

## How the discovery worked

Documented in [`docs/worklog.md`](docs/worklog.md). For the tier-1
Parliament APIs the `developer.parliament.uk` hub itself returned 403
to programmatic fetches, but each `*-api.parliament.uk` host serves
its OpenAPI spec on a predictable path — most on
`/swagger/v1/swagger.json`, three on `/swagger/docs/v1` (Swagger 2.0),
one on `/swagger/v2/swagger.json`. 13 OpenAPI specs were downloaded
and committed.

The remaining tier-1 facilities have no OpenAPI document and were
characterised by direct probing: SPARQL via a `SELECT *` query, OData
via the service document, parameterised query via the HTML root,
LDA via known dataset slugs, MNIS via its filter URL convention,
petitions via the public JSON:API host, historic Hansard by
documenting URL conventions only, and the data.parliament.uk dataset
family by extracting the static JSON list driving the SPA.

Tier-3 third-party sources were added one at a time, each with its
own discovery story in its skill folder. Where a producer publishes
an OpenAPI / SDMX / OData / SPARQL spec we wrap it; where (like
ICO, OBR, NAO, gov-data publication pages) only HTML + RSS exists we
wrap those. Every per-facility module in `lib/facilities/` includes
the discovery notes inline.

## Reproducing the catalogue

```sh
bash scripts/refetch-specs.sh        # 13 OpenAPI specs to _specs/
bash scripts/refetch-discovered.sh   # ~325 lines of discovered names
bash scripts/probe-endpoints.sh      # writes _specs/probes/<date>-probe.txt
bash tests/test_endpoints.sh         # smoke test
```

## RDF triple stores — local lore

Parliament runs **three** RDF triple stores; **two are public**. We refer
to them as **DDP** (`data.parliament`, the data catalogue, ~7.5M
triples) and **DD** (the procedural-ontology store covering statutory
instruments, treaties, written questions; ~3.14M triples; **inference
turned on**, so queries return the closure under the ontology). Both
run on GraphDB and are updated at least daily; neither is heavily
supported. The naming is local to this repo — Parliament does not
reliably call them "DDP / DD".

The public SPARQL endpoint at `api.parliament.uk/sparql` fronts mostly
DDP. Procedural-business questions that look like they should answer
but return empty may live in DD instead, in which case drop down to
the matching REST API (statutory instruments, treaties, written
questions). One of the two stores is bundled into a public GraphDB
Docker Hub container image; the other can be reconstructed from a
~2019 Wayback Machine capture — which is which is not clearly
recorded. See [`docs/triple-stores.md`](docs/triple-stores.md) for
fuller notes including verification queries.

## Open work

A non-trivial follow-up is to align the SPARQL ontology
(`rdfs:Class` / `owl:Class` plus the Parliament Thesaurus SKOS
scheme) with the concepts surfaced by each REST API, and record the
mapping. See [`docs/todo.md`](docs/todo.md).

An MCP server wrapping the same per-facility folders is also
deferred. Each skill folder is already enough to write one tool per
facility; the work is mechanical.

## Licence

The data is provided by the UK Parliament under the
[Open Parliament Licence](https://www.parliament.uk/site-information/copyright-parliament/open-parliament-licence/).
This repository — the skills, scripts and notes — is released under
the same licence.
