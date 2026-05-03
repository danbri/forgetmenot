---
name: uk-parliament-appg
description: All-Party Parliamentary Groups (APPGs) — informal cross-party groups of MPs and peers organised around a country or subject. Use when the question is about who chairs/co-chairs/officers an APPG, which MPs sit on a particular group together, what financial benefits a group has received and from whom, contact and secretariat details, or AGM compliance dates. There is NO official JSON API for APPGs; this facility scrapes the Register of All-Party Parliamentary Groups, which is published as static HTML on publications.parliament.uk roughly every six weeks.
---

# All-Party Parliamentary Groups (APPGs)

Base URL: `https://publications.parliament.uk/pa/cm/cmallparty/<edition>/`

**No JSON API** is offered for APPG data. The Parliamentary
Commissioner for Standards publishes the Register of All-Party
Parliamentary Groups as a set of static HTML pages, one per group,
with a `contents.htm` index and a single consolidated PDF. A new
edition appears every ~6 weeks; each edition has its own URL keyed
by `<YYMMDD>` (e.g. `260413` = 13 April 2026).

This facility:

- discovers the available editions for a year,
- lists every group in an edition (~550 groups),
- fetches one group page and parses it into a structured record
  (title, purpose, category, officers, contact, AGM, benefits),
- crawls every group page in an edition.

The `forgetmenot` default User-Agent is rejected (HTTP 403) by
publications.parliament.uk; the facility transparently sends a
browser UA unless the caller overrides `ctx.userAgent`.

## What an APPG record looks like

Each parsed group has:

- `title` — formal group name
- `subject` — short subject as printed in the section heading
- `purpose` — group's stated purpose
- `category` — `Subject Group` or `Country Group`
- `officers[]` — array of `{ role, name, party }`
  - Roles include `Chair`, `Co-Chair`, `Vice Chair`, `Treasurer`,
    `Secretary`, `Officer`, sometimes prefixed
    `Chair & Registered Contact`.
- `contact` — registered contact, public enquiry point,
  secretariat, group website, plus extracted `emails[]` and
  `websites[]`.
- `agm` — `{ date, incomeExpenditureApproved, reportingYear, nextDeadline }`
- `benefits.financial[]` and `benefits.inKind[]` —
  `{ source, value, received, registered }`

## CLI

```sh
# Discover editions for a year (defaults to current year).
parl appg editions --year 2026

# List every group in the latest known edition.
parl appg list

# List every group in a specific edition.
parl appg list --edition 260223

# Fetch and parse one group.
parl appg get internet-communications-and-technology
parl appg get africa --edition 260223

# Crawl the entire register (slow — throttle with --delay-ms).
parl appg crawl --delay-ms 250 > register-260413.json

# Limited crawl for sanity-checking.
parl appg crawl --limit 5

# Just the URLs (no fetch).
parl appg pdf-url --edition 260413
parl appg contents-url
```

## Worked example — find pairs / small groups of MPs working together

```sh
# Get the full register, one edition.
parl appg crawl --delay-ms 200 > /tmp/appg.json

# Extract groups with ≤5 officers (most are 4 — Chair, Co-Chair, two
# Vice Chairs / Treasurer / Officer), and emit (group, officer1,
# officer2) co-officer pairs.
jq -r '
  .groups[]
  | select(.officers | length <= 5)
  | .title as $g
  | .officers as $os
  | range(0; ($os|length))
  | . as $i
  | range(($i+1); ($os|length))
  | [$g, $os[$i].name, $os[.].name] | @tsv
' /tmp/appg.json > /tmp/coofficer-pairs.tsv
```

## Notes and limitations

- Officer **names are strings**, not Parliament member IDs. To join
  to the Members API you have to name-match (e.g. via
  `parl members search --name "Caroline Dinenage"`); peers use the
  same name field.
- Membership beyond the four-or-so registered officers is **not
  published** — the Register only lists officers, not the wider
  member list of each group.
- The Register has **no diff feed**. To track changes, crawl two
  editions and diff the resulting JSON.
- Don't hammer the publications site. Default crawl throttles at
  250ms between requests (~2 minutes for a full register).

## Source

- Register landing page:
  <https://www.parliament.uk/mps-lords-and-offices/standards-and-financial-interests/parliamentary-commissioner-for-standards/registers-of-interests/register-of-all-party-party-parliamentary-groups/>
- Latest editions, e.g.:
  <https://publications.parliament.uk/pa/cm/cmallparty/260413/contents.htm>
