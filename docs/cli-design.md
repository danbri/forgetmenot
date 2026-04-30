# CLI + library design sketch

## Goals

1. One JS library that runs unchanged in **Node 18+** and in **modern
   browsers** (uses `fetch`, `URL`, `URLSearchParams` only — no Node
   built-ins, no third-party deps).
2. A thin CLI wrapper (`bin/parl.mjs`) for Node use — for power users,
   for Claude Code, for Claude Desktop's Bash tool, for any LLM client
   that has shell access.
3. The same library, loaded directly in a `<script type="module">`, for
   in-browser local-model setups (Web LLM, Transformers.js, llama.cpp
   WASM with a chat UI).
4. **Stdlib only.** `package.json` exists for metadata and a few
   dev-time conveniences (`bin` shortcut), but `npm install` is not
   required to use the tool.
5. Self-documenting: `parl --help`, `parl <facility> --help`,
   `parl <facility> <command> --help`. Every command takes `--json`
   (default) or `--text` for human output.

## Non-goals

- **ChatGPT Code Interpreter / Gemini code execution.** These run in
  Python-only sandboxes with no internet. Skill + CLI doesn't help.
  For those, we expose the same surface as Custom GPT Actions / Gemini
  Function Declarations built from the cached OpenAPI specs. That is a
  separate artefact and is in [`docs/todo.md`](todo.md).
- A build pipeline. No bundling, no TypeScript, no minification. Source
  is what ships.

## Layout

```
forgetmenot/
├── lib/
│   ├── http.mjs                # shared fetch + retry + UA + JSON
│   ├── argparse.mjs            # tiny argv → { _, opts } parser
│   ├── format.mjs              # JSON / human-readable rendering
│   └── facilities/             # one file per facility
│       ├── members.mjs
│       ├── bills.mjs
│       ├── committees.mjs
│       ├── hansard.mjs
│       ├── commons-votes.mjs
│       ├── lords-votes.mjs
│       ├── oral-questions.mjs
│       ├── written-questions.mjs
│       ├── statutory-instruments.mjs
│       ├── treaties.mjs
│       ├── interests.mjs
│       ├── erskine-may.mjs
│       ├── now.mjs
│       ├── petitions.mjs
│       ├── sparql.mjs
│       ├── odata.mjs
│       ├── parameterised-query.mjs
│       ├── linked-data-api.mjs
│       ├── historic-hansard.mjs
│       ├── members-data-platform.mjs
│       └── data-parliament-uk-datasets.mjs
├── bin/
│   └── parl.mjs                # CLI dispatcher
├── browser/
│   ├── parl.html               # demo page
│   └── parl.js                 # ESM bundle (re-exports lib/)
├── package.json                # metadata + bin shortcut
└── skills/<facility>/
    ├── SKILL.md                # updated: includes "Using the CLI" section
    ├── reference.md
    └── cli-snippets.md         # copy-pasteable CLI examples per command
```

## CLI shape

```
parl <facility> [<command>] [<args>] [--option value] [--flag]
```

Global options:

| Option | Meaning |
|---|---|
| `--json` (default) | JSON to stdout. |
| `--text` | Human-readable rendering. |
| `--raw` | Dump the raw API response body verbatim. |
| `--no-color` | Suppress ANSI colour. |
| `--help`, `-h` | Print command help. |
| `--version`, `-v` | Print version. |
| `--user-agent <s>` | Override default `forgetmenot-cli/<version> (+https://github.com/danbri/forgetmenot)`. |
| `--timeout <s>` | Per-request timeout in seconds (default 30). |

Some commands accept a free-form `--query` JSON object so any unmodelled
parameter passes through:

```
parl members search --query '{"PolicyInterestId": 12, "Take": 50}'
```

## Per-facility CLI sketch

Each facility's commands map onto the most useful endpoints — not every
endpoint. The full reference stays in `skills/<facility>/reference.md`.

### members
```
parl members search [--name S] [--house Commons|Lords] [--postcode P] [--party-id N] [--take N]
parl members get <id> [--include biography,contact,voting,interests,edms,wq]
parl members voting <id> [--house Commons|Lords] [--page N]
parl members interests <id>
parl constituencies search --text S
parl constituencies get <id> [--geometry] [--election-results]
parl parties state <house> <date>
parl parties active <house>
parl posts gov
parl posts opp
parl posts speakers <date>
parl reference departments
parl reference policy-interests
```

### bills
```
parl bills search [--term S] [--house Commons|Lords|All] [--session N] [--member-id N] [--is-act] [--take N]
parl bills get <billId>
parl bills stages <billId>
parl bills amendments <billId> <stageId> [--decision agreed|withdrawn|...]
parl bills publications <billId>
parl bills download-document <publicationId> <documentId> --out path.pdf
parl bills rss [--public|--private|--all|--bill <id>]
parl bills reference [--types|--stages|--publication-types]
```

### committees
```
parl committees search [--term S] [--house Commons|Lords|Joint]
parl committees get <id>
parl committees members <id> [--current]
parl committees publications <id>
parl committees events <id>
parl business search [--term S] [--committee-id N]
parl business get <id>
parl business publications <id>
parl evidence oral [--committee-business-id N] [--witness S]
parl evidence written [--committee-business-id N]
parl evidence download <id> --kind oral|written --format pdf|docx|html --out path
parl meetings between <start> <end>
```

### hansard
```
parl hansard search --term S [--from D] [--to D] [--house H] [--member-id N] [--take N]
parl hansard search-debates --term S [...]
parl hansard search-divisions --term S [...]
parl hansard search-petitions --term S [...]
parl hansard contributions <type> --term S [...]   # type=Spoken|Written|...
parl hansard debate <debateSectionExtId>
parl hansard division <divisionExtId>
parl hansard divisions-in <debateSectionExtId>
parl hansard speakers <debateSectionExtId>
parl hansard member-contributions <memberId>
parl hansard sittings [--house H] [--year Y] [--month M]
parl hansard sections-for-day --house H --date D
parl hansard last-sitting --house H
```

### commons-votes
```
parl commons-votes search [--term S] [--from D] [--to D] [--member-id N] [--take N]
parl commons-votes get <divisionId>
parl commons-votes by-party <divisionId>
parl commons-votes member <memberId> [--page N]
```

### lords-votes
```
parl lords-votes search [...]
parl lords-votes get <divisionId>
parl lords-votes by-party <divisionId>
parl lords-votes member <memberId>
```

### oral-questions
```
parl oral-questions search [--from D] [--to D] [--member-id N] [--body-id N] [--term S]
parl oral-questions slots [--from D] [--to D]
parl edms search [--term S] [--member-id N] [--from D] [--to D]
parl edms get <id>
```

### written-questions
```
parl wq search [--term S] [--member-id N] [--body-id N] [--house H] [--from D] [--to D] [--answered Any|Answered|Unanswered]
parl wq get <id>
parl wq get-by-uin <date> <uin>
parl ws search [--term S] [--from D] [--to D]
parl ws get <id>
parl ws get-by-uin <date> <uin>
parl daily-reports [--from D] [--to D]
```

### statutory-instruments
```
parl si search [--term S] [--procedure-id N] [--laying-body-id N] [--from D] [--to D]
parl si get <instrumentId>
parl si timeline <instrumentId>
parl acts search [--term S] [--year Y]
parl acts get <id>
parl si reference --laying-bodies | --procedures
```

### treaties
```
parl treaties search [--term S] [--country C] [--type-id N]
parl treaties get <id>
parl treaties timeline <id>
parl treaties reference --orgs | --series
```

### interests
```
parl interests search [--member-id N] [--category-id N] [--from D] [--to D]
parl interests get <id>
parl interests categories
parl interests registers
parl interests register-pdf <id> --out path.pdf
parl interests csv [--member-id N] [--category-id N] --out path.zip
```

### erskine-may
```
parl em parts
parl em part <partNumber>
parl em chapter <chapterNumber>
parl em section <sectionId>
parl em paragraph <reference>          # e.g. 20.5
parl em search-paragraphs <term>
parl em search-sections <term>
parl em index browse [--start-letter L]
parl em index get <indexTermId>
parl em index search <term>
```

### now
```
parl now <annunciator>                 # CommonsMain|LordsMain|...
parl now <annunciator> --since <iso8601>
```

### petitions
```
parl petitions search [--state open|closed|debated|...] [--topic T] [--term S] [--count N] [--page N]
parl petitions get <id>
parl petitions archive list
parl petitions archive get <id>
```

### sparql
```
parl sparql query <inline-sparql>
parl sparql query --file path.rq
parl sparql classes                    # convenience: list classes
parl sparql predicates --of <classURI>
parl sparql describe <uri>
```

### odata
```
parl odata sets                        # list entity sets
parl odata get <set> [--filter "..."] [--select a,b] [--expand n] [--top N] [--skip N] [--orderby f]
parl odata count <set>
parl odata metadata
```

### parameterised-query
```
parl pq list                           # list of templates
parl pq run <template> [--key=value ...]   # e.g. constituency_lookup_by_postcode --postcode "SW1P 3JA"
```

### linked-data-api
```
parl lda list-datasets
parl lda get <dataset> [--page-size N] [--page N] [--sort -date] [--key=value ...]
parl lda meta <dataset>                # metadata definition
```

### historic-hansard
```
parl hh sitting <year> <mon> <day>     # returns the URL only; site is HTML
parl hh person <slug> --html-out path.html
parl hh fetch <relative-path> --html-out path.html
```

### members-data-platform
```
parl mnis members [--house Commons|Lords] [--eligible] [--expansions Constituencies,Parties,...] [--format json|xml]
parl mnis member <id> [--expansions ...]
parl mnis parties active <house>
parl mnis parties state <house> <date>
parl mnis postcode <postcode>
parl mnis reference --parties | --houses | --policy-interests
```

### data-parliament-uk-datasets
```
parl ddpd list                         # the 19 dataset names
parl ddpd map <name>                   # name -> LDA path + modern API note
```

## Library API shape

Each facility exports plain async functions. No classes, no builders.

```js
// lib/facilities/members.mjs
import { get } from '../http.mjs';

export async function search({ name, house, postcode, partyId, take = 20, ...rest } = {}, ctx = {}) {
  return get('https://members-api.parliament.uk/api/Members/Search', {
    Name: name, House: house, PostCode: postcode, PartyId: partyId, Take: take, ...rest
  }, ctx);
}

export async function getById(id, ctx = {}) {
  return get(`https://members-api.parliament.uk/api/Members/${encodeURIComponent(id)}`, {}, ctx);
}

export async function voting(id, { house, page = 1 } = {}, ctx = {}) {
  return get(`https://members-api.parliament.uk/api/Members/${id}/Voting`, { house, page }, ctx);
}
// ...etc
```

`ctx` is an optional object with `{ userAgent, timeout, fetch, signal }`
to allow callers to inject a custom fetch implementation, abort signal,
or override the User-Agent.

## Browser entry

```html
<!doctype html>
<script type="module">
import * as parl from './parl.js';
const r = await parl.members.search({ name: 'Smith' });
console.log(r);
</script>
```

`browser/parl.js` re-exports each facility under its short name:

```js
export * as members from '../lib/facilities/members.mjs';
export * as bills from '../lib/facilities/bills.mjs';
// ...
```

### CORS reality

Some Parliament APIs send `Access-Control-Allow-Origin: *`, others
don't. The known-good ones for browser use will be probed and recorded
in `_specs/probes/cors-<date>.txt`. For the rest, the browser deploy
needs a CORS proxy (a 50-line worker script — out of scope for this
repo, but documented in `docs/getting_started.md`).

## Self-documentation

Every CLI command pulls its `--help` text from the JSDoc on the
underlying library function. We do not maintain command help separately
from library docs.

## Output

By default `--json` writes one JSON object to stdout. `--text`
re-renders into a human-readable table. `--raw` is "what the API sent
back, no transformation". The pattern: get the JSON, optionally render.

## Errors

- HTTP non-2xx → CLI exit code 1, error JSON to stderr with
  `{ error: { status, url, body, message } }`.
- Network/SSL failure → exit code 2.
- Argument parse failure → exit code 64 (sysexits convention).
- All other internal errors → exit code 70.

## What this design lets the LLM do

- **With shell access** (Claude Desktop, Claude Code, Cursor, OpenWebUI
  with `node` installed, any local model orchestrated via a tool-call
  loop that can run shell commands): the model reads `SKILL.md`, sees
  the CLI examples, runs `parl <facility> <command>`, parses JSON.
- **Without shell access but with a JS runtime** (in-browser model with
  agent harness): the same library functions are imported and called
  directly.
- **With neither** (ChatGPT/Gemini chat-only, basic Claude.ai web): the
  skill text is still useful as documentation; the model reproduces
  query URLs in text and the user runs them. Less smooth but usable.
