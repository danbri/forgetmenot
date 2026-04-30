# forgetmenot — UK Parliament APIs and datasets, as skills

A repository of skills (one folder per facility) that wrap every
UK Parliament-operated API and dataset family I could identify.
The skills are plain Markdown with YAML frontmatter; they do not
ship code. They contain enough information for a language model
to construct correct HTTP requests against the Parliament APIs
without further documentation lookup.

Starting point: the catalogue at <https://explore.data.parliament.uk/>
and the developer hub at <https://developer.parliament.uk/>.

## Layout

```
forgetmenot/
├── readme.md                          # this file
├── docs/
│   ├── worklog.md                     # append-only narrative of work done
│   ├── todo.md                        # deferred items
│   └── installation.md                # how to wire the skills up
├── scripts/
│   ├── refetch-specs.sh               # download every cached OpenAPI spec
│   ├── refetch-discovered.sh          # capture other discovery artefacts
│   ├── probe-endpoints.sh             # probe every known endpoint
│   └── list-endpoints.py              # render an OpenAPI spec as a table
├── _specs/                            # cached, committed
│   ├── *.json                         # the OpenAPI specs
│   ├── endpoint-tables/               # rendered for human/LLM reading
│   ├── discovered/                    # non-OpenAPI artefacts (LDA dataset list, query templates, OData entity sets)
│   └── probes/                        # date-stamped probe results
├── skills/
│   ├── members/                       # one folder per facility, each with…
│   │   ├── SKILL.md                   # …a manifest with frontmatter
│   │   └── reference.md               # …and a full endpoint reference
│   ├── bills/
│   ├── … (21 facilities total)
└── tests/
    └── test_endpoints.sh              # smoke test
```

## The 21 facilities

### Modern REST APIs (developer.parliament.uk hub)

| Skill | Base URL |
|---|---|
| [`members`](skills/members/SKILL.md) | `https://members-api.parliament.uk` |
| [`bills`](skills/bills/SKILL.md) | `https://bills-api.parliament.uk` |
| [`committees`](skills/committees/SKILL.md) | `https://committees-api.parliament.uk` |
| [`hansard`](skills/hansard/SKILL.md) | `https://hansard-api.parliament.uk` |
| [`commons-votes`](skills/commons-votes/SKILL.md) | `https://commonsvotes-api.parliament.uk` |
| [`lords-votes`](skills/lords-votes/SKILL.md) | `https://lordsvotes-api.parliament.uk` |
| [`oral-questions-and-edms`](skills/oral-questions-and-edms/SKILL.md) | `https://oralquestionsandmotions-api.parliament.uk` |
| [`written-questions-and-statements`](skills/written-questions-and-statements/SKILL.md) | `https://questions-statements-api.parliament.uk` |
| [`statutory-instruments`](skills/statutory-instruments/SKILL.md) | `https://statutoryinstruments-api.parliament.uk` |
| [`treaties`](skills/treaties/SKILL.md) | `https://treaties-api.parliament.uk` |
| [`interests`](skills/interests/SKILL.md) | `https://interests-api.parliament.uk` |
| [`erskine-may`](skills/erskine-may/SKILL.md) | `https://erskinemay-api.parliament.uk` |
| [`now`](skills/now/SKILL.md) | `https://now-api.parliament.uk` (annunciator) |

### Linked-data / RDF stack

| Skill | Endpoint |
|---|---|
| [`sparql`](skills/sparql/SKILL.md) | `https://api.parliament.uk/sparql` |
| [`odata`](skills/odata/SKILL.md) | `https://api.parliament.uk/odata/` |
| [`parameterised-query`](skills/parameterised-query/SKILL.md) | `https://api.parliament.uk/query/` |
| [`linked-data-api`](skills/linked-data-api/SKILL.md) | `https://lda.data.parliament.uk` (and Azure mirror) |

### Other Parliament-operated facilities

| Skill | Endpoint |
|---|---|
| [`petitions`](skills/petitions/SKILL.md) | `https://petition.parliament.uk` |
| [`historic-hansard`](skills/historic-hansard/SKILL.md) | `https://api.parliament.uk/historic-hansard/` (HTML; pre-1988) |
| [`members-data-platform`](skills/members-data-platform/SKILL.md) | `https://data.parliament.uk/membersdataplatform/` (legacy MNIS) |
| [`data-parliament-uk-datasets`](skills/data-parliament-uk-datasets/SKILL.md) | catalogue mapping the explore.data.parliament.uk dataset names to LDA paths and to modern API equivalents |

## How to use

The short answer is: clone the repo and point your Claude (Desktop /
Code / SDK) at `skills/`.

The long answer, including non-Claude options, is in
[`docs/installation.md`](docs/installation.md).

A no-LLM use also works: the cached OpenAPI specs in `_specs/` are
self-contained and the discovery scripts let you re-run the cataloguing
yourself.

## How the discovery worked

Documented in [`docs/worklog.md`](docs/worklog.md). The
`developer.parliament.uk` hub itself returned 403 to programmatic
fetches, but each `*-api.parliament.uk` host serves its OpenAPI spec
on a predictable path — most on `/swagger/v1/swagger.json`, three on
`/swagger/docs/v1` (Swagger 2.0), one on `/swagger/v2/swagger.json`.
13 OpenAPI specs were downloaded and committed.

The remaining 8 facilities have no OpenAPI document and were
characterised by direct probing: SPARQL via a `SELECT *` query, OData
via the service document, parameterised query via the HTML root,
LDA via known dataset slugs, MNIS via its filter URL convention,
petitions via the public JSON:API host, historic Hansard by
documenting URL conventions only, and the data.parliament.uk dataset
family by extracting the static JSON list driving the SPA.

## Reproducing the catalogue

```sh
bash scripts/refetch-specs.sh        # 13 OpenAPI specs to _specs/
bash scripts/refetch-discovered.sh   # ~325 lines of discovered names
bash scripts/probe-endpoints.sh      # writes _specs/probes/<date>-probe.txt
bash tests/test_endpoints.sh         # smoke test
```

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
