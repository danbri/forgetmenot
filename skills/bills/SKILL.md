---
name: bills
description: Track UK Parliament Bills (public, private, hybrid) through their stages — first reading, committee, report, third reading, Lords amendments, ping-pong, royal assent. Use whenever the question is about a piece of UK legislation in progress, its sponsors, current stage, amendments, or publications. Also exposes RSS feeds for real-time tracking.
license: Open Parliament Licence v3.0 (Crown copyright; Parliament-operated API)
metadata:
  provenance:
    tier: 1
    operator: UK Parliament
    service: bills-api.parliament.uk
    citation-short: via bills-api.parliament.uk
    citation-formal: "UK Parliament Bills API (bills-api.parliament.uk), retrieved {date}"
    confidence: authoritative
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

<!-- parl-cli-start -->

## Using the CLI

> See [`../parl/SKILL.md`](../parl/SKILL.md) for the CLI-wide conventions (output modes, flag rules, idiomatic chains).

This skill ships with a Node CLI alongside the documentation. From the
repo root:

```sh
node bin/parl.mjs bills --help
```

Or after `npm link` (one-time install):

```sh
parl bills --help
```

Wraps the Bills API.

### Examples

```sh
parl bills search --term data --house Commons --take 5
```
Search Bills with "data" in the title.

```sh
parl bills get 3678
```
One Bill detail.

```sh
parl bills stages 3678
```
All stages of a Bill.

```sh
parl bills amendments 3678 5005 --decision "Agreed to" --take 10
```
Agreed amendments at a stage.

```sh
parl bills publications 3678
```
Publications.

```sh
parl bills types
```
List Bill types reference.

```sh
parl bills stage-types
```
List stage types reference.


### Library use (Node + browser)

Same surface as a JS module:

```js
import * as fac from '../../lib/facilities/bills.mjs';

// Each function is async and returns parsed JSON (or bytes for
// download endpoints). See the .mjs source for the full export list.
```

The library uses only `fetch` / `URL` / `AbortController`, so the
same source runs in Node 18+ and in modern browsers.

<!-- parl-cli-end -->

## Provenance to cite

**Tier 1 — first-party UK Parliament.** Authoritative.

- Inline cite: **"(via `bills-api.parliament.uk`)"** — once per
  paragraph in user-facing answers.
- On request, give the URL `--raw` printed; the formal form is
  *"UK Parliament Bills API, retrieved {date}"*.
- See [`docs/provenance.md`](../../docs/provenance.md) for the
  cross-skill rules.
