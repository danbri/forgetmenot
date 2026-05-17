# Statutory Instruments API — full endpoint reference

Cached spec: [`_specs/si.json`](../../_specs/si.json)
Endpoint table: [`_specs/endpoint-tables/si.txt`](../../_specs/endpoint-tables/si.txt)

Base URL: `https://statutoryinstruments-api.parliament.uk/api/v2`

## Endpoints

Parameter names below are taken verbatim from the OpenAPI spec; the API
itself is case-insensitive on query keys.

### Statutory Instruments
- `GET /StatutoryInstrument` — query params per spec:
  - `Name` (string) — instrument name substring.
  - `Procedure` (8-char id) — restrict to one procedure.
  - `ScheduledDebate`, `MotionToStop`, `ConcernsRaisedByCommittee`,
    `ParliamentaryProcessConcluded`,
    `RecommendedForProcedureChange` (boolean flags).
  - `DepartmentId` (int).
  - `LayingBodyId` (8-char id).
  - `ActOfParliamentId` (repeatable string).
  - `House` (enum: Commons / Lords / Both).
  - `Skip`, `Take` (paging).

  **No server-side date-range filter** — the library wraps the
  endpoint with a client-side implementation. Pass `laidDateFrom` /
  `laidDateTo` (matched against `commonsLayingDate` / falling back to
  `lordsLayingDate`) or `madeDateFrom` / `madeDateTo` (matched
  against `paperMadeDate`) and the library auto-pages the API in
  most-recent-first order, stopping once results fall below the
  cutoff. The response carries `_unfilteredTotal`, `_fetched` and
  `_exhausted` keys so you can see whether the scan hit
  `--max-fetch` (default 2000) before exhausting the date range.
- `GET /StatutoryInstrument/{instrumentId}` — full record incl.
  `currentBusinessItem`, parent Act reference, procedure, laying body,
  associated documents.
- `GET /StatutoryInstrument/{instrumentId}/BusinessItems` — every
  procedural step that has happened or is scheduled.

### Timelines
- `GET /Timeline/{timelineId}/BusinessItems` — same content as above
  but addressed by the timeline guid (used when an instrument has been
  laid more than once — e.g. proposed negative followed by laid SI).

### Acts of Parliament
- `GET /ActOfParliament` — only `Id` (repeatable) and `Name` (min 3
  chars). No `chapter`, `year`, `searchTerm`, `skip`, or `take`
  parameter exists in the API — earlier docs claimed otherwise.
- `GET /ActOfParliament/{id}` — full record.

### Reference data
- `GET /LayingBody` — departments and other laying bodies. No params.
- `GET /Procedure` — list of all procedures. No params.
- `GET /Procedure/{id}` — one procedure with its steps.

## Notes

- Some SIs are *proposed negatives* (laid in draft form for sifting).
  These appear in the same `/StatutoryInstrument` collection and are
  distinguished by `instrumentType`.
- The `Procedure` records describe the steps an SI follows, e.g.
  *Affirmative procedure* with steps `Laid → Approved by both
  Houses → Made`.
- When an SI is being challenged via a "prayer" motion, the prayer
  appears in `BusinessItems` with type `Prayer`.
