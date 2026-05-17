---
name: tna-discovery
description: TNA's Discovery catalogue -- the metadata catalogue covering the records held by The National Archives and partner archives across the UK. JSON + Atom API. SKILL STUB -- see notes below; full client is the next bite.
license: Open Government Licence v3.0 (Crown copyright); skill text MIT.
metadata:
  provenance-policy: docs/provenance.md
  provenance:
    tier: 3
    operator: "The National Archives (TNA)"
    service: discovery.nationalarchives.gov.uk
    upstream-data: "Catalogue metadata for records at TNA and partner archives across the UK; JSON + Atom API at discovery.nationalarchives.gov.uk/API"
    citation-short: "TNA Discovery"
    citation-formal: "Discovery catalogue, The National Archives, retrieved {date} under OGL v3.0"
    confidence: derived
    confidence-notes: "Stub. No code yet. Discovery has a documented JSON API with search/browse over ~37M record descriptions."
---

# `tna-discovery` — TNA Discovery catalogue

**Stub.** Discovery is TNA's catalogue API covering its own holdings and
~2,500 partner archives across the UK -- around 37 million record
descriptions. Public JSON API at
[`discovery.nationalarchives.gov.uk/API`](https://discovery.nationalarchives.gov.uk/API).

## What's intended

- Search endpoint (`/API/search/v1/records`) with query, date, repository filters
- Per-record metadata (`/API/records/v1/details/<id>`)
- Repository directory (`/API/search/v1/repositories`)
- Atom feed wrappers (where present)
- Resolve scope notes and personal-name authority files

## See also

- [`tna-legislation`](../tna-legislation/SKILL.md) — sibling skill, fully built
- [`data-quality`](../data-quality/SKILL.md) — discipline to follow when building
- [Discovery API documentation](https://discovery.nationalarchives.gov.uk/API)
