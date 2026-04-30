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
| List/search SIs | `GET /StatutoryInstrument?searchTerm=...&procedure=...&layingBodyId=...&take=20` |
| One SI in detail | `GET /StatutoryInstrument/{instrumentId}` |
| Timeline / business items for an SI | `GET /StatutoryInstrument/{instrumentId}/BusinessItems` |
| Same business items by timeline ID | `GET /Timeline/{timelineId}/BusinessItems` |
| Search Acts of Parliament | `GET /ActOfParliament?searchTerm=...` |
| One Act | `GET /ActOfParliament/{id}` |
| List laying bodies | `GET /LayingBody` |
| List procedures | `GET /Procedure` |
| One procedure | `GET /Procedure/{id}` |

## Notes

- An SI's status moves through `Made`, `Laid`, `Coming into force`,
  `Prayer`, `Approved`, etc. The current status is in the
  `currentBusinessItem` field; the full chain is via
  `BusinessItems`.
- IDs are guids in some places (`timelineId`) and ints in others
  (`instrumentId`, `layingBodyId`); check the spec when in doubt.
- The closely related [Treaties](../treaties/SKILL.md) API uses an
  identical "business item" timeline pattern.
