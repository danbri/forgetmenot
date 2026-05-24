# forgetmenot — UK Parliament APIs and datasets

UK Parliament APIs, datasets and adjacent UK public-sector data
sources, each wrapped as a skill in the
[Agent Skills](https://agentskills.io) open format, plus a Node
CLI (`bin/parl.mjs`, also installed as `parl`) and a JS library
(`lib/facilities/`).

## Where the skills live (read this first)

- **Canonical home**: `skills/<name>/SKILL.md`. Scan the directory
  for the current list — there are several dozen, the set grows,
  and this file is intentionally not the source of truth.
- **Orientation file**: [`autoexec.bot`](autoexec.bot) at the
  repo root names the pre-scan target for any inspecting agent.
- **Per-tool reading rooms**: e.g. `.claude/skills/<name>` is a
  committed relative symlink → `../../skills/<name>` so Claude
  Code's project-scope discovery picks the skills up without an
  install step. The same shape works for other Agent-Skills-
  compatible tools (see [agentskills.io/clients](https://agentskills.io/clients)).

When the user asks about UK Parliament — Members, Bills, Hansard,
divisions, Committees, treaties, statutory instruments, questions,
Erskine May, petitions, the SPARQL endpoint, MNIS, e-petitions,
historic Hansard, election results, APPGs, the cabinet, … — scan
`skills/` for a matching folder and read its `SKILL.md`. Use the
CLI to fetch real data. Cite the URL.

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

## Three RDF graphs / SPARQL endpoints

Local lore in [`docs/sparql-endpoints.md`](docs/sparql-endpoints.md):
Parliament runs **three** RDF graphs; **two are public**.

- **DDP** (~7.5M statements, inference off) is what
  `api.parliament.uk/sparql` actually fronts. Carries
  procedural-business instance data too — the Commons Library's
  procedure queries run against this endpoint.
- **DD** (procedural ontology, ~3.14M statements, inference on)
  is **not on the public SPARQL endpoint**. Its distinguishing
  role is *inference* — the OWL/RDFS closure. For queries that
  need the closure: walk the subclass tree explicitly or drop
  down to the matching REST API (`statutory-instruments`,
  `treaties`, `wq`).
- The third graph is internal.

## Honesty about coverage

- Every fact stated should be backed by a tool call. Do not
  reconstruct vote counts, names or dates from memory.
- The CLI returns the URL it called via `--raw`; cite it.
- If a query needs synthesis across many resources, chain calls;
  do not collapse to "based on my knowledge".
- Connectivity flakes happen; the CLI retries 5xx but not network
  failures. If you see HTTP 000 / SSL errors, retry once.

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
the API. Most also have a `reference.md` with the full endpoint
listing. Progressive disclosure: load `SKILL.md` first; read
`reference.md` only if needed. Per the Agent Skills spec, the
SKILL.md filename is singular.

## Repo

- `skills/` — the skills themselves (canonical, vendor-neutral).
- `_specs/` — cached OpenAPI specs and discovery snapshots.
- `lib/facilities/*.mjs` — JS facility modules (Node + browser).
- `bin/parl.mjs` — CLI dispatcher.
- `browser/` — browser entry + demo HTML.
- `scripts/` — refetch + probe + skill-update automation.
- `tests/` — smoke tests (`tests/test_endpoints.sh`,
  `tests/test_cli.sh`).
- `docs/` — worklog, todo, design sketches, SPARQL-endpoints
  notes, installation, getting-started, data-quality writeups.
- `third_party/` — derived RDF, scraped per-MP sites, dumps.
- `autoexec.bot` — agent orientation pointer.
- `readme.md` — the public index.
