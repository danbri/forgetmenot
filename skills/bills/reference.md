# Bills API — full endpoint reference

Cached spec: [`_specs/bills.json`](../../_specs/bills.json)
Endpoint table: [`_specs/endpoint-tables/bills.txt`](../../_specs/endpoint-tables/bills.txt)

Base URL: `https://bills-api.parliament.uk/api/v1`

## Endpoints

### Bills (search and detail)
- `GET /Bills` — query params `SearchTerm`, `Session` (e.g. `35` for
  2024–25, see `/Sittings` for the IDs), `MemberId` (sponsor), `Department`,
  `BillStage` (one of the IDs from `GET /Stages`), `CurrentHouse`
  (`Commons`, `Lords`, `All`), `OriginatingHouse`, `Type`, `IsAct`,
  `IsDefeated`, `IsWithdrawn`, `BillType`, `SortOrder`, `Skip`, `Take`.
- `GET /Bills/{billId}` — full Bill record including sponsors, current
  stage, originating House, sessions in which it has appeared,
  bill-type metadata, summary.
- `GET /Bills/{billId}/NewsArticles` — items published by Parliamentary
  comms during the Bill's progress.

### Stages
- `GET /Bills/{billId}/Stages` — every stage the Bill has reached, with
  start/end dates, House, status (`NotStarted`, `InProgress`,
  `Completed`).
- `GET /Bills/{billId}/Stages/{billStageId}` — one stage detail.

### Amendments
- `GET /Bills/{billId}/Stages/{billStageId}/Amendments` — query params
  `SearchTerm`, `Decision` (e.g. `Withdrawn`, `Agreed to`, `Disagreed
  to`, `NoDecision`, `Negatived on Division`), `Skip`, `Take`,
  `MemberId`, `MemberSearchTerm`.
- `GET /Bills/{billId}/Stages/{billStageId}/Amendments/{amendmentId}` —
  full amendment text, sponsors, decision.

### Ping-pong (Lords disagreement / Commons reasons)
- `GET /Bills/{billId}/Stages/{billStageId}/PingPongItems`
- `GET /Bills/{billId}/Stages/{billStageId}/PingPongItems/{pingPongItemId}`

### Publications and documents
- `GET /Bills/{billId}/Publications`
- `GET /Bills/{billId}/Stages/{stageId}/Publications` (note: this uses
  `stageId` not `billStageId` — same value, different param name)
- `GET /Publications/{publicationId}/Documents/{documentId}` —
  metadata for a single document.
- `GET /Publications/{publicationId}/Documents/{documentId}/Download` —
  the actual file bytes (PDF / RTF / HTML depending on type).

### RSS feeds
- `GET /Rss/allbills.rss`
- `GET /Rss/publicbills.rss`
- `GET /Rss/privatebills.rss`
- `GET /Rss/Bills/{id}.rss` — one Bill's progress feed.

### Reference data
- `GET /BillTypes` — Public, Private Member's, Government, Hybrid, etc.
- `GET /Stages` — every stage type (1st reading, 2nd reading,
  Committee, Report, 3rd reading, Lords amendments, Royal Assent).
- `GET /PublicationTypes` — Bill, Explanatory Notes, Amendment Paper,
  Marshalled List, Programme Motion, etc.
- `GET /Sittings` — sitting day list with session IDs.

## Common patterns

- `Take` caps at 20 on most endpoints; combine with `Skip` to walk a
  result set.
- Times come back as full ISO 8601 strings in UK time
  (`2026-04-28T19:41:00`).
- `currentStage` on a Bill response embeds enough of the stage record
  that you usually do not need a follow-up call to `/Stages/{id}`.

## Worked join with Hansard

```sh
# What was said at the second reading of Bill 3678?
STAGE=$(curl -s 'https://bills-api.parliament.uk/api/v1/Bills/3678/Stages' \
          | jq '.items[] | select(.description == "2nd reading") | .id')
# Hansard search by Bill title (Hansard does not key on Bill ID)
curl -s 'https://hansard-api.parliament.uk/search.json?queryParameters.searchTerm=Online%20Safety%20Bill&queryParameters.house=Commons'
```
