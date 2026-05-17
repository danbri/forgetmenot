# Treaties API — full endpoint reference

Cached spec: [`_specs/treaties.json`](../../_specs/treaties.json)
Endpoint table: [`_specs/endpoint-tables/treaties.txt`](../../_specs/endpoint-tables/treaties.txt)

Base URL: `https://treaties-api.parliament.uk/api`

## Endpoints

### Treaties
- `GET /Treaty` — query params per spec: `SearchText`,
  `GovernmentOrganisationId`, `Series`, `ParliamentaryProcess`,
  `DebateScheduled`, `MotionsTabledAboutATreaty`,
  `CommitteeRaisedConcerns`, `House`, `Skip`, `Take`.

  Earlier docs claimed the endpoint also accepted `Country`,
  `TreatyTypeId`, `SubjectId`, `LayingBodyId`, `LaidDateFrom`/`To`,
  `ScrutinyPeriodEndsFrom`/`To`, `Status`, `SortOrder` — **none of
  those are in the spec**. The API silently dropped them. The
  library now applies date and body filters client-side instead:
  `laidDateFrom`, `laidDateTo`, `signedDateFrom`, `signedDateTo`,
  `layingBodyId`, `leadDepartmentId`. Country / subject /
  treaty-type filtering is not derivable from the response.
- `GET /Treaty/{id}` — full record.
- `GET /Treaty/{id}/BusinessItems` — timeline.

### Business items
- `GET /BusinessItem/{id}` — one event in any treaty timeline.

### Reference data
- `GET /GovernmentOrganisation` — laying bodies. No params.
- `GET /SeriesMembership` — multilateral treaty series, e.g. UN
  Treaty Series, OECD, Council of Europe. No params.

## Notes

- A treaty laid more than once (e.g. extended, then re-laid) gets one
  treaty record but multiple chains of business items.
- The response has no structured country, subject, or treaty-type
  field — country names live free-form inside the title. For
  multilateral treaties use `Series` (server-side).
- When you pass any client-side filter (`laidDateFrom`/`To`,
  `signedDate*`, `layingBodyId`, `leadDepartmentId`) the library
  auto-pages the API and the result object gains `_unfilteredTotal`,
  `_fetched`, `_exhausted` keys so you can see how much it scanned.
