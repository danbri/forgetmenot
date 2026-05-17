---
name: mysoc-mapit
description: Use mySociety's MapIt service to resolve a UK postcode or geographic coordinate to every administrative area it sits inside — Westminster constituency (WMC), council, ward, civil parish, GLA, etc. Use whenever you have a postcode, latitude/longitude, or OSGB easting/northing and need to know which Parliament constituency it falls in (so you can join to the Members API), or when you need to enumerate every UK Parliament constituency, look up an area by ONS / GSS code, fetch a boundary polygon, or trace child areas (constituency → wards). Coverage spans every UK administrative geography; data is refreshed by mySociety from Ordnance Survey + ONS sources.
license: Creative Commons Attribution-ShareAlike 3.0 (mySociety terms)
metadata:
  facility: mysoc-mapit
  cli-alias: mapit
  base-url: https://mapit.mysociety.org
  provenance:
    tier: 3
    operator: mySociety
    service: mapit.mysociety.org
    upstream-data: "Ordnance Survey Boundary-Line + ONS administrative codes + mySociety curation"
    citation-short: "via MapIt (mySociety)"
    citation-formal: "MapIt, mySociety Ltd, retrieved {date}"
    confidence: derived
    confidence-notes: "Boundary data is upstream-authoritative (OS + ONS); the MapIt id-↔-GSS bridge and the multi-generation history are mySociety's own work. Rate-limited free tier; for production volume, register for an API key."
---

# mySociety MapIt

Base URL: `https://mapit.mysociety.org`

The canonical service for asking "what UK administrative areas
contain this point / postcode". Joins straight to Parliament data
via the `WMC` (Westminster constituency) area type: each WMC area
carries a GSS code (`PCON24CD` style) that the [`members`](../members/SKILL.md)
API also uses for `members constituency` lookups.

## What it covers

- **Postcodes** → every area containing the postcode, with lat/lon
- **Coordinates** → same, for any point in the UK (lat/lon WGS84 or
  OSGB easting/northing)
- **Area details** by MapIt id, or by external code (ONS / GSS /
  unit_id / NUTS)
- **Boundary geometry** as GeoJSON-ish polygon (with optional
  simplification)
- **Children of an area** (constituency → wards, council → wards)
- **Areas of a type** — every WMC, every LBO, every UTA, etc.
- **Generations** — MapIt records boundary epochs; you can query a
  specific historical generation.

## Most useful area types

| Type | Meaning |
|---|---|
| `WMC` | UK Parliament constituency (the headline join) |
| `LBO` | London borough |
| `LBW` | London ward |
| `UTA` | Unitary Authority |
| `UTE` | Unitary Authority electoral division |
| `MTD` | Metropolitan district |
| `MTW` | Metropolitan ward |
| `DIS` / `DIW` | District (non-metropolitan) / ward |
| `COI` / `CED` | County / electoral division |
| `CPC` / `CPW` | Civil parish / ward |
| `GLA` | Greater London Authority |
| `LAE` | London Assembly electoral region |
| `LAC` | London Assembly constituency |
| `SPE` / `SPC` | Scottish Parliament electoral region / constituency |
| `WAE` / `WAC` | Senedd Cymru electoral region / constituency |
| `NIE` | NI Assembly constituency |
| `EUR` | (legacy) European Parliament region |

## Common chains

- **"What constituency is this postcode in?"** →
  `parl mapit postcode <pc>` → pick the `WMC` from `areas`.
- **"What MP represents this lat/lon?"** →
  `parl mapit point -- 4326 <lon> <lat>` → take the `WMC.codes.gss`,
  then `parl members constituency-search --search-text "<name>"`.
- **"Show me the boundary of Aldershot"** →
  `parl mapit by-code gss E14001063` returns the area; then
  `parl mapit geometry <id>` for the polygon.
- **"List every UK constituency"** →
  `parl mapit areas WMC` returns all 650 in the current generation.

## CLI

```sh
parl mapit postcode SW1P3JA
parl mapit point -- 4326 -0.1276 51.4994   # note: `--` separates flags from negative lon
parl mapit by-code gss E14001063
parl mapit areas WMC                        # all 650 Westminster constituencies
parl mapit geometry 169984                  # one boundary polygon
parl mapit area 169984                      # one area's metadata
parl mapit children 169984 --type LBW       # ward children
parl mapit generations                      # boundary epochs
```

Pass `--api-key <KEY>` (or set it via the shared library `ctx`) to
use mySociety's paid tier. The free tier is rate-limited; the
library accepts the flag and never logs the value.

## Library use

```js
import * as mapit from '../../lib/facilities/mysoc-mapit.mjs';

const pc = await mapit.postcode('SW1P3JA');
const wmc = Object.values(pc.areas).find((a) => a.type === 'WMC');
// → { name: 'Cities of London and Westminster', codes: { gss: 'E14001172', ... } }

const allConstituencies = await mapit.areasOfType('WMC');
// → 650 entries (the modern review)
```

## Relationship to other facilities

- The **GSS code** on each `WMC` area is the same string Parliament
  uses; join straight to [`members`](../members/SKILL.md) via
  `constituency-search`.
- For **higher-fidelity boundary polygons**, prefer
  [`ons-geo`](../ons-geo/SKILL.md) — ONS publishes the authoritative
  boundary at multiple resolutions (BUC clipped, BFE full extent,
  etc.). MapIt's geometry is a derivative.
- For **historical boundaries** (pre-2024 review), MapIt records
  each generation explicitly; `generations` lists them.

## Provenance to cite

**Tier 3 — third-party (mySociety).** Upstream data is Ordnance
Survey + ONS (Crown copyright, OGL v3.0); the id-bridge and
generation history are mySociety's curation.

- Inline cite: **"(via MapIt, mySociety)"** — once per paragraph.
- When citing a boundary polygon for high-stakes use, prefer the
  upstream OS / ONS source — say "ONS 2024 boundary, via MapIt"
  rather than implying MapIt is the authority.
- See [`../../docs/provenance.md`](../../docs/provenance.md) for
  the cross-skill rules.
