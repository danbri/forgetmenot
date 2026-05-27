---
name: uk-parliament-oral-questions-and-edms
description: Query tabled oral questions and Early Day Motions (EDMs) for the UK House of Commons. Oral questions are scheduled question-time slots (PMQs, departmental questions) that may not all be reached. EDMs are a way for backbench MPs to express opinions and gather signatures without expecting a debate. Use when the question is about an oral question scheduled for a specific date or about an EDM by number, sponsor, or topic.
---

# Oral Questions & Early Day Motions API

Base URL: `https://oralquestionsandmotions-api.parliament.uk`

Swagger 2 spec: `https://oralquestionsandmotions-api.parliament.uk/swagger/docs/v1`
(cached at `_specs/oralquestions.json`).

## What it covers

- **Oral questions** — questions tabled for oral answer (departmental
  question times, PMQs, urgent questions). Whether actually reached on
  the day depends on order; this API records the tabled record.
- **Oral question times** — the calendar of oral question slots per
  House.
- **Early Day Motions (EDMs)** — backbench expressions of opinion;
  signatures count but a debate is rare.

This API is **Commons-only**. Lords questions go through the
[Questions & Statements](../written-questions-and-statements/SKILL.md)
API for written, and the Hansard API for spoken.

## Common entry points

| Use case | Endpoint |
|---|---|
| List oral questions | `GET /oralquestions/list?parameters.answeringDateStart=2026-04-01&parameters.answeringDateEnd=2026-04-30&parameters.take=20` |
| List oral question times (slots) | `GET /oralquestiontimes/list?parameters.answeringDateStart=2026-04-01&parameters.answeringDateEnd=2026-04-30` |
| List EDMs | `GET /EarlyDayMotions/list?parameters.searchTerm=climate&parameters.take=20` |
| One EDM | `GET /EarlyDayMotion/{id}` |

Parameters live under a `parameters.` prefix.

## Worked example

```sh
# Oral questions to the Department for Energy in April 2026
curl -s 'https://oralquestionsandmotions-api.parliament.uk/oralquestions/list?parameters.answeringBodyIds=58&parameters.answeringDateStart=2026-04-01&parameters.answeringDateEnd=2026-04-30&parameters.take=20'
```

## Notes

- `answeringBodyIds` matches the Members API
  `Reference/AnsweringBodies` table.
- An EDM ID looks like `66088` and is stable across sessions; the EDM
  detail returns `sponsoringMember`, `primarySponsor`, `dateTabled`,
  `signatureCount`, `signatures[]`.
- Search results sort newest-first by default.
- See `reference.md` for parameter details.

<!-- parl-cli-start -->

## Using the CLI

This skill ships with a Node CLI alongside the documentation. From the
repo root:

```sh
node bin/parl.mjs oral-questions --help
```

Or after `npm link` (one-time install):

```sh
parl oral-questions --help
```

Wraps the Commons-only Oral Questions and EDMs API.

### Examples

```sh
parl oral-questions questions --from 2026-04-01 --to 2026-04-30 --take 5
```
Tabled oral questions.

```sh
parl oral-questions slots --from 2026-04-01 --to 2026-04-30
```
Question time slots.

```sh
parl oral-questions edms --term climate --take 5
```
Search EDMs.

```sh
parl oral-questions edm 66088
```
One EDM.


### Library use (Node + browser)

Same surface as a JS module:

```js
import * as fac from '../../lib/facilities/oral-questions.mjs';

// Each function is async and returns parsed JSON (or bytes for
// download endpoints). See the .mjs source for the full export list.
```

The library uses only `fetch` / `URL` / `AbortController`, so the
same source runs in Node 18+ and in modern browsers.

<!-- parl-cli-end -->
