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
