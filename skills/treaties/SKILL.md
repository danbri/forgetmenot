---
name: treaties
description: Query treaties laid before the UK Parliament under the Constitutional Reform and Governance Act 2010 (CRaG) — treaty title, command paper number, lead government department, parliamentary timeline (laid, scrutiny period, ratification), and the series each treaty belongs to. Use when the question is about a specific treaty, ratification timeline, or treaties laid by a particular government department.
license: Open Parliament Licence v3.0 (Crown copyright; Parliament-operated)
metadata:
  provenance:
    tier: 1
    operator: UK Parliament
    service: treaties-api.parliament.uk
    citation-short: "via treaties-api.parliament.uk"
    citation-formal: "UK Parliament Treaties API, retrieved {date}"
    confidence: authoritative
---

# UK Parliament Treaties API

Base URL: `https://treaties-api.parliament.uk/api`

OpenAPI 3 spec: `https://treaties-api.parliament.uk/swagger/v1/swagger.json`
(cached at `_specs/treaties.json`).

## What it covers

Treaties laid before Parliament under the Constitutional Reform and
Governance Act 2010 (commonly *CRaG*). Each record carries title,
command paper, country, treaty type, lead department, dates laid,
scrutiny period end, and a timeline of business items (laid, debated,
extended, ratified). Treaty series memberships group multilateral
treaties by their organisation (UN, OECD, etc.).

## Common entry points

| Use case | Endpoint |
|---|---|
| List/search treaties | `GET /Treaty?SearchText=...&GovernmentOrganisationId=...&Series=...&ParliamentaryProcess=...&DebateScheduled=...&take=20` |
| One treaty | `GET /Treaty/{id}` |
| Treaty timeline | `GET /Treaty/{id}/BusinessItems` |
| One business item | `GET /BusinessItem/{id}` |
| Government organisations | `GET /GovernmentOrganisation` |
| Treaty series memberships | `GET /SeriesMembership` |

The spec accepts only the parameters listed above plus `Skip` /
`Take`. **There is no server-side date or laying-body filter** —
the library implements `laidDateFrom` / `laidDateTo`,
`signedDateFrom` / `signedDateTo`, `layingBodyId` and
`leadDepartmentId` client-side by auto-paging and stopping once
results fall below the cutoff (default cap 2000 records). The
returned object gains `_unfilteredTotal`, `_fetched`, and
`_exhausted` keys when a client filter is active.

## Worked example

```sh
curl -s 'https://treaties-api.parliament.uk/api/Treaty?take=1' \
  | jq '.items[0] | {id, title, command_paper: .commandPaperNumber, dept: .layingBody.name}'
```

## Notes

- Treaties have a 21-sitting-day scrutiny period after being laid; the
  business-item timeline captures any extensions.
- The Treaties API exposes the same "business item" pattern as the
  Statutory Instruments API — keys are not interchangeable but the
  shape is identical.
- For the parliamentary debate of a treaty, search the
  [Hansard](../hansard/SKILL.md) API by treaty title.

<!-- parl-cli-start -->

## Using the CLI

> See [`../parl/SKILL.md`](../parl/SKILL.md) for the CLI-wide conventions (output modes, flag rules, idiomatic chains).

This skill ships with a Node CLI alongside the documentation. From the
repo root:

```sh
node bin/parl.mjs treaties --help
```

Or after `npm link` (one-time install):

```sh
parl treaties --help
```

Wraps the Treaties API (CRaG-laid treaties).

### Examples

```sh
parl treaties search --search-text "fisheries" --take 5
```
Search treaties.

```sh
parl treaties get 12
```
One treaty.

```sh
parl treaties timeline 12
```
Business items.

```sh
parl treaties orgs
```
Government organisations.


### Library use (Node + browser)

Same surface as a JS module:

```js
import * as fac from '../../lib/facilities/treaties.mjs';

// Each function is async and returns parsed JSON (or bytes for
// download endpoints). See the .mjs source for the full export list.
```

The library uses only `fetch` / `URL` / `AbortController`, so the
same source runs in Node 18+ and in modern browsers.

<!-- parl-cli-end -->

## Provenance to cite

**Tier 1 — first-party UK Parliament.** Authoritative.

- Inline cite: **"(via treaties-api.parliament.uk)"** — once per paragraph in
  user-facing answers.
- On request, give the URL `--raw` printed.
- See [`docs/provenance.md`](../../docs/provenance.md) for the
  cross-skill rules.
