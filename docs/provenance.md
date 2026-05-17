# Provenance and naming convention

This repo's centre of gravity is the **UK Parliament** (both Houses)
and the material Parliament itself curates: the official APIs, the
SPARQL / OData / LDA endpoints, the Commons Library and POST
research, and the procedural artefacts (SIs, treaties, Erskine May,
the Register of Members' Financial Interests, etc.).

Anything else we wrap — third-party APIs (TheyWorkForYou,
legislation.gov.uk, Electoral Commission, Find Case Law, Companies
House, Wikidata…) and our own scraped or heuristic extractions
(APPG officers, FCDO Treaties Online crawler, MP website
screenshots) — must wear its provenance on its face. A reader,
human or LLM, should never have to guess whether a fact came from
Parliament's authoritative graph, from a friendly third-party
aggregator, or from our own pattern-matching.

This document is the convention. It governs **skill names**,
**library / CLI facility names**, **command and option names**,
**output shape**, and **what the SKILL.md body tells the LLM to
cite**.

## The three provenance tiers

| Tier | What it is | Naming rule |
|---|---|---|
| **1. First-party Parliament** | Data published by an organisation of Parliament under an Open Parliament Licence-equivalent, via an API or RDF store operated by Parliament itself. | **No prefix.** Examples: `members`, `bills`, `hansard`, `committees`, `commons-votes`, `lords-votes`, `oral-questions-and-edms`, `written-questions-and-statements`, `statutory-instruments`, `treaties`, `interests`, `erskine-may`, `now`, `petitions`, `sparql`, `odata`, `parameterised-query`, `linked-data-api`, `historic-hansard`, `members-data-platform`, `data-parliament-uk-datasets`, `whatson`, `guide-to-procedure`, `bill-papers`, `library-feeds`. |
| **2. Derived from Parliament (heuristic)** | Material Parliament publishes only as HTML / PDF where we apply our own scraping / parsing / heuristic resolution. Provenance is *upstream* Parliament, but the *interpretation* is ours and can be wrong. | **`scraped-<name>`.** Example today: `scraped-appg` (currently named `appg`; rename pending). Tomorrow: `scraped-standing-orders` if we wrap Standing Orders fragments. |
| **3. Third-party** | Any service NOT operated by Parliament, whether or not its data is Parliament-derived. | **`<producer>-<name>`** where `<producer>` is the organisation operating the service. Examples: `mysoc-twfy`, `tna-legislation`, `tna-caselaw`, `tna-discovery`, `ec-donations`, `ec-spending`, `dc-candidates`, `dc-elections`, `wikidata`, `ons`, `ch-companies` (Companies House), `cc-charities` (Charity Commission), `boe-stats` (Bank of England). |

The `<producer>` prefix is a short **organisation slug**, not a
domain name. Slugs are stable and reusable across multiple skills
from the same producer (mySociety alone may have `mysoc-twfy`,
`mysoc-wdtk`, `mysoc-fms`).

Reserved producer slugs (extend as we wrap more):

| Slug | Organisation |
|---|---|
| `tna` | The National Archives |
| `mysoc` | mySociety |
| `dc` | DemocracyClub |
| `ec` | Electoral Commission |
| `ons` | Office for National Statistics |
| `ch` | Companies House |
| `cc` | Charity Commission |
| `wikidata` | Wikidata (Wikimedia Foundation) |
| `boe` | Bank of England |
| `gla` | Greater London Authority |
| `senedd` | Senedd Cymru (devolved Parliament — first-party to *its* legislature, third-party to Westminster) |
| `sp` | Scottish Parliament (same) |
| `nia` | Northern Ireland Assembly (same) |

Devolved parliaments are first-party to themselves but third-party
to Westminster. Because this repo's focus is Westminster, they
carry their producer prefix here.

## Mixed-source facilities (e.g. SI)

A few facilities legitimately fold data from multiple producers
into one record — typically Parliament's procedural metadata
joined to TNA's enacted text. The naming rule:

- The facility takes the name of the **dominant / authoritative**
  source. E.g. `statutory-instruments` stays first-party because
  the procedural record (laying body, committee concerns, prayer
  motions) is Parliament's. If we add SI **text** extraction from
  legislation.gov.uk, that field is sourced from `tna-legislation`
  and must be tagged per-field (see "Field-level provenance"
  below). The facility name does NOT change.
- If a facility is *more* third-party than first-party, it lives
  under the third-party prefix. A hypothetical "tax-treaties"
  facility that mostly draws from FCDO + HMRC and only
  occasionally checks the Parliament Treaties API would be
  `tna-treaties` or `fcdo-treaties`, not `treaties`.

## Frontmatter: required `metadata.provenance`

Every `SKILL.md` carries structured provenance in YAML
frontmatter. The shape:

```yaml
metadata:
  provenance:
    tier: 1            # 1 = first-party Parliament
                       # 2 = scraped-from-Parliament-HTML
                       # 3 = third-party
    operator: "UK Parliament"
    service: "bills-api.parliament.uk"
    upstream-data: ""           # for tier ≥ 2: where the data came from
    license: "Open Parliament Licence v3.0"
    citation-short: "via bills-api.parliament.uk"
    citation-formal: "House of Commons / House of Lords Bills API, retrieved {date}"
    confidence: "authoritative" # authoritative | derived | heuristic
```

For tier 2 (scraped):

```yaml
metadata:
  provenance:
    tier: 2
    operator: "forgetmenot (heuristic extraction)"
    service: "publications.parliament.uk Register of APPGs (HTML)"
    upstream-data: "UK Parliament Register of All-Party Parliamentary Groups"
    license: "Open Parliament Licence v3.0 (upstream); extraction methods MIT"
    citation-short: "Register of APPGs (Parliament); officer→Member resolution by forgetmenot heuristics"
    citation-formal: "Register of All-Party Parliamentary Groups, Parliament of the United Kingdom; officer-to-Member resolution by forgetmenot heuristics, accessed {date}"
    confidence: "heuristic"
    confidence-notes: "Group metadata high-confidence (Parliament-published); officer name → Member API id 99% auto-resolved, ambiguous cases in judgment_needed.jsonl"
```

For tier 3 (third-party):

```yaml
metadata:
  provenance:
    tier: 3
    operator: "mySociety"
    service: "theyworkforyou.com"
    upstream-data: "UK Parliament (members-api, bills-api, hansard-api) plus mySociety analyses"
    license: "Creative Commons Attribution-ShareAlike 3.0 (mySociety terms)"
    citation-short: "via TheyWorkForYou (mySociety)"
    citation-formal: "TheyWorkForYou, mySociety Ltd, retrieved {date}; underlying data: UK Parliament"
    confidence: "derived"
```

## Body: the "Provenance to cite" block

Every SKILL.md ends with a short block the LLM must follow when
returning facts derived from this skill:

```markdown
## Provenance to cite

This skill returns data from **<operator>** (<tier> source).

When you state a fact derived from this skill in a user-facing
answer:

- Include a brief inline cite — `<citation-short>` — at the end of
  the relevant sentence or paragraph. Once per paragraph is enough;
  don't repeat for every clause.
- If the user asks for a source explicitly, give the URL the tool
  actually called (visible via `--raw`) and the formal citation.
- If you combine this skill's data with another skill's, attribute
  each fact to its source. Prefer "per <skill A>: X; per <skill B>:
  Y" over a merged sentence.
- Never up-rate confidence. Tier 2 / tier 3 facts must not be
  presented as if they came straight from Parliament's
  authoritative graph.
- If the data carries `_field_sources` (mixed-source facility),
  treat each field's provenance independently.
```

The "without being annoying" rule of thumb: **one inline cite per
paragraph**, not per fact. The full formal citation only on
request or for high-stakes statements (numbers, named persons,
quoted text).

## CLI: provenance in output

The `parl` CLI carries provenance unobtrusively:

1. The default JSON output already includes the URL called when
   `--raw` is used. That's the primary, machine-readable
   provenance.
2. A `--provenance` flag (forthcoming) wraps every response in:
   ```json
   {
     "_provenance": {
       "tier": 1,
       "operator": "UK Parliament",
       "service": "bills-api.parliament.uk",
       "url": "https://bills-api.parliament.uk/api/v1/Bills?take=1",
       "retrieved_at": "2026-05-16T22:50:00Z",
       "license": "Open Parliament Licence v3.0"
     },
     "items": [...]
   }
   ```
   The flag is opt-in to avoid bloating routine output.
3. For **mixed-source facilities**, each merged record carries
   `_field_sources`:
   ```json
   {
     "id": "8KjNOSBQ",
     "name": "Control of Explosives Precursors etc...",
     "enactedText": "<excerpt from legislation.gov.uk>",
     "_field_sources": {
       "id": "parl/statutoryinstruments-api",
       "name": "parl/statutoryinstruments-api",
       "currentBusinessItem": "parl/statutoryinstruments-api",
       "enactedText": "tna/legislation.gov.uk"
     }
   }
   ```
   The `_field_sources` map is added whenever a facility joins
   data across producer tiers. Same-producer joins (Parliament SI
   API + Parliament SPARQL) do NOT require per-field tagging — the
   `_provenance` wrapper covers it.

## Scripts and crawl outputs

Anything under `third_party/data/<topic>/` is, by definition,
tier 2 or tier 3 (or this repo's own extraction). Each such
directory must carry a `README.md` with the same provenance
metadata at its head — operator, upstream, confidence, license —
so the artefact is interpretable on its own.

Examples that exist today:

- `third_party/data/appg/` — tier 2 (Parliament HTML + our
  heuristics)
- `third_party/data/fcdo_treaties/` — tier 3 (FCDO UKTO crawler,
  see `README.md` there)
- `third_party/data/sites/` — tier 3 (MP website snapshots; the
  websites themselves are third-party even when an MP runs one)

## Migration plan

This convention is being introduced after most facilities exist.
Rollout:

1. **Today (this commit)**: convention codified in this doc; the
   `parl` meta-skill carries a short pointer; `metadata.provenance`
   added to `parl`, `bills` (tier-1 exemplar) and `appg` (tier-2
   exemplar) frontmatter; `appg` skill's body gains the "Provenance
   to cite" block as an exemplar.
2. **Soon**: same `metadata.provenance` block added to the other
   25 first-party skills (mechanical patch).
3. **When we add a tier-3 facility** (e.g. `mysoc-twfy`,
   `tna-legislation`): it ships compliant from day 1; we use it as
   the tier-3 exemplar.
4. **Rename `appg` → `scraped-appg`**: deferred (every external
   reference would need updating). Use the existing folder until
   we have a reason to do the migration in a single sweep, but the
   `metadata.provenance.tier: 2` field already signals the truth.

## Anti-patterns

- **Don't fold tier-2 / tier-3 data into a tier-1 facility
  silently.** If `members` ever starts mixing in TheyWorkForYou
  fields, those fields MUST carry `_field_sources` tags. If that
  feels heavy, split it into a separate `mysoc-twfy` facility
  instead.
- **Don't reuse a name across tiers.** There is one `treaties`
  (Parliament CRaG laid treaties). A "FCDO Treaties Online"
  facility would be `fcdo-treaties`, never just `treaties`.
- **Don't invent a producer prefix.** Reuse from the table above
  or extend it explicitly in this doc.
- **Don't paste the formal citation on every sentence.** Once per
  paragraph; full citation only on request.
- **Don't claim heuristic confidence as authoritative.** If a
  matching step was 95% confident, say "likely <person>" not
  "<person>".
