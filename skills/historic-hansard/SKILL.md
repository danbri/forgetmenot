---
name: uk-parliament-historic-hansard
description: Browse the historic UK Hansard (1803–2005) website at api.parliament.uk/historic-hansard. There is no documented JSON API; the site is HTML that follows a stable URL convention organising material by year, month, day, House, person, constituency, office, Act, Bill, and division. Use when the question is about pre-1988 parliamentary debates that the modern Hansard API does not cover.
---

# Historic Hansard (1803–2005)

Site root: `https://api.parliament.uk/historic-hansard/`

This is **not a JSON API**. It is an HTML site (originally
`hansard.millbanksystems.com`, now hosted under `api.parliament.uk`)
covering Hansard from 1803 to 2005. The modern
[Hansard API](../hansard/SKILL.md) starts in 1988, so there is a
seven-year overlap and 185 years of pre-1988 material that lives
only here.

## What it covers

- Sittings by date (e.g. `/sittings/1832/jun/04`).
- People (members, peers and others mentioned).
- Constituencies.
- Offices (Cabinet posts, Parliamentary roles).
- Acts of Parliament.
- Bills.
- Divisions.

## URL conventions

```
/sittings/{year}                             # year index
/sittings/{year}/{month-abbr}                # month index, e.g. jun
/sittings/{year}/{month-abbr}/{day}          # one sitting day
/commons/{year}/{month-abbr}/{day}/...       # Commons-only
/lords/{year}/{month-abbr}/{day}/...         # Lords-only
/people                                      # A–Z index of people
/people/{slug}                                # one person
/constituencies/{slug}                        # one constituency
/offices/{slug}                               # one office
/acts/{slug}                                  # one Act
/bills/{slug}                                 # one Bill
/divisions/{house}/{year}/{month-abbr}/{day}/{slug}
```

`{month-abbr}` uses three-letter lowercase abbreviations: `jan`,
`feb`, `mar`, `apr`, `may`, `jun`, `jul`, `aug`, `sep`, `oct`, `nov`,
`dec`.

## Worked example

To inspect the page for the 19 December 2005 Commons sitting, request:

```
https://api.parliament.uk/historic-hansard/sittings/2005/dec/19
```

For programmatic use, **fetch the HTML and parse**. The legacy site
does not serve JSON.

## Programmatic access options

There is no JSON API, but two reasonable approaches exist:

1. **HTML scraping.** The HTML structure is predictable; libraries
   like Python's `lxml` or `beautifulsoup4` can extract speakers,
   columns and contributions reliably.
2. **Bulk parlparse data.** The `parlparse` project at
   `https://github.com/mysociety/parlparse` distributes structured
   XML transcripts derived from Historic Hansard, used by
   TheyWorkForYou. This is **not a Parliament-operated** facility but
   it is the only structured form of pre-1988 Hansard widely
   available.

## Notes

- The site URLs are stable; many academic citations link directly
  into them.
- Coverage of 1988–2005 overlaps with the modern Hansard API; for
  that window the modern API is more accurate (the historic site is
  scanned + OCR'd up to ~1988 and digital from then on).
- We do not claim a programmatic interface here — this skill exists
  so models know where to look and what URL conventions to use, not
  to suggest you should treat the historic site as a structured API.

<!-- parl-cli-start -->

## Using the CLI

This skill ships with a Node CLI alongside the documentation. From the
repo root:

```sh
node bin/parl.mjs hh --help
```

Or after `npm link` (one-time install):

```sh
parl hh --help
```

Wraps the historic Hansard site (1803–2005). HTML only — these commands return URLs and HTML, not JSON.

### Examples

```sh
parl hh sitting-url 1832 jun 4
```
Build the URL for the 4 June 1832 sitting page.

```sh
parl hh person-url mr-james-graham-1
```
Build a person URL.

```sh
parl hh fetch sittings/2005/dec/19
```
Fetch HTML for a sitting day.


### Library use (Node + browser)

Same surface as a JS module:

```js
import * as fac from '../../lib/facilities/historic-hansard.mjs';

// Each function is async and returns parsed JSON (or bytes for
// download endpoints). See the .mjs source for the full export list.
```

The library uses only `fetch` / `URL` / `AbortController`, so the
same source runs in Node 18+ and in modern browsers.

<!-- parl-cli-end -->
