---
name: whatson
description: Query the UK Parliament "What's On" Calendar API for events, sittings, recess, procedural deadlines, and parliamentary sessions. Use when the question is about whether either House sits on a given date, the date a written question tabled today must be answered by, when a Statutory Instrument's praying period expires, the list of events in a date range, or which session a date falls in. This is the only Parliament-operated source for procedural dates (sitting / non-sitting / answer / tabling / annulment dates), and for the canonical Session list (Parliament numbers, session numbers, start / end dates).
license: Open Government Licence v3.0 (Crown copyright)
metadata:
  facility: whatson
  cli-alias: whatson
  base-url: https://whatson-api.parliament.uk
  spec: _specs/whatson.json
  provenance:
    tier: 1
    operator: UK Parliament
    service: whatson-api.parliament.uk
    citation-short: "via whatson-api.parliament.uk"
    citation-formal: "UK Parliament What's On / Calendar API, retrieved {date}"
    confidence: authoritative
---

# UK Parliament What's On (Calendar) API

Base URL: `https://whatson-api.parliament.uk`
OpenAPI 2.0 spec: `https://whatson-api.parliament.uk/swagger/docs/v1` (cached at `_specs/whatson.json`).

This is the canonical source inside Parliament for **calendar events, procedural dates, and sessions**. It is the only public API that knows whether a date is a sitting day, the answer-deadline for a question tabled on a given date, or the session a date falls in. Nothing in our other facilities exposes these.

## What it covers

- **Events** (`/calendar/events/*`) — every scheduled item of business in either House or in committees. Same filter set across `list`, `nonsitting`, `diary`, `speakers`. Filters: `house`, `eventTypeId`, `startDate`, `endDate`, `locationId`, `memberId`, `tag`, `committeeId`, `inquiryId`, `categoryId`, `searchTerm`, `answeringBodyIds`.
- **Procedural dates** (`/calendar/proceduraldates/{house}/*`):
  - `sittingdates` — sitting days in a range
  - `nextsittingdate` / `lastsittingdate` — sitting around a given date
  - `tablingdate` — what date a question / motion should be tabled by to be answered on a target date
  - `answerdate` — when a question tabled on `tabledDate` will be answered (NamedDay vs Ordinary)
- **Annulment date** (`/calendar/proceduraldates/annulmentdate/forDate`) — for an SI laid on `dateLaid`, when does the 40-day praying period end? (Set `isTreaty=true` for treaty CRaG-period calculations.)
- **Sessions** (`/calendar/sessions/*`) — list of every Parliament session (50/2 onwards), or look up by id or for-date.
- **Reference lists** (`/calendar/{locations,tags,types,categories}/list`) — vocabularies for the event filters.

## How parameters work

The **17 event-shape endpoints** (everything under `/calendar/events/`) and the EventTypeMetaData endpoint take filters under a `queryParameters.` prefix (the library handles this; you pass plain options). The **5 procedural-date endpoints** take flat query params. The library exposes both shapes uniformly.

## Common chains

- **"Is Parliament sitting tomorrow?"** → `whatson next-sitting Commons --date-to-check 2026-05-16`
- **"When does this SI's praying period end?"** → `whatson annulment-date --date-laid 2026-04-23 --days-in-future 40`
- **"What's in the Commons diary next week?"** → `whatson events --house Commons --from 2026-05-18 --to 2026-05-22`
- **"Which session covers 7 May 2026?"** → `whatson session-for-date 2026-05-07`

## Using the CLI

This skill ships with the `parl` CLI. See [`../parl/SKILL.md`](../parl/SKILL.md) for global usage. Per-facility help: `parl whatson --help`.

```sh
parl whatson sessions
parl whatson events --house Commons --from 2026-05-18 --to 2026-05-22
parl whatson sitting-dates Commons --from 2026-05-01 --to 2026-05-31
parl whatson next-sitting Commons --date-to-check 2026-05-16
parl whatson answer-date Commons --question-type NamedDay --tabled-date 2026-05-14
parl whatson annulment-date --date-laid 2026-04-23 --days-in-future 40
```

## Library use (Node + browser)

```js
import * as whatson from '../../lib/facilities/whatson.mjs';

await whatson.nextSittingDate('Commons', { dateToCheck: '2026-05-16' });
await whatson.eventsList({ house: 'Commons', from: '2026-05-18', to: '2026-05-22' });
await whatson.annulmentDate({ dateLaid: '2026-04-23', daysInFuture: 40 });
```

## Coverage and notes

- `Session 50/2` is 1988-89; the list goes back to the start of the modern Parliament number scheme. For the current session, the highest `EndDate` wins.
- Annulment date is the same calculation the Joint Committee on Statutory Instruments uses for the 40-day praying period (with `isTreaty=true` it switches to the 21 sitting-day CRaG window).
- This API replaces the now-retired `services.orderpaper.parliament.uk` for calendar / future-business lookups.

## Provenance to cite

**Tier 1 — first-party UK Parliament.** Authoritative.

- Inline cite: **"(via whatson-api.parliament.uk)"** — once per paragraph in
  user-facing answers.
- On request, give the URL `--raw` printed.
- See [`docs/provenance.md`](../../docs/provenance.md) for the
  cross-skill rules.
