---
name: uk-parliament-bills
description: Track UK Parliament Bills (public, private, hybrid) through their stages — first reading, committee, report, third reading, Lords amendments, ping-pong, royal assent. Use whenever the question is about a piece of UK legislation in progress, its sponsors, current stage, amendments, or publications. Also exposes RSS feeds for real-time tracking.
---

# UK Parliament Bills API

Base URL: `https://bills-api.parliament.uk/api/v1`

OpenAPI 3 spec: `https://bills-api.parliament.uk/swagger/v1/swagger.json`
(cached at `_specs/bills.json`).

## What it covers

Every Bill before either House since session 2015–16. For each Bill:
metadata, sponsors, current stage, every stage's start/end dates and
sittings, amendment papers, ping-pong (when both Houses disagree),
publications (the Bill text and explanatory notes at each stage), news
articles, and an RSS feed for the Bill's progress.

## Common entry points

| Use case | Endpoint |
|---|---|
| Search current Bills | `GET /Bills?SearchTerm=...&CurrentHouse=Commons|Lords|All&Session=...&IsAct=true|false` |
| Get full Bill detail | `GET /Bills/{billId}` |
| All stages of a Bill | `GET /Bills/{billId}/Stages` |
| Amendments at a stage | `GET /Bills/{billId}/Stages/{billStageId}/Amendments` |
| Ping-pong items | `GET /Bills/{billId}/Stages/{billStageId}/PingPongItems` |
| Publications (Bill text, EN, LM) | `GET /Bills/{billId}/Publications` |
| Download a document | `GET /Publications/{publicationId}/Documents/{documentId}/Download` |
| Bill RSS feeds | `GET /Rss/Bills/{id}.rss`, `/Rss/allbills.rss`, `/Rss/publicbills.rss`, `/Rss/privatebills.rss` |
| Reference: Bill types | `GET /BillTypes` |
| Reference: stage types | `GET /Stages` |
| Reference: publication types | `GET /PublicationTypes` |

## Worked example

```sh
# Find Bills with "data" in the title currently before the Commons
curl -s 'https://bills-api.parliament.uk/api/v1/Bills?SearchTerm=data&CurrentHouse=Commons' \
  | jq '.items[] | {id: .billId, title: .shortTitle, stage: .currentStage.description}'

# Pull the latest publication of one Bill
curl -s 'https://bills-api.parliament.uk/api/v1/Bills/3678/Publications' \
  | jq '.publications[0]'
```

## Notes

- IDs are stable across the API; you can use `billId` from a search to
  drill into stages, amendments, publications.
- Stage IDs are session-scoped; do not assume a stage ID is reusable
  across Bills.
- The `CurrentHouse` filter matters: `Bills` returns only Bills in
  progress unless you also pass `IncludeWithdrawn=true` or `IsAct=true`.
- See `reference.md` for the full path table and worked join with the
  Hansard API (debate transcripts of Bill stages).
