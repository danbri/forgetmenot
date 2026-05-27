# Treaties API — full endpoint reference

Cached spec: [`_specs/treaties.json`](../../_specs/treaties.json)
Endpoint table: [`_specs/endpoint-tables/treaties.txt`](../../_specs/endpoint-tables/treaties.txt)

Base URL: `https://treaties-api.parliament.uk/api`

## Endpoints

### Treaties
- `GET /Treaty` — query params: `SearchText`, `Country`, `TreatyTypeId`,
  `SubjectId`, `LayingBodyId`, `LaidDateFrom`, `LaidDateTo`,
  `ScrutinyPeriodEndsFrom`, `ScrutinyPeriodEndsTo`, `Status`,
  `Skip`, `Take`, `SortOrder`.
- `GET /Treaty/{id}` — full record.
- `GET /Treaty/{id}/BusinessItems` — timeline.

### Business items
- `GET /BusinessItem/{id}` — one event in any treaty timeline.

### Reference data
- `GET /GovernmentOrganisation` — laying bodies.
- `GET /SeriesMembership` — multilateral treaty series, e.g. UN
  Treaty Series, OECD, Council of Europe.

## Notes

- A treaty record's `currentBusinessItem` summarises the most recent
  status; the full chain is `/Treaty/{id}/BusinessItems`.
- A treaty laid more than once (e.g. extended, then re-laid) gets one
  treaty record but multiple chains of business items.
- Country codes are ISO 3166 alpha-2 (e.g. `FR`, `US`); for
  multilateral treaties the country field is empty and you query by
  `SeriesMembership` instead.
