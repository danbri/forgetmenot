# England's secondary-legislation geographies

One interactive Leaflet map (`index.html`) of England with a layer control
toggling five geographies that are each **defined by secondary legislation**
(statutory instruments made under Acts of Parliament). Open
`/legislation-map` on the fpkg server, or `index.html` directly via `file://`.

This single map replaces three earlier prototypes (`mcz/`, `designations/`,
`covid-tiers/`), which have been deleted.

## Layers

All geometry is **server-side generalised** at fetch time
(`maxAllowableOffset` ≈ 200–500 m in SR 4326, `geometryPrecision=4`) so it is
small enough to inline — it is for display only and is **not** authoritative
for legal extent.

| # | Layer | Features | Source service | Governing SI / Act |
|---|---|---|---|---|
| 1 | Westminster constituencies (England) | 543 | ONS Open Geography `Westminster_Parliamentary_Constituencies_July_2024_Boundaries_UK_BUC` (`services1.arcgis.com/ESMARspQHYMw9BZ9`), `PCON24CD LIKE 'E%'`, `maxAllowableOffset=0.003` | Parliamentary Constituencies Order 2023 — [SI 2023/1230](https://www.legislation.gov.uk/uksi/2023/1230) (under Parliamentary Constituencies Act 1986) |
| 2 | Marine Conservation Zones (England) | 106 | Natural England / JNCC `Marine_Conservation_Zones_England` (`services.arcgis.com/JJzESW51TqeY9uat`), paginated (`maxRecordCount=3`), `maxAllowableOffset=0.002` | One named "*[Site]* Marine Conservation Zone Designation Order" per zone (s.116 Marine and Coastal Access Act 2009). Popup deep-links a [legislation.gov.uk title search](https://www.legislation.gov.uk/all?title=Wyre-Lune%20Marine%20Conservation%20Zone). |
| 3 | National Parks (England) | 10 | Natural England `National_Parks_England` (same org), `maxAllowableOffset=0.002` | Designation orders under the National Parks and Access to the Countryside Act 1949 |
| 4 | National Landscapes / AONBs (England) | 34 | Natural England `Areas_of_Outstanding_Natural_Beauty_England` (same org), `maxAllowableOffset=0.005` | Designation orders; procedure under Part IV of the Countryside and Rights of Way Act 2000 (older AONBs under NPACA 1949) |
| 5 | COVID-19 tiers, 2 Dec 2020 (England LADs) | 314 | ONS LAD (2020) boundaries, reused from the prior `covid-tiers/` fetch (4-dp) and joined to the tier table below | Health Protection (Coronavirus, Restrictions) (All Tiers) (England) Regulations 2020 — [SI 2020/1374, Schedule 4](https://www.legislation.gov.uk/uksi/2020/1374/schedule/4/made) |

Source service URL patterns (all `f=geojson&outSR=4326&geometryPrecision=4`):

```
# Constituencies
https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/Westminster_Parliamentary_Constituencies_July_2024_Boundaries_UK_BUC/FeatureServer/0/query?where=PCON24CD+LIKE+'E%'&outFields=PCON24CD,PCON24NM&maxAllowableOffset=0.003
# MCZ (paginated, resultRecordCount=3 because maxRecordCount=3)
https://services.arcgis.com/JJzESW51TqeY9uat/arcgis/rest/services/Marine_Conservation_Zones_England/FeatureServer/0/query?where=1=1&outFields=MCZ_NAME,MCZ_CODE&maxAllowableOffset=0.002
# National Parks
https://services.arcgis.com/JJzESW51TqeY9uat/arcgis/rest/services/National_Parks_England/FeatureServer/0/query?where=1=1&outFields=NAME,CODE,DESIG_DATE&maxAllowableOffset=0.002
# AONB / National Landscapes
https://services.arcgis.com/JJzESW51TqeY9uat/arcgis/rest/services/Areas_of_Outstanding_Natural_Beauty_England/FeatureServer/0/query?where=1=1&outFields=NAME,CODE,DESIG_DATE&maxAllowableOffset=0.005
```

## COVID-19 tier encoding (the load-bearing detail)

The tier of each Local Authority District (LAD) on **2 December 2020** is taken
**directly from Schedule 4 of SI 2020/1374 as made**
(<https://www.legislation.gov.uk/uksi/2020/1374/schedule/4/made>), transcribed
in full into `data/` build scripts:

- **Part 1 of Schedule 4 → Tier 2** ("High"): every upper-tier authority listed.
- **Part 2 of Schedule 4 → Tier 3** ("Very High"): every upper-tier authority listed.
- **Anything not listed → Tier 1** ("Medium"), per regulation 8.

Schedule 4 lists **upper-tier** authorities (counties, unitaries, London
boroughs, plus the City of London / Inner & Middle Temple). Counties were
mapped **down to their constituent districts** using the ONS
`LTLA20_UTLA20_EW_LU` lower-tier→upper-tier lookup (2020 vintage), so every
district within a Tier-2/Tier-3 county inherits the county's tier.

**Coverage / result** — all 65 Part-1 and 62 Part-2 authority names in the
schedule resolved to UTLA codes (0 unresolved; the four inverted-name forms
"Herefordshire, County of", "County Durham", "Kingston upon Hull, City of",
"Bristol, City of" were aliased explicitly). Joined to the 314 England LADs in
the boundary layer:

- **Tier 1: 3 LADs** — Cornwall, Isle of Wight, Isles of Scilly. (This matches
  the historical record: on 2 Dec 2020 these were the *only* Tier-1 areas in
  England.)
- **Tier 2: 192 LADs**
- **Tier 3: 119 LADs**

No tiers were invented. The encoding is a deterministic transcription of the
schedule plus a published ONS district↔county lookup; the three Tier-1 areas
acting as an independent anchor confirm the join is correct. The only
modelling choice is the (standard) propagation of a county's listed tier to its
districts, which is exactly how the regulations applied geographically.

## Template / provenance

Built from the `si-map/index.html` template: the `<base>`-href shim, the
adaptive `PROXIED` tile logic (`/api/osm-tile`, `/api/topo-tile` when served,
public hosts on `file://`), vendored Leaflet (`vendor/`), the intro+legend+
`L.control.layers` pattern. **No UK Parliament API data is used**, so there is
no Open Parliament Licence string; attribution credits ONS, Natural England /
JNCC, OpenStreetMap / OpenTopoMap, and legislation.gov.uk (all OGL v3.0 /
CC-BY-SA).

## Files

```
index.html                            the map (single page)
data.js                               all five layers inlined as window.* GeoJSON globals
data/constituencies.geojson           543 England Westminster constituencies (SI 2023/1230)
data/mcz.geojson                      106 Marine Conservation Zones
data/national_parks.geojson           10 National Parks
data/aonb.geojson                     34 National Landscapes / AONBs
data/covid_tiers_2020-12-02.geojson   314 England LADs with `tier` ∈ {1,2,3}
vendor/                               Leaflet (copied from ../si-map/vendor)
README.md                             this file
```
