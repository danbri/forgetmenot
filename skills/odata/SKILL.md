---
name: odata
description: Query the UK Parliament OData v4 endpoint at api.parliament.uk/odata. The same underlying graph as the SPARQL endpoint, but exposed as 183 entity sets (Person, Member, Constituency, Party, House, Committee, FormalBodyMembership, Government, etc.) navigable with $filter / $expand / $select / $orderby / $top. Use when SPARQL feels heavy and a typed OData query suits — especially from C#, Power BI, Excel, or any client with native OData support.
---

# UK Parliament OData endpoint

Service document: `https://api.parliament.uk/odata/`
$metadata: `https://api.parliament.uk/odata/$metadata`

OData version 4. The service exposes 183 entity sets (the full list
is in [`_specs/discovered/odata-entities.txt`](../../_specs/discovered/odata-entities.txt)).

## What it covers

The same data graph that backs the SPARQL endpoint, but with a typed
schema. Sample entity sets:

- Identity and lifecycle: `Person`, `Member`, `Candidate`,
  `Candidacy`, `CandidacyResult`, `DeceasedPerson`.
- Membership: `SeatIncumbency`, `MnisSeatIncumbency`, `PartyMembership`,
  `FormalBodyMembership`, `PostIncumbency`.
- Geography: `Constituency`, `ConstituencyGroup`, `ConstituencyArea`,
  `Country`, `HouseSeat`, `OnsThing`.
- Institutions: `House`, `Party`, `Government`, `FormalBody`.
- Misc: `Gender`, `GenderIdentity`, `ContactPoint`, `PostalAddress`,
  `MnisThing`, `WikidataThing`, `OnsThing`, etc.

## Common entry points

```http
# List all entity sets
GET https://api.parliament.uk/odata/

# Inspect the schema (XML)
GET https://api.parliament.uk/odata/$metadata

# Single-entity navigation
GET https://api.parliament.uk/odata/Person?$top=5
GET https://api.parliament.uk/odata/Member?$filter=startswith(Person/PersonGivenName,'Diane')&$expand=Person
GET https://api.parliament.uk/odata/Constituency?$filter=ConstituencyGroupName eq 'Hackney North and Stoke Newington'&$top=5

# Count
GET https://api.parliament.uk/odata/Member/$count
```

## Worked example

```sh
# 5 persons whose MNIS ID is set, with their MNIS-flavoured
# membership info.
curl -s 'https://api.parliament.uk/odata/Person?$top=5&$select=Id,PersonGivenName,PersonFamilyName' \
  | jq '.value'
```

## Notes

- The same underlying URIs as in SPARQL — every entity has an `Id`
  that matches the 8-character `id.parliament.uk` slug.
- The OData service is **read-only** (`GET`/`HEAD` only).
- Default page size returns up to 1000 rows; use `$top` and
  `@odata.nextLink` to walk larger collections.
- For a query that crosses many entity sets, SPARQL is usually
  cleaner; OData wins when you're calling from a tool that has
  built-in OData support (Excel, Power BI, LINQ).
- Some entity sets are nearly empty (the schema models more than the
  store currently populates); use `$count` to check before
  authoring complex queries.

<!-- parl-cli-start -->

## Using the CLI

> See [`../parl/SKILL.md`](../parl/SKILL.md) for the CLI-wide conventions (output modes, flag rules, idiomatic chains).

This skill ships with a Node CLI alongside the documentation. From the
repo root:

```sh
node bin/parl.mjs odata --help
```

Or after `npm link` (one-time install):

```sh
parl odata --help
```

Wraps the OData v4 service. 183 entity sets; same data graph as SPARQL.

### Examples

```sh
parl odata sets
```
List entity sets.

```sh
parl odata get Person --top 5 --select "Id,PersonGivenName,PersonFamilyName"
```
Sample.

```sh
parl odata count Member
```
Count of an entity set.

```sh
parl odata get Constituency --filter "ConstituencyGroupName eq 'Hackney North and Stoke Newington'" --top 1
```
Filter by name.


### Library use (Node + browser)

Same surface as a JS module:

```js
import * as fac from '../../lib/facilities/odata.mjs';

// Each function is async and returns parsed JSON (or bytes for
// download endpoints). See the .mjs source for the full export list.
```

The library uses only `fetch` / `URL` / `AbortController`, so the
same source runs in Node 18+ and in modern browsers.

<!-- parl-cli-end -->
