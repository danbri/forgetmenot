# APPG facility — reference

Scraper over `https://publications.parliament.uk/pa/cm/cmallparty/<edition>/`.
No JSON API exists; data is parsed from the static HTML pages
published by the Parliamentary Commissioner for Standards.

`<edition>` is `YYMMDD`, e.g. `260413` for 13 April 2026.

## CLI commands

| Command | Args / flags | Returns |
|---|---|---|
| `parl appg editions` | `--year YYYY` (default: current) | Array of `{ edition, year, date, url }`, newest first. Scrapes the year's "registers published in YYYY" landing page on parliament.uk. |
| `parl appg list` | `--edition YYMMDD` (default: latest known) | `{ edition, count, groups: [{slug, title, url}] }` for every group. |
| `parl appg get <slug>` | `--edition YYMMDD` | Parsed group record (see schema below). |
| `parl appg crawl` | `--edition YYMMDD --limit N --delay-ms 250` | `{ edition, count, groups: [...], errors: [...] }`. ~550 requests; throttle. |
| `parl appg pdf-url` | `--edition YYMMDD` | `{ url }` — consolidated PDF URL. |
| `parl appg contents-url` | `--edition YYMMDD` | `{ url }` — `contents.htm` URL. |

## URL patterns

| Resource | URL |
|---|---|
| Register landing | `https://www.parliament.uk/mps-lords-and-offices/standards-and-financial-interests/parliamentary-commissioner-for-standards/registers-of-interests/register-of-all-party-party-parliamentary-groups/` |
| Editions index for a year | `…/registers-published-in-<YYYY>/` |
| Edition root | `https://publications.parliament.uk/pa/cm/cmallparty/<YYMMDD>/` |
| Contents | `<edition>/contents.htm` |
| Introduction | `<edition>/introduction.htm` |
| Group page | `<edition>/<slug>.htm` |
| Consolidated PDF | `<edition>/register-<YYMMDD>.pdf` |

## Group record schema

```jsonc
{
  "slug": "internet-communications-and-technology",
  "edition": "260413",
  "url": "https://publications.parliament.uk/pa/cm/cmallparty/260413/internet-communications-and-technology.htm",
  "title": "Parliamentary Internet, Communications and Technology Forum All-Party Parliamentary Group",
  "subject": "Internet, Communications and Technology",   // from <h1>'s subHead span
  "purpose": "The APPG brings together parliamentarians …",
  "category": "Subject Group",                            // or "Country Group"
  "officers": [
    { "role": "Chair & Registered Contact", "name": "Dame Caroline Dinenage", "party": "Conservative" },
    { "role": "Co-Chair", "name": "Samantha Niblett", "party": "Labour" },
    { "role": "Treasurer", "name": "Baroness Neville-Rolfe", "party": "Conservative" },
    { "role": "Officer", "name": "Lord Clement-Jones", "party": "Liberal Democrat" }
  ],
  "contact": {
    "registered_contact": ["Dame Caroline Dinenage MP, House of Commons, …", "Email: caroline.dinenage.mp@parliament.uk"],
    "public_enquiry_point": ["…"],
    "secretariat": "…",
    "group_s_website": "https://pictfor.org.uk/",
    "emails": ["…"],
    "websites": ["…"]
  },
  "agm": {
    "date": "10/02/2026",
    "incomeExpenditureApproved": "Yes",
    "reportingYear": "21 Oct to 20 Oct",
    "nextDeadline": "21/02/2027"
  },
  "benefits": {
    "financial": [{ "source": "…", "value": "7,200", "received": "07/05/2025", "registered": "23/07/2025" }],
    "inKind":    [{ "source": "…", "value": "…",    "received": "…",          "registered": "…" }]
  }
}
```

## Library API

```js
import {
  BASE, DEFAULT_EDITION,
  contentsUrl, introductionUrl, groupUrl, pdfUrl,
  listEditions, listGroups, getGroup, parseGroup, crawl,
} from 'forgetmenot/lib/facilities/appg.mjs';

// Discover editions for 2026.
await listEditions({ year: 2026 });

// List every group.
const { groups } = await listGroups({ edition: '260413' });

// Fetch one group.
const rec = await getGroup('africa', { edition: '260413' });

// Parse pre-saved HTML.
import { readFileSync } from 'node:fs';
const parsed = parseGroup(readFileSync('africa.htm', 'utf8'));

// Crawl the whole register with progress and a 200 ms delay.
const all = await crawl({
  edition: '260413',
  delayMs: 200,
  onProgress: ({ i, total, slug }) => process.stderr.write(`${i}/${total} ${slug}\n`),
});
```

## How the parser works

Each group page has the structure:

```
<h1 class="mainTitle">Register Of All-Party Parliamentary Groups [as at …]
  <span class="subHead">Subject</span></h1>
<table class="basicTable"> Title / Purpose / Category </table>
<table class="basicTable"> Officers (Role | Name | Party rows) </table>
<table class="basicTable"> Contact Details </table>
<table class="basicTable"> Inaugural and Annual General Meetings </table>
<table class="basicTable"> Registrable benefits — Financial Benefits </table>
<table class="basicTable"> Registrable benefits — Benefits in Kind </table>
```

The parser extracts every `<table class="basicTable">`, dispatches
each table by the text of its first cell, and flattens cells with a
small HTML-stripping helper. The Officers table is identified by the
row sequence `[Officers] [Role|Name|Party] [data...]`.

## Why no API

UK Parliament's Members API, Bills API, and friends do not expose
APPG data at all. The Register is published by the Office of the
Parliamentary Commissioner for Standards as a downstream artifact
of the Registry team's internal records. It is the only source.

## Caveats

- **Officer names are not member IDs.** To join with the Members
  API you have to name-match. Peers and MPs both appear; honorifics
  (Dame, Sir, Lord, Baroness) are part of the name string.
- **Officers ≠ membership.** Wider membership of an APPG is not
  published — only the four (or so) registered officers per group.
- **Throttle the crawler.** ~550 group pages; 250 ms between requests
  is polite and finishes in roughly 2 minutes.
- **HTML changes.** The publications site has used the same template
  for years, but if the markup ever changes the parser will need an
  update — the dispatch keys (`Officers`, `Contact Details`, etc.)
  are sensitive to the literal label text.
