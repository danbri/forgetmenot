---
name: now
description: Read the live UK Parliament annunciator system — the screens around the Parliamentary estate that show what is currently happening in each chamber, committee room, etc. Returns the "current" message for an annunciator zone (current speaker, current item of business, division bells), or the most recent message after a given timestamp. Use when the question is about *what is happening right now* in either House.
---

# UK Parliament Annunciator API ("Now API")

Base URL: `https://now-api.parliament.uk/api`

OpenAPI 3 spec: `https://now-api.parliament.uk/swagger/v1/swagger.json`
(cached at `_specs/now.json`).

## What it covers

The annunciator is the digital signage system inside Parliament that
shows what is happening in each chamber and around the estate (current
speaker, current item, division bells). This API returns a structured
form of the slides and messages that drive those screens.

## Common entry points

| Use case | Endpoint |
|---|---|
| Current annunciator state | `GET /Message/message/{annunciator}/current` |
| Most recent message after a date | `GET /Message/message/{annunciator}/{date}` |

`{annunciator}` is the zone slug — known values include
`CommonsMain`, `LordsMain`, plus committee-corridor screens. Pass
`{date}` as ISO 8601 (e.g. `2026-04-29T14:00:00Z`).

## Worked example

```sh
curl -s 'https://now-api.parliament.uk/api/Message/message/CommonsMain/current' \
  | jq '{when: .publishTime, type: .slides[0].type, lines: .slides[0].lines, divisionBell: .showCommonsBell}'
```

## Notes

- A response with all-`BlankSlide` and a recent `publishTime` indicates
  the chamber is not currently sitting.
- `showCommonsBell` / `showLordsBell` flag a live division bell.
- For the last sitting date use the
  [Hansard](../hansard/SKILL.md) `/overview/lastsittingdate.json`.
- The annunciator API is not a substitute for the Calendar/What's-On
  feed (that subdomain has been retired); for forward-scheduled
  business consult the [Bills](../bills/SKILL.md) and
  [Committees](../committees/SKILL.md) APIs.

<!-- parl-cli-start -->

## Using the CLI

> See [`../parl/SKILL.md`](../parl/SKILL.md) for the CLI-wide conventions (output modes, flag rules, idiomatic chains).

This skill ships with a Node CLI alongside the documentation. From the
repo root:

```sh
node bin/parl.mjs now --help
```

Or after `npm link` (one-time install):

```sh
parl now --help
```

Wraps the annunciator (Now) API for live chamber state.

### Examples

```sh
parl now current CommonsMain
```
What is currently on the Commons annunciator.

```sh
parl now current LordsMain
```
Lords annunciator.

```sh
parl now since CommonsMain 2026-04-29T14:00:00Z
```
Most recent message after a timestamp.


### Library use (Node + browser)

Same surface as a JS module:

```js
import * as fac from '../../lib/facilities/now.mjs';

// Each function is async and returns parsed JSON (or bytes for
// download endpoints). See the .mjs source for the full export list.
```

The library uses only `fetch` / `URL` / `AbortController`, so the
same source runs in Node 18+ and in modern browsers.

<!-- parl-cli-end -->
