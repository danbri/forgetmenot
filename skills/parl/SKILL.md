---
name: parl
description: Use the `parl` Node CLI (and the matching `lib/facilities/*.mjs` JS library) to query every public UK Parliament API and dataset — Members, Bills, Hansard, Committees, Commons / Lords divisions, oral and written questions, Early Day Motions, statutory instruments, treaties, the Register of Members' Financial Interests, Erskine May, the live annunciator, e-petitions, the SPARQL endpoint, OData, the parameterised-query browser, the Linked Data API, historic Hansard, MNIS, the explore.data.parliament.uk dataset catalogue, the All-Party Parliamentary Groups Register, the What's On calendar (sittings / sessions / procedural dates), the MPs' Guide to Procedure, the Bill Papers CSV catalogue, and the Library Feeds RSS aggregator. Use whenever a question references UK Parliament data — this is the single entry point that every per-facility skill in this repo delegates to.
license: Open Government Licence v3.0 (Crown copyright; Parliament APIs); skill text MIT.
compatibility: Requires Node 18+ (uses native fetch / URL / AbortController). Outbound HTTPS to parliament.uk hostnames. Browser-compatible — same source runs in modern browsers.
metadata:
  cli-binary: bin/parl.mjs
  library-entry: lib/facilities/index.mjs
  spec-cache: _specs/
---

# `parl` — UK Parliament CLI

`parl` is a single Node CLI that wraps every public UK Parliament data exposure as a facility. Each facility has its own skill in [`skills/`](../) under the spec-conformant short slug (`members`, `bills`, etc. — or, for the legacy ones still using the longer prefix, `uk-parliament-<slug>`). All of those skills delegate the actual data fetch to `parl`.

This file is the place to come when you need to know **how to run `parl`**, regardless of which facility you're working with. Per-facility specifics (endpoints, parameters, quirks) live in the facility's own skill.

## Quick start

```sh
parl <facility> <command> [args] [--option value]
node bin/parl.mjs <facility> <command> ...      # if `parl` isn't on PATH

parl --help                       # list every facility
parl <facility> --help            # list a facility's commands
parl <facility> <command> --help  # one-line help for a command
```

The CLI uses kebab-case flags (`--member-id 4514`) that map to camel-case library kwargs (`memberId: 4514`). Repeated flags accumulate into arrays.

## Output modes

| Flag | Behaviour |
|---|---|
| `--json` (default) | Parsed JSON response printed pretty. |
| `--text` | Human-readable rendering (tables for lists, summaries for objects, raw string passthrough for non-JSON bodies). |
| `--raw` | Verbatim response body. |
| `--out <path>` | Stream binary downloads (PDFs, ZIPs) to disk. |
| `--user-agent <s>` | Override User-Agent for the request. |
| `--timeout <seconds>` | Override request timeout (default 30s). |

## Facilities

The full list (canonical name first, aliases in parens):

| Facility | Skill | What it covers |
|---|---|---|
| `members` | [`skills/members`](../members/) | MPs and peers, current and historical; constituencies; parties; government / opposition posts. |
| `bills` | [`skills/bills`](../bills/) | Bills through every stage including amendments and ping-pong. |
| `committees` | [`skills/committees`](../committees/) | Select / Joint committees, inquiries, evidence, publications, meetings. |
| `hansard` | [`skills/hansard`](../hansard/) | Hansard 1988→ — debates, contributions, divisions, full-text search. |
| `commons-votes` | [`skills/commons-votes`](../commons-votes/) | Commons divisions (recorded votes). |
| `lords-votes` | [`skills/lords-votes`](../lords-votes/) | Lords divisions (Content / Not Content). |
| `oral-questions` | [`skills/oral-questions-and-edms`](../oral-questions-and-edms/) | Tabled oral questions and EDMs. |
| `wq` | [`skills/written-questions-and-statements`](../written-questions-and-statements/) | Written questions, statements, daily reports. |
| `si` | [`skills/statutory-instruments`](../statutory-instruments/) | Statutory instruments and their procedures. |
| `treaties` | [`skills/treaties`](../treaties/) | Treaties laid under CRaG. |
| `interests` | [`skills/interests`](../interests/) | Register of Members' Financial Interests. |
| `em` | [`skills/erskine-may`](../erskine-may/) | Erskine May (parliamentary procedure manual). |
| `now` | [`skills/now`](../now/) | Live annunciator (what's on in each chamber now). |
| `petitions` | [`skills/petitions`](../petitions/) | UK Parliament e-petitions. |
| `whatson` | [`skills/whatson`](../whatson/) | Calendar, sittings, sessions, procedural dates. |
| `gtp` | [`skills/guide-to-procedure`](../guide-to-procedure/) | MPs' Guide to Procedure (plain-English explainers). |
| `bp` | [`skills/bill-papers`](../bill-papers/) | Bill Papers CSV catalogue + per-bill RSS. |
| `library` | [`skills/library-feeds`](../library-feeds/) | Commons Library / Lords Library / POST research-briefing RSS aggregator. |
| `sparql` | [`skills/sparql`](../sparql/) | Public SPARQL 1.1 endpoint over the DDP store. |
| `odata` | [`skills/odata`](../odata/) | OData v4 over the same data graph. |
| `pq` | [`skills/parameterised-query`](../parameterised-query/) | 124 named SPARQL templates returning JSON. |
| `lda` | [`skills/linked-data-api`](../linked-data-api/) | Legacy Linked Data API (Elda) datasets. |
| `hh` | [`skills/historic-hansard`](../historic-hansard/) | Historic Hansard 1803–2005 (HTML site). |
| `mnis` | [`skills/members-data-platform`](../members-data-platform/) | Legacy Members Data Platform. |
| `ddpd` | [`skills/data-parliament-uk-datasets`](../data-parliament-uk-datasets/) | Catalogue of the 19 explore.data.parliament.uk datasets. |
| `appg` | [`skills/appg`](../appg/) | All-Party Parliamentary Groups (HTML scrape). |

## Idiomatic chains

- **Postcode → MP**: `parl pq postcode "SW1P 3JA"` (one call) or `parl members constituency-search` then `parl members constituency <id>`.
- **MP → recent voting**: `parl members search --name X --take 1` → take the `id`, then `parl commons-votes member <id> --take 25`.
- **Bill → debates**: `parl bills search --term "X"` → take `billId`, `parl bills stages <billId>`, then `parl hansard search-debates --term "X"`.
- **Committee inquiry**: `parl committees search --term "X"` → `parl committees business-search --committee-id <id>` → `parl committees oral-evidence-search --committee-business-id <id>`.
- **SI laid in date range**: `parl si search --laid-date-from 2026-02-16 --laid-date-to 2026-05-16 --take 500` (client-side; auto-pages).
- **Annulment / praying-period date**: `parl whatson annulment-date --date-laid 2026-04-23 --days-in-future 40`.
- **Next sitting day**: `parl whatson next-sitting Commons --date-to-check 2026-05-16`.

## Library use (Node + browser)

```js
import * as F from './lib/facilities/index.mjs';
const r = await F.members.search({ name: 'Cooper', take: 5 });
```

The library uses only `fetch` / `URL` / `AbortController` so the same source runs in Node 18+ and in modern browsers.

## Cross-cutting notes

- **Server vs client filtering**: where the upstream API has no date filter we want, the library auto-pages and applies the filter client-side, returning the same `{ items, totalResults }` envelope plus `_unfilteredTotal`, `_fetched`, `_exhausted` metadata. Currently applies to `treaties.search` and `si.search`.
- **Honesty about coverage**: every fact returned should be backed by a tool call. The CLI prints the URL it called via `--raw`; cite it.
- **Three triple stores**: Parliament runs three RDF triple stores, two public ([`docs/triple-stores.md`](../../docs/triple-stores.md)). DDP is what `sparql` fronts; DD (procedural ontology) is NOT on the public SPARQL endpoint — for procedural-business queries that come back empty, drop down to the matching REST API.
- **Specs**: cached OpenAPI specs live in [`_specs/`](../../_specs/). The probe script at [`scripts/probe-endpoints.sh`](../../scripts/probe-endpoints.sh) confirms every endpoint is reachable.

## Reference

- Full CLI dispatcher: [`bin/parl.mjs`](../../bin/parl.mjs)
- Per-facility library modules: [`lib/facilities/`](../../lib/facilities/)
- Shared HTTP layer: [`lib/http.mjs`](../../lib/http.mjs)
- Client-side filter helper: [`lib/client-filter.mjs`](../../lib/client-filter.mjs)
- Repo index: [`../../readme.md`](../../readme.md)
