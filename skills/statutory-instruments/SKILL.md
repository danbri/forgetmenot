---
name: uk-parliament-statutory-instruments
description: Query statutory instruments (SIs), proposed negatives, draft instruments, their procedures (negative, affirmative, super-affirmative, etc.), the parent Acts they are made under, and the laying bodies that lay them before Parliament. Use whenever the question is about secondary legislation in progress through Parliament, its procedure type, or the timeline of a specific SI.
---

# UK Parliament Statutory Instruments API

Base URL: `https://statutoryinstruments-api.parliament.uk/api/v2`

OpenAPI 3 spec: `https://statutoryinstruments-api.parliament.uk/swagger/v2/swagger.json`
(cached at `_specs/si.json`).

## What it covers

- **Statutory Instruments and proposed negatives** — secondary
  legislation laid before Parliament, with title, SI number, year,
  procedure, parent Act, laying body, and timeline of business items
  (laid, prayed against, considered in committee, made, etc.).
- **Acts of Parliament** — the primary legislation under which SIs are
  made.
- **Laying bodies** — government departments and other bodies entitled
  to lay instruments.
- **Procedures** — negative, affirmative, made-affirmative,
  super-affirmative, hybrid, and others.

## Common entry points

| Use case | Endpoint |
|---|---|
| List/search SIs | `GET /StatutoryInstrument?Name=...&Procedure=...&LayingBodyId=...&Take=20` |
| Flags (boolean) | `ScheduledDebate`, `MotionToStop`, `ConcernsRaisedByCommittee`, `ParliamentaryProcessConcluded`, `RecommendedForProcedureChange` |
| One SI in detail | `GET /StatutoryInstrument/{instrumentId}` |
| Timeline / business items for an SI | `GET /StatutoryInstrument/{instrumentId}/BusinessItems` |
| Same business items by timeline ID | `GET /Timeline/{timelineId}/BusinessItems` |
| Search Acts of Parliament | `GET /ActOfParliament?Name=...` (min 3 chars) |
| One Act | `GET /ActOfParliament/{id}` |
| List laying bodies | `GET /LayingBody` |
| List procedures | `GET /Procedure` |
| One procedure | `GET /Procedure/{id}` |

## Notes

- An SI's status moves through `Made`, `Laid`, `Coming into force`,
  `Prayer`, `Approved`, etc. The current status is in the
  `currentBusinessItem` field; the full chain is via
  `BusinessItems`.
- IDs are 8-char alphanumeric strings for `instrumentId`,
  `procedureId`, `layingBodyId`, `timelineId`; `departmentId` is an
  int.
- The closely related [Treaties](../treaties/SKILL.md) API uses an
  identical "business item" timeline pattern.
- **No date filter.** The API does **not** accept `laidDateFrom`,
  `madeDateFrom`, `comingIntoForceDateFrom` or any date-range
  parameter. To slice by date, fetch by other criteria and filter
  client-side on the response fields `commonsLayingDate`,
  `lordsLayingDate`, `paperMadeDate`. The default sort is most-recent
  first, so for "last N months" pull with `--take` large enough and
  trim locally.

<!-- parl-cli-start -->

## Using the CLI

This skill ships with a Node CLI alongside the documentation. From the
repo root:

```sh
node bin/parl.mjs si --help
```

Or after `npm link` (one-time install):

```sh
parl si --help
```

Wraps the Statutory Instruments API.

### Examples

```sh
parl si search --term "asylum" --take 5
```
Search SIs.

```sh
parl si get 1234
```
One SI.

```sh
parl si timeline 1234
```
Procedural timeline.

```sh
parl si procedures
```
List procedures.

```sh
parl si laying-bodies
```
List laying bodies.


### Library use (Node + browser)

Same surface as a JS module:

```js
import * as fac from '../../lib/facilities/statutory-instruments.mjs';

// Each function is async and returns parsed JSON (or bytes for
// download endpoints). See the .mjs source for the full export list.
```

The library uses only `fetch` / `URL` / `AbortController`, so the
same source runs in Node 18+ and in modern browsers.

<!-- parl-cli-end -->
