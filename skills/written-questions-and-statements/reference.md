# Written Questions & Statements API — full endpoint reference

Cached spec: [`_specs/questions-statements.json`](../../_specs/questions-statements.json)
Endpoint table: [`_specs/endpoint-tables/questions-statements.txt`](../../_specs/endpoint-tables/questions-statements.txt)

Base URL: `https://questions-statements-api.parliament.uk/api`

## Written questions

- `GET /writtenquestions/questions` — query params:
  `askingMemberId` (repeatable, int), `house` (`Commons`/`Lords`),
  `members` (repeatable), `party` (string), `answeringBodies`
  (repeatable, int), `searchTerm`, `tabledWhenFrom`, `tabledWhenTo`,
  `answeredWhenFrom`, `answeredWhenTo`, `dateForAnswerFrom`,
  `dateForAnswerTo`, `expandMember`, `answered`
  (`Any`/`Answered`/`Unanswered`), `correctedOnly`,
  `includeWithdrawn`, `withDeposits`, `withAttachment`, `groupedQuestions`,
  `questionStatus` (e.g. `Tabled`, `WithdrawnByMember`), `take`, `skip`,
  `orderBy` (`d` = date desc, `da` = date asc, etc.), `useDates`.
- `GET /writtenquestions/questions/{id}` — by integer ID.
- `GET /writtenquestions/questions/{date}/{uin}` — `date` is
  `YYYY-MM-DD` (date tabled), `uin` is the published reference like
  `HC123456`.

## Written statements

- `GET /writtenstatements/statements` — query params:
  `madeWhenFrom`, `madeWhenTo`, `searchTerm`, `house`,
  `madeByMemberId`, `makingDepartmentId`, `take`, `skip`, `orderBy`.
- `GET /writtenstatements/statements/{id}`
- `GET /writtenstatements/statements/{date}/{uin}`

## Daily reports

- `GET /dailyreports/dailyreports` — query params: `take`, `skip`,
  `orderBy`, `madeWhenFrom`, `madeWhenTo`. Each report is a date and
  pointers to the day's questions and statements.

## Notes

- This API replaces the older `writtenquestions-api.parliament.uk`
  host; that host still exists but `301`-redirects here.
- For *oral* questions see
  [`oral-questions-and-edms`](../oral-questions-and-edms/SKILL.md).
- `groupedQuestions` exposes question grouping — when several MPs ask
  similar questions, the department can group them into one composite
  answer; the grouped questions all share the same `groupId`.
- Responses include `attachments[]` for any PDF attachments to the
  answer (download URL given in each entry).
