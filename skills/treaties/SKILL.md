---
name: uk-parliament-treaties
description: Query treaties laid before the UK Parliament under the Constitutional Reform and Governance Act 2010 (CRaG) — treaty title, command paper number, lead government department, parliamentary timeline (laid, scrutiny period, ratification), and the series each treaty belongs to. Use when the question is about a specific treaty, ratification timeline, or treaties laid by a particular government department.
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
| List/search treaties | `GET /Treaty?SearchText=...&Country=...&TreatyTypeId=...&SubjectId=...&LayingBodyId=...&take=20` |
| One treaty | `GET /Treaty/{id}` |
| Treaty timeline | `GET /Treaty/{id}/BusinessItems` |
| One business item | `GET /BusinessItem/{id}` |
| Government organisations | `GET /GovernmentOrganisation` |
| Treaty series memberships | `GET /SeriesMembership` |

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
