# Oral Questions and EDMs API — full endpoint reference

Cached spec: [`_specs/oralquestions.json`](../../_specs/oralquestions.json)
Endpoint table: [`_specs/endpoint-tables/oralquestions.txt`](../../_specs/endpoint-tables/oralquestions.txt)

Base URL: `https://oralquestionsandmotions-api.parliament.uk`

## Endpoints

### Oral questions
- `GET /oralquestions/list` — query params (under `parameters.`):
  `answeringDateStart`, `answeringDateEnd`, `tablingMemberIds`
  (repeatable), `answeringBodyIds`, `searchTerm`, `expandMember`,
  `formerMember`, `skip`, `take`.
- `GET /oralquestiontimes/list` — same parameter prefix; lists the
  question time slots themselves with `house`, `answeringBody`, and
  scheduled time.

### Early Day Motions
- `GET /EarlyDayMotions/list` — `parameters.searchTerm`,
  `parameters.statuses` (repeatable), `parameters.tablingMemberIds`,
  `parameters.dateTabledStart`, `parameters.dateTabledEnd`,
  `parameters.takenInTheChamber` (bool), `parameters.skip`,
  `parameters.take`.
- `GET /EarlyDayMotion/{id}` — full record with all signatures.

## Notes

- The repeating-int parameter style means `parameters.tablingMemberIds=4242&parameters.tablingMemberIds=4243`.
- Default `take` is 25; max is 1000 — but use it gently.
- `formerMember=true` is required if you want oral questions tabled by
  Members who have since left Parliament.
- For Lords oral questions look in the Hansard API
  (`/search/contributions/Spoken.json` filtered by section), the
  dedicated oral-question API is Commons-only.
