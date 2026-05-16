---
name: interests
description: Query the UK Register of Members' Financial Interests — categories of registrable interests, individual interest entries (with values, dates, descriptions, donors, and any rectification history), and historical published versions of the Register as PDF or CSV. Use when the question is about MPs' or peers' declared earnings, donations, gifts, employment, shareholdings, or other registrable interests.
---

# Register of Members' Financial Interests API

Base URL: `https://interests-api.parliament.uk/api/v1`

OpenAPI 3 spec: `https://interests-api.parliament.uk/swagger/v1/swagger.json`
(cached at `_specs/interests.json`).

## What it covers

The structured Register of Members' Financial Interests for the
Commons (and the Lords' equivalent). Each interest is a typed entry
with category, dates, free-text description, optional payments,
donors, and a rectification chain when entries are corrected. Whole
fortnightly snapshots of the Register are also available as PDF or as
a ZIP of CSVs.

## Common entry points

| Use case | Endpoint |
|---|---|
| List published register versions | `GET /Registers` |
| Latest snapshot of the Register as PDF | `GET /Registers/{id}/document` |
| List interest categories | `GET /Categories` |
| Search interests | `GET /Interests?MemberId=...&CategoryId=...&PublishedFrom=...&PublishedTo=...&take=20` |
| One interest by ID | `GET /Interests/{id}` |
| Bulk export as CSV (zipped) | `GET /Interests/csv?...` |

## Worked example

```sh
# Recent declarations under category "Employment and earnings"
curl -s 'https://interests-api.parliament.uk/api/v1/Categories' \
  | jq '.items[] | select(.name | contains("Employment")) | .id'
# -> 2
curl -s 'https://interests-api.parliament.uk/api/v1/Interests?CategoryId=2&take=5' \
  | jq '.items[] | {member: .member.name, category: .category.name, description: .description}'
```

## Notes

- The richer per-MP "RegisteredInterests" endpoint on the Members API
  is the same data joined to a member; this API is the canonical
  structured source and is the right starting point for cross-cutting
  analysis (e.g. "all gifts above £1,000").
- `Registers` returns one snapshot per publication date.
- The CSV bundle (`/Interests/csv`) is the easiest format for
  spreadsheet work; it embeds donor and payment columns.
- See `reference.md` for parameter details.

<!-- parl-cli-start -->

## Using the CLI

> See [`../parl/SKILL.md`](../parl/SKILL.md) for the CLI-wide conventions (output modes, flag rules, idiomatic chains).

This skill ships with a Node CLI alongside the documentation. From the
repo root:

```sh
node bin/parl.mjs interests --help
```

Or after `npm link` (one-time install):

```sh
parl interests --help
```

Wraps the Register of Members' Financial Interests API.

### Examples

```sh
parl interests categories
```
Interest categories.

```sh
parl interests search --member-id 4514 --take 10
```
Interests for one member.

```sh
parl interests search --category-id 2 --take 10
```
Recent donations entries.

```sh
parl interests registers
```
Published register snapshots.


### Library use (Node + browser)

Same surface as a JS module:

```js
import * as fac from '../../lib/facilities/interests.mjs';

// Each function is async and returns parsed JSON (or bytes for
// download endpoints). See the .mjs source for the full export list.
```

The library uses only `fetch` / `URL` / `AbortController`, so the
same source runs in Node 18+ and in modern browsers.

<!-- parl-cli-end -->
