---
name: parameterised-query
description: Use the UK Parliament parameterised query browser (api.parliament.uk/query/) — a catalogue of pre-canned SPARQL queries that return JSON without you having to write the SPARQL yourself. Each template has a fixed name and a fixed parameter signature, e.g. person_by_id?person_id=… or constituency_lookup_by_postcode?postcode=…. Use when you want a specific, pre-vetted answer about a Parliament resource and do not want to author SPARQL.
---

# UK Parliament parameterised query browser

Endpoint: `https://api.parliament.uk/query/`

This is the public face of an internal Parliament service that wraps
common SPARQL questions as named, parameterised templates. It is
*read-only* and HTTP-GET-only. The root path returns a list of every
template; calling a template with the right query-string parameters
runs the underlying query and returns JSON (or HTML in the browser).

## What it covers

124 named templates as of 2026-04-30 (see
[`_specs/discovered/query-templates.txt`](../../_specs/discovered/query-templates.txt)).

Examples (the full list is the file above):

- `person_index` — every person URI in the store.
- `person_by_id?person_id=TyNGhslR`
- `person_by_initial?initial=A`
- `person_by_substring?substring=ee`
- `person_lookup?property=mnisId&value=3299`
- `person_constituencies?person_id=TyNGhslR`
- `person_current_constituency?person_id=TyNGhslR`
- `person_committees_memberships_index?person_id=TyNGhslR`
- `person_mps`
- `member_current`
- `constituency_lookup?property=onsCode&value=E14000699`
- `constituency_lookup_by_postcode?postcode=SW1P%203JA`
- `constituency_current_member?constituency_id=AEyWGYaP`
- `find_your_constituency` — useful pre-canned postcode → MP lookup.
- `party_index`

## Common entry points

| Use case | Template |
|---|---|
| Postcode → constituency → current MP | `constituency_lookup_by_postcode?postcode=...` |
| ONS code → constituency | `constituency_lookup?property=onsCode&value=E14000699` |
| MNIS ID → person URI | `person_lookup?property=mnisId&value=3299` |
| All current MPs | `person_mps` or `member_current` |
| Person → committees they have been on | `person_committees_memberships_index?person_id=...` |

## Worked example

```sh
curl -s 'https://api.parliament.uk/query/constituency_lookup_by_postcode?postcode=SW1P%203JA' \
  | jq '.[0]'
```

## Notes

- Each template returns JSON when called with the standard `Accept:`
  default. The HTML browser lets you click through to inspect.
- Templates are stable but the canonical record of the set is the
  service itself; we cache the list under
  `_specs/discovered/query-templates.txt` and a re-fetch is captured
  by `scripts/probe-endpoints.sh` (extension TODO — currently we only
  record the count and the root URL).
- For arbitrary queries beyond the templates, drop down to
  [`sparql`](../sparql/SKILL.md).
- IDs are the same opaque 8-character `id.parliament.uk` IDs as in the
  SPARQL store.

<!-- parl-cli-start -->

## Using the CLI

> See [`../parl/SKILL.md`](../parl/SKILL.md) for the CLI-wide conventions (output modes, flag rules, idiomatic chains).

This skill ships with a Node CLI alongside the documentation. From the
repo root:

```sh
node bin/parl.mjs pq --help
```

Or after `npm link` (one-time install):

```sh
parl pq --help
```

Wraps the parameterised-query browser. 124 named templates returning JSON; covers the most common joins without writing SPARQL.

### Examples

```sh
parl pq postcode "SW1P 3JA"
```
Postcode → constituency → current MP.

```sh
parl pq mps
```
All current MPs.

```sh
parl pq person-by-mnis 4514
```
Person by MNIS ID.

```sh
parl pq run constituency_lookup --property=onsCode --value=E14000647
```
Arbitrary template invocation.


### Library use (Node + browser)

Same surface as a JS module:

```js
import * as fac from '../../lib/facilities/parameterised-query.mjs';

// Each function is async and returns parsed JSON (or bytes for
// download endpoints). See the .mjs source for the full export list.
```

The library uses only `fetch` / `URL` / `AbortController`, so the
same source runs in Node 18+ and in modern browsers.

<!-- parl-cli-end -->
