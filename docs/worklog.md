# Worklog

Append-only narrative of what was done and what was found. Newest entries at
the bottom of each session block.

---

## 2026-04-30 — Initial discovery and scaffolding

Starting point: the user pointed at `https://explore.data.parliament.uk/`
and asked for skills (one folder per "facility") or MCP wrappers around UK
Parliament APIs and datasets.

### Discovery

The `explore.data.parliament.uk` portal is a knockout.js SPA. The dataset
list it surfaces is hard-coded in
`https://explore.data.parliament.uk/Scripts/modules/releaseddatasets.json`
and is a flat list of 19 dataset names:

```
Briefing Papers, Parliamentary Questions Answered, Members,
Commons Divisions, Commons Oral Questions, Commons Oral Question Times,
Commons Written Questions, Lords Written Questions, Thesaurus,
Research Briefings, Elections, Election Results, Publication Logs,
AV Live Logging, Lords Bill Amendments, Hansard Commons Proceedings,
Hansard Commons Documents, Hansard Lords Proceedings, Hansard Lords Documents
```

That portal is largely a metadata browser over **older** feeds — the
substantive Parliament-operated APIs that deserve skill wrappers live
under `*-api.parliament.uk` subdomains and behind the
`developer.parliament.uk` hub. Confirmed by probing each known subdomain
for Swagger / OpenAPI specs.

### APIs confirmed reachable (HTTP 200) on 2026-04-30

| Subdomain | Spec path | Spec dialect |
|---|---|---|
| `members-api.parliament.uk` | `/swagger/v1/swagger.json` | OpenAPI 3 |
| `bills-api.parliament.uk` | `/swagger/v1/swagger.json` | OpenAPI 3 |
| `committees-api.parliament.uk` | `/swagger/v1/swagger.json` | OpenAPI 3 |
| `treaties-api.parliament.uk` | `/swagger/v1/swagger.json` | OpenAPI 3 |
| `erskinemay-api.parliament.uk` | `/swagger/v1/swagger.json` | OpenAPI 3 |
| `now-api.parliament.uk` | `/swagger/v1/swagger.json` | OpenAPI 3 |
| `interests-api.parliament.uk` | `/swagger/v1/swagger.json` | OpenAPI 3 |
| `lordsvotes-api.parliament.uk` | `/swagger/v1/swagger.json` | OpenAPI 3 |
| `commonsvotes-api.parliament.uk` | `/swagger/docs/v1` | Swagger 2 |
| `hansard-api.parliament.uk` | `/swagger/docs/v1` | Swagger 2 |
| `oralquestionsandmotions-api.parliament.uk` | `/swagger/docs/v1` | Swagger 2 |
| `questions-statements-api.parliament.uk` | `/swagger/v1/swagger.json` | OpenAPI 3 |
| `statutoryinstruments-api.parliament.uk` | `/swagger/v2/swagger.json` | OpenAPI 3 |

`writtenquestions-api.parliament.uk/swagger/v1/swagger.json` returns a
**301 redirect** to the unified `questions-statements-api.parliament.uk`
host. Treat the old hostname as deprecated.

`whatson-api.parliament.uk` was probed and returned 404 for both
`/swagger/v1/swagger.json` and the old `/calendar/proceduralcalendar.json`
path — that subdomain looks retired; the Now / annunciator API has taken
over for live state.

### Linked-data / RDF facilities

| Endpoint | Status | Notes |
|---|---|---|
| `https://api.parliament.uk/sparql` | 404 on GET-no-query, 200 with `query=` | Live SPARQL 1.1 endpoint. Confirmed with `SELECT * WHERE {?s ?p ?o} LIMIT 3`. |
| `https://api.parliament.uk/odata/` | 200 | Returns a service document listing entity sets `TemporalThing`, `PastThing`, `MnisThing`, `DodsThing`, `WikidataThing`, etc. |
| `https://api.parliament.uk/query/` | 200 | A parameterised-query browser; root page lists query templates such as `person_index`, `person_by_id`, `person_by_initial`. |
| `https://lda.data.parliament.uk/commonsdivisions.json` | 200 | Linked-Data API (Elda). Returns `{format:"linked-data-api", version:"0.2", result:{...}}`. Note that `/` of the host returns 404 — must hit a dataset path. |
| `https://eldaddp.azurewebsites.net/commonsdivisions.json` | 200 | Same LDA but on the Azure-hosted instance. The `lda.data.parliament.uk` host is fronted by this. |

### Other Parliament-operated APIs

| Endpoint | Status | Notes |
|---|---|---|
| `https://petition.parliament.uk/petitions.json` | 200 | Public petitions service. Returns JSON:API-style output with `links`, `data`. Pagination and `state=open|closed|...` filter. |
| `https://api.parliament.uk/historic-hansard/` | 200 (HTML site, not JSON) | Hansard 1803–2005. The "API" link from the homepage is the homepage itself; there is no documented JSON API. URLs like `/historic-hansard/sittings/2005/dec/19` return 301 to canonical paths. |
| `https://data.parliament.uk/membersdataplatform/services/mnis/...` | 200 | The legacy **MNIS** Members Data Platform. Default response is XML; `?format=json` returns JSON. Example confirmed: `/services/mnis/parties/active/Commons/` and `/services/mnis/members/query/House=Commons|IsEligible=true/?format=json`. |

### Probing artefacts

The full probe results for 2026-04-30 are saved under
`_specs/probes/2026-04-30-probe.txt` so future re-probes can be diffed
against them.

### Decisions

- **Format chosen: skills, not MCP server.** The user said "skills (one
  folder per facility please) or MCP tools". Skills are simpler to author
  and consume — no daemon, no JSON-RPC schema overhead. Each skill folder
  carries an explicit `SKILL.md` plus a reference doc with endpoint
  cheatsheet and worked examples. An MCP wrapper can be layered over the
  same per-facility folders later without redoing the cataloguing.
- **One skill per facility.** Each Parliament-operated API or
  dataset-family gets its own folder. The OData / SPARQL / parameterised
  query endpoints are kept separate from the LDA endpoints because the
  query languages and authentication / rate-limit profiles differ.
- **Specs are committed.** `_specs/*.json` are checked into git so the
  repo is self-contained for offline use. `scripts/refetch-specs.sh`
  reproduces them.
- **Scripts not Python.** The probing and refetching are POSIX
  shell + curl + python3-for-pretty-print; no extra runtime needed.

### Open questions

- The `/historic-hansard/` site has no documented JSON API — the
  `ropengov/hansard` R package scrapes the LDA endpoints (now mostly
  retired) and the historic site's HTML. We document it as a website
  resource rather than as a programmatic API.
- The data.parliament.uk feeds underlying the `releaseddatasets.json`
  list (Briefing Papers, Research Briefings, Thesaurus, Elections, etc.)
  appear to be served from the same LDA instance; that needs explicit
  mapping per dataset, recorded inside `skills/linked-data-api/`.

### Future TODO: align REST concepts with the SPARQL ontology

User suggestion 2026-04-30: pull `rdfs:Class` and `owl:Class` instances
and their hierarchy from the public SPARQL endpoint
(`https://api.parliament.uk/sparql`), and look for associations between
those classes and the concepts exposed by the RESTish APIs (e.g. is
`Members API`'s `member` the same thing as the SPARQL endpoint's
`https://id.parliament.uk/schema/Person` or its `Member` subclass?).
SKOS schemes (especially the Parliament Thesaurus) likely sit between
the two and could provide a join. This is recorded in `docs/todo.md`.
