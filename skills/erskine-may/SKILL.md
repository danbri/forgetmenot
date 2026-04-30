---
name: uk-parliament-erskine-may
description: Search and retrieve Erskine May — *A Treatise on the Law, Privileges, Proceedings and Usage of Parliament*, the authoritative reference work on UK parliamentary procedure. Browse by Part, Chapter, Section, paragraph reference (e.g. "20.5") or index term, or full-text search across the whole work. Use when the question is about parliamentary procedure, precedent, the rules governing debate, motions, divisions, privilege, or anything else covered in Erskine May.
---

# Erskine May API

Base URL: `https://erskinemay-api.parliament.uk/api`

OpenAPI 3 spec: `https://erskinemay-api.parliament.uk/swagger/v1/swagger.json`
(cached at `_specs/erskinemay.json`).

## What it covers

The full, current 25th edition of *Erskine May* (Parliament's
authoritative procedure manual) as a structured tree:

- **Parts** — the top-level divisions (e.g. "Privilege").
- **Chapters** — numbered chapters within each part.
- **Sections** — sub-chapter sections; each section has step navigation.
- **Paragraphs** — individual numbered paragraphs (the smallest cited
  unit, e.g. "20.5").
- **Index terms** — the back-of-book index, browseable A–Z and
  searchable.

## Common entry points

| Use case | Endpoint |
|---|---|
| List all Parts | `GET /Part` |
| One Part | `GET /Part/{partNumber}` |
| One Chapter | `GET /Chapter/{chapterNumber}` |
| One Section | `GET /Section/{sectionId}` |
| Section navigation step | `GET /Section/{sectionId},{step}` (e.g. `/Section/12345,next`) |
| Paragraph by reference | `GET /Search/Paragraph/{reference}` (e.g. `20.5`) |
| Full-text search of paragraphs | `GET /Search/ParagraphSearchResults/{searchTerm}` |
| Full-text search of sections | `GET /Search/SectionSearchResults/{searchTerm}` |
| Browse index A–Z | `GET /IndexTerm/browse?startLetter=A` |
| One index term | `GET /IndexTerm/{indexTermId}` |
| Full-text search of index | `GET /Search/IndexTermSearchResults/{searchTerm}` |

## Worked example

```sh
# Find paragraphs about "casting vote"
curl -s 'https://erskinemay-api.parliament.uk/api/Search/ParagraphSearchResults/casting%20vote' \
  | jq '.searchResults[] | {ref: .reference, text: (.contentTextHtml | gsub("<[^>]+>"; "") | .[0:160])}'

# Or pull a paragraph directly by its reference
curl -s 'https://erskinemay-api.parliament.uk/api/Search/Paragraph/20.5'
```

## Notes

- References (e.g. `20.5`) are stable across reprints within an edition
  but may change between editions.
- HTML in paragraph text contains semantic markup (`<em>`,
  `<a>`-style cross-references); strip tags for plain text or render
  as HTML.
- Erskine May is © House of Commons / House of Lords; the API is
  available under the Open Parliament Licence for reuse.
