# Statutory Instruments API — full endpoint reference

Cached spec: [`_specs/si.json`](../../_specs/si.json)
Endpoint table: [`_specs/endpoint-tables/si.txt`](../../_specs/endpoint-tables/si.txt)

Base URL: `https://statutoryinstruments-api.parliament.uk/api/v2`

## Endpoints

### Statutory Instruments
- `GET /StatutoryInstrument` — query params include `searchTerm`,
  `instrumentTypeId`, `procedureId`, `layingBodyId`, `actId`,
  `madeDateFrom`, `madeDateTo`, `laidDateFrom`, `laidDateTo`,
  `comingIntoForceDateFrom`, `comingIntoForceDateTo`, `procedureStep`,
  `skip`, `take`, `sortOrder`.
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
- `GET /ActOfParliament` — `searchTerm`, `chapter`, `year`, `skip`,
  `take`.
- `GET /ActOfParliament/{id}` — full record.

### Reference data
- `GET /LayingBody` — departments and other laying bodies.
- `GET /Procedure` — list of all procedures.
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
