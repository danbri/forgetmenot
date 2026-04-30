# Historic Hansard — URL reference

Site: `https://api.parliament.uk/historic-hansard/`

There is no documented JSON / OpenAPI / RDF interface. The site is
HTML that follows the URL conventions captured in
[`SKILL.md`](SKILL.md). This file documents the conventions in more
detail and lists the alternative data sources.

## URL patterns

### Sittings

| URL | Returns |
|---|---|
| `/sittings/{year}` | A page listing every sitting day of the year. |
| `/sittings/{year}/{mon}` | A page listing every sitting day of the month (`mon` = `jan`..`dec`, lowercase). |
| `/sittings/{year}/{mon}/{day}` | The day index — links to Commons and Lords sections. |
| `/commons/{year}/{mon}/{day}` | Day index for Commons. |
| `/lords/{year}/{mon}/{day}` | Day index for Lords. |
| `/commons/{year}/{mon}/{day}/{slug}` | A specific debate / question / statement. |

### People

| URL | Returns |
|---|---|
| `/people` | A–Z index. |
| `/people/{slug}` | One person's biographical / contributions page. |

`slug` uses lowercase, hyphenated form, often with disambiguation
suffix, e.g. `mr-james-graham-1`.

### Constituencies, offices, Acts, Bills, divisions

| URL | Returns |
|---|---|
| `/constituencies/{slug}` | A constituency's page with MPs and divisions. |
| `/offices/{slug}` | An office (cabinet post, party leadership, …). |
| `/acts/{slug}` | An Act with its parliamentary history. |
| `/bills/{slug}` | A Bill. |
| `/divisions/{house}/{year}/{mon}/{day}/{slug}` | One division. |

## Alternative data sources for pre-1988 Hansard

Worth knowing for downstream pipelines, but **not Parliament-operated**:

- `https://github.com/mysociety/parlparse` — XML-structured
  transcripts derived from Historic Hansard. Updated by mySociety.
- `https://www.theyworkforyou.com/api/` — public API over the same
  parlparse data. Carries member-level metadata.

## Notes

- The site is best treated as a citation target ("the debate is at
  `…/historic-hansard/commons/1832/jun/04/great-reform-act`") rather
  than as a programmatic source. If you need structured pre-1988
  data, prefer the parlparse XML.
- For 1988→ use the modern [Hansard API](../hansard/SKILL.md)
  instead.
