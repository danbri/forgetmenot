# forgetmenot — UK Parliament APIs and datasets

This repo wraps every UK Parliament-operated API and dataset as a
**skill** (one folder per facility under `skills/`) plus a Node CLI
(`bin/parl.mjs`, also installed as `parl`) and a JS library
(`lib/facilities/`).

When the user asks anything about UK Parliament — Members, Bills,
Hansard, Commons or Lords divisions, Committees, treaties, statutory
instruments, written or oral questions, Early Day Motions, the Register
of Members' Financial Interests, Erskine May, the SPARQL endpoint, the
linked-data API, e-petitions, historic Hansard (pre-1988), MNIS, the
parameterised-query browser, the OData service, or the older
data.parliament.uk dataset family — consult the skills under
`skills/<facility>/SKILL.md` and use the CLI to fetch real data. Cite
the URL you used.

## CLI usage

```sh
parl <facility> <command> [args] [--option value]   # if `parl` aliased / on PATH
node bin/parl.mjs <facility> <command> [args]       # otherwise

parl --help                       # list facilities
parl <facility> --help            # list commands for a facility
parl <facility> <command> --help  # one-line help for a command
```

Output is JSON to stdout by default (`--text` for human, `--raw` for
verbatim API response, `--out path` for binary downloads).

## Facilities

| Slug | Skill | What it covers |
|---|---|---|
| `members` | [`skills/members`](skills/members/SKILL.md) | MPs and peers, current and historical; constituencies; parties; government / opposition posts. |
| `bills` | [`skills/bills`](skills/bills/SKILL.md) | Bills through every stage including amendments and ping-pong. |
| `committees` | [`skills/committees`](skills/committees/SKILL.md) | Select / Joint committees, inquiries, evidence, publications, meetings. |
| `hansard` | [`skills/hansard`](skills/hansard/SKILL.md) | Hansard 1988→ — debates, contributions, divisions, full-text search. |
| `commons-votes` | [`skills/commons-votes`](skills/commons-votes/SKILL.md) | Commons divisions (recorded votes). |
| `lords-votes` | [`skills/lords-votes`](skills/lords-votes/SKILL.md) | Lords divisions (Content / Not Content). |
| `oral-questions` | [`skills/oral-questions-and-edms`](skills/oral-questions-and-edms/SKILL.md) | Tabled oral questions and EDMs. |
| `wq` | [`skills/written-questions-and-statements`](skills/written-questions-and-statements/SKILL.md) | Written questions, statements, daily reports. |
| `si` | [`skills/statutory-instruments`](skills/statutory-instruments/SKILL.md) | Statutory instruments and their procedures. |
| `treaties` | [`skills/treaties`](skills/treaties/SKILL.md) | Treaties laid under CRaG. |
| `interests` | [`skills/interests`](skills/interests/SKILL.md) | Register of Members' Financial Interests. |
| `em` | [`skills/erskine-may`](skills/erskine-may/SKILL.md) | Erskine May (parliamentary procedure manual). |
| `now` | [`skills/now`](skills/now/SKILL.md) | Live annunciator (what's on in each chamber now). |
| `petitions` | [`skills/petitions`](skills/petitions/SKILL.md) | UK Parliament e-petitions. |
| `sparql` | [`skills/sparql`](skills/sparql/SKILL.md) | Public SPARQL 1.1 endpoint over the DDP store. |
| `odata` | [`skills/odata`](skills/odata/SKILL.md) | OData v4 over the same data graph. |
| `pq` | [`skills/parameterised-query`](skills/parameterised-query/SKILL.md) | 124 named SPARQL templates returning JSON. |
| `lda` | [`skills/linked-data-api`](skills/linked-data-api/SKILL.md) | Legacy Linked Data API (Elda) datasets. |
| `hh` | [`skills/historic-hansard`](skills/historic-hansard/SKILL.md) | Historic Hansard 1803–2005 (HTML site). |
| `mnis` | [`skills/members-data-platform`](skills/members-data-platform/SKILL.md) | Legacy Members Data Platform. |
| `ddpd` | [`skills/data-parliament-uk-datasets`](skills/data-parliament-uk-datasets/SKILL.md) | Catalogue of the 19 explore.data.parliament.uk datasets. |
| `appg` | [`skills/appg`](skills/appg/SKILL.md) | All-Party Parliamentary Groups — scraped from the Register on publications.parliament.uk; no JSON API. |
| `whatson` | [`skills/whatson`](skills/whatson/SKILL.md) | Calendar, sittings, recess, parliamentary sessions, procedural dates (sitting / answer / tabling / annulment). |
| `gtp` | [`skills/guide-to-procedure`](skills/guide-to-procedure/SKILL.md) | MPs' Guide to Procedure — plain-English procedural explainers, distinct from Erskine May. |
| `bp` | [`skills/bill-papers`](skills/bill-papers/SKILL.md) | Bill Papers CSV catalogue + per-bill RSS at api.parliament.uk/bill-papers. |
| `library` | [`skills/library-feeds`](skills/library-feeds/SKILL.md) | RSS aggregator for Commons Library / Lords Library / POST research briefings. |
| `mapit` | [`skills/mysoc-mapit`](skills/mysoc-mapit/SKILL.md) | Tier-3: mySociety MapIt — postcode / lat-lon → Westminster constituency + every other administrative area. |
| `ons-geo` | [`skills/ons-geo`](skills/ons-geo/SKILL.md) | Tier-3: ONS Open Geography Portal — authoritative constituency / ward / LAD boundary polygons. |
| `nomis` | [`skills/ons-nomis`](skills/ons-nomis/SKILL.md) | Tier-3: Nomis — Census 2021 + labour-market data per constituency / LAD / MSOA / LSOA / OA. ~1,600 datasets. |
| `os` | [`skills/os`](skills/os/SKILL.md) | Tier-3: Ordnance Survey OpenData catalogue + downloads — Boundary-Line, Code-Point Open, OpenNames, OpenUPRN, OpenRoads, … |
| `twfy` | [`skills/mysoc-twfy`](skills/mysoc-twfy/SKILL.md) | Tier-3: TheyWorkForYou (mySociety) — voting summaries, debates, written answers, with mySociety analyses. API key required. |
| `caselaw` | [`skills/tna-caselaw`](skills/tna-caselaw/SKILL.md) | Tier-3: Find Case Law (TNA) — judgments from Supreme Court, Court of Appeal, **High Court**, Upper Tribunals as Akoma Ntoso XML + Atom feeds. |
| `candidates` | [`skills/dc-candidates`](skills/dc-candidates/SKILL.md) | Tier-3: DemocracyClub Candidates — every UK electoral candidate, with sources and stable IDs. |
| `elections` | [`skills/dc-elections`](skills/dc-elections/SKILL.md) | Tier-3: DemocracyClub EveryElection — every UK election (Westminster, devolved, mayoral, local, PCCs, parishes) with canonical IDs. |
| `ec` | [`skills/ec-donations`](skills/ec-donations/SKILL.md) | Tier-3: Electoral Commission — donations, spending, loans, registers of regulated parties and campaigners. |
| `wd` | [`skills/wikidata`](skills/wikidata/SKILL.md) | Tier-3: Wikidata SPARQL + label search — cross-ID glue across every UK politician identifier ecosystem. |

The CLI itself is documented as a top-level skill at
[`skills/parl`](skills/parl/SKILL.md) — every per-facility skill
references it for CLI-wide conventions (output modes, flag rules,
idiomatic chains).

## Idiomatic chains

- **Postcode → MP**: `parl pq postcode "SW1P 3JA"` (one call) or
  `parl members constituency-search` then
  `parl members constituency <id>`.
- **MP → recent voting**: `parl members search --name X --take 1` →
  take the `id`, then `parl commons-votes member <id> --take 25`.
- **Bill → debates**: `parl bills search --term "X"` → take `billId`,
  `parl bills stages <billId>`, then `parl hansard search-debates
  --term "X"` to find the floor debate.
- **Committee inquiry**: `parl committees search --term "X"` →
  `parl committees business-search --committee-id <id>` →
  `parl committees oral-evidence-search --committee-business-id <id>`.
- **APPG officers → member IDs**: `parl appg resolve --out
  third_party/data/appg` crawls the current APPG Register and
  resolves every officer's free-text name to a Members API id
  (99% auto-resolution; ambiguous cases land in
  `judgment_needed.jsonl`).
- **MP RSS posts**: after `parl members crawl-sites`, run
  `parl members news --out third_party/data/news` to harvest
  every MP's blog/news feed into a flat JSONL of posts.

## Three triple stores

Local lore, captured in [`docs/triple-stores.md`](docs/triple-stores.md):
Parliament runs **three** RDF triple stores; **two are public**.

- **DDP** (`data.parliament`, the data catalogue, ~7.5M triples,
  inference off) is what `api.parliament.uk/sparql` actually fronts.
- **DD** (procedural ontology over SIs, treaties, written questions,
  ~3.14M triples, **inference on**) is **not on the public SPARQL
  endpoint**. Procedural-business questions that look like they should
  match SPARQL but return empty often live in DD; drop down to the
  matching REST API instead.
- The third store is internal and not public.

## Honesty about coverage

- Every fact stated should be backed by a tool call. Do not
  reconstruct vote counts, member names, or dates from memory.
- The CLI returns the URL it called via `--raw`; cite it.
- If a query needs synthesis across many resources, chain calls; do
  not collapse to "based on my knowledge".
- Connectivity flakes happen; the CLI retries 5xx but not network
  failures. If you see HTTP 000 / SSL errors, retry once before
  reporting failure.

## Provenance and naming

Repo focus is **UK Parliament** material. Skills are tagged by
provenance tier — see [`docs/provenance.md`](docs/provenance.md):

| Naming | Tier |
|---|---|
| No prefix (`bills`, `members`, `hansard`, `si`, …) | **1 — first-party Parliament.** Authoritative. |
| `scraped-<name>` | **2 — Parliament HTML + our heuristics.** Authoritative upstream, heuristic interpretation. |
| `<producer>-<name>` (`mysoc-twfy`, `tna-legislation`, `ec-donations`, `wikidata`, …) | **3 — third-party.** Operator named by the prefix. |

When using any skill in an answer:

- Cite **once per paragraph** with the short form (e.g.
  "(via `bills-api.parliament.uk`)"), not every clause.
- If combining facilities, attribute each fact to its source.
- Never up-rate confidence — tier-2 / tier-3 facts must NOT be
  presented as if they came straight from Parliament's
  authoritative graph.
- For mixed-source records carrying `_field_sources`, treat each
  field's provenance independently.

## Skills format

Each `skills/<facility>/SKILL.md` has YAML frontmatter (`name`,
`description` — used for skill matching) plus a body documenting
the API. Each also has a `reference.md` next to it with the full
endpoint listing. Progressive disclosure: load `SKILL.md` first;
read `reference.md` only if needed.

## Repo

- `_specs/` — cached OpenAPI specs and discovery snapshots.
- `lib/facilities/*.mjs` — JS facility modules (Node + browser).
- `bin/parl.mjs` — CLI dispatcher.
- `browser/` — browser entry + demo HTML.
- `scripts/` — refetch + probe + skill-update automation.
- `tests/` — smoke tests (`tests/test_endpoints.sh`,
  `tests/test_cli.sh`).
- `docs/` — worklog, todo, design sketches, triple-stores notes,
  installation, getting-started.
- `readme.md` — the public index.
