---
name: written-questions-and-statements
description: Query written parliamentary questions, written ministerial statements, and the daily report bundle of Q&A activity for both Houses. Written questions ("PQs") receive written answers from a department's minister and are searchable by topic, member, dates, answering body, and unique question reference (UIN). Use for "what did Minister X say about Y" or "how many PQs are outstanding for Department Z".
license: Open Parliament Licence v3.0 (Crown copyright; Parliament-operated)
metadata:
  provenance:
    tier: 1
    operator: UK Parliament
    service: questions-statements-api.parliament.uk
    citation-short: "via questions-statements-api.parliament.uk"
    citation-formal: "UK Parliament Written Questions and Statements API, retrieved {date}"
    confidence: authoritative
---

# Written Questions & Statements API

Base URL: `https://questions-statements-api.parliament.uk/api`

OpenAPI 3 spec: `https://questions-statements-api.parliament.uk/swagger/v1/swagger.json`
(cached at `_specs/questions-statements.json`).

The legacy `writtenquestions-api.parliament.uk` host now redirects
here; use this hostname.

## What it covers

- **Written questions** with their tabled date, answering body, member,
  question text, answer text (when given), date answered, holding
  responses, grouped questions, attached files.
- **Written ministerial statements** by date, member, and house.
- **Daily reports** — the per-day bundle (Friday's `Daily Report` PDF
  and structured form).

## Common entry points

| Use case | Endpoint |
|---|---|
| Search written questions | `GET /writtenquestions/questions?searchTerm=climate&askingMemberId=...&answeringBodies=...&house=Commons|Lords&tabledWhenFrom=2026-01-01&tabledWhenTo=2026-04-30&answered=Answered&take=20` |
| One question by ID | `GET /writtenquestions/questions/{id}` |
| One question by date+UIN | `GET /writtenquestions/questions/{date}/{uin}` |
| Search written statements | `GET /writtenstatements/statements?searchTerm=...&makingDepartmentId=...&dateFrom=...&dateTo=...&take=20` |
| One statement by ID | `GET /writtenstatements/statements/{id}` |
| One statement by date+UIN | `GET /writtenstatements/statements/{date}/{uin}` |
| Daily report dates | `GET /dailyreports/dailyreports?take=20` |

## Worked example

```sh
# Written questions to the Department of Health asking about NHS dentistry
curl -s 'https://questions-statements-api.parliament.uk/api/writtenquestions/questions?searchTerm=NHS%20dentistry&answeringBodies=17&take=5' \
  | jq '.results[] | {uin, member: .askingMember.name, dept: .answeringBodyName, text: .questionText, answer: .answerText}'
```

## Notes

- The `uin` (Unique Identification Number) is the human-readable
  question number you see on parliament.uk (e.g. `HC123456`).
- `answeringBodies` is repeatable; IDs are the same as the Members API
  `Reference/AnsweringBodies` list.
- `answered` is `Answered`, `Unanswered`, or `Any`.
- Pagination is `skip` + `take`, default `take=20`, max 100.
- See `reference.md` for the full parameter list.

<!-- parl-cli-start -->

## Using the CLI

> See [`../parl/SKILL.md`](../parl/SKILL.md) for the CLI-wide conventions (output modes, flag rules, idiomatic chains).

This skill ships with a Node CLI alongside the documentation. From the
repo root:

```sh
node bin/parl.mjs wq --help
```

Or after `npm link` (one-time install):

```sh
parl wq --help
```

Wraps the Written Questions and Statements API. Replaces the legacy writtenquestions-api host.

### Examples

```sh
parl wq search --term "NHS dentistry" --take 5
```
Search written questions.

```sh
parl wq get 1234567
```
Question by ID.

```sh
parl wq by-uin 2026-04-29 HC123456
```
Question by date+UIN.

```sh
parl wq statements --from 2026-04-01 --to 2026-04-30 --take 5
```
Written statements.

```sh
parl wq reports --take 5
```
Daily reports.


### Library use (Node + browser)

Same surface as a JS module:

```js
import * as fac from '../../lib/facilities/written-questions.mjs';

// Each function is async and returns parsed JSON (or bytes for
// download endpoints). See the .mjs source for the full export list.
```

The library uses only `fetch` / `URL` / `AbortController`, so the
same source runs in Node 18+ and in modern browsers.

<!-- parl-cli-end -->

## Provenance to cite

**Tier 1 — first-party UK Parliament.** Authoritative.

- Inline cite: **"(via questions-statements-api.parliament.uk)"** — once per paragraph in
  user-facing answers.
- On request, give the URL `--raw` printed.
- See [`docs/provenance.md`](../../docs/provenance.md) for the
  cross-skill rules.
