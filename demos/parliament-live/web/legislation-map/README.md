# The UK's secondary-legislation geographies (devolved)

One interactive Leaflet map (`index.html`) of the **whole UK** with a layer
control toggling five geographies that are each **defined by secondary
legislation** (statutory instruments made under Acts of Parliament). Open
`/legislation-map` on the fpkg server, or `index.html` directly via `file://`.

These designations are mostly **devolved**, so the governing instrument
**differs by nation** (England, Scotland, Wales, Northern Ireland). Layer
labels, the legend and every per-feature popup name the instrument that
applies *in that nation*. **Northern Ireland is genuinely included** wherever
the designation exists there — and where it does *not* exist (national parks),
that absence is stated explicitly rather than silently omitted.

This single map extends the earlier England-only version in place (same
5-layer structure, same template conventions).

## Layers

All geometry is **server-side generalised** at fetch time
(`maxAllowableOffset` ≈ 0.003–0.008 in SR 4326, `geometryPrecision=4`) so it is
small enough to inline — it is for display only and is **not** authoritative
for legal extent.

### 1. Westminster constituencies (UK) — 650, **NI = 18**

Same ONS service as before, with the England-only filter removed.

- Source: `Westminster_Parliamentary_Constituencies_July_2024_Boundaries_UK_BUC`
  on `services1.arcgis.com/ESMARspQHYMw9BZ9`, `where=1=1`, `maxAllowableOffset=0.003`.
- Counts by nation: **England 543, Scotland 57, Wales 32, Northern Ireland 18**.
- Instrument (all nations — **reserved**, so one UK-wide SI): Parliamentary
  Constituencies Order 2023 — [SI 2023/1230](https://www.legislation.gov.uk/uksi/2023/1230)
  (under the Parliamentary Constituencies Act 1986).

```
https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/Westminster_Parliamentary_Constituencies_July_2024_Boundaries_UK_BUC/FeatureServer/0/query?where=1=1&outFields=PCON24CD,PCON24NM&maxAllowableOffset=0.003
```

### 2. Marine protected areas (UK) — 137, **NI = 5**

Combined four nations' inshore sources (the single UK-wide JNCC service is
offshore-only, so the nations' own inshore datasets were combined instead).

| Nation | n | Source service | Instrument |
|---|---|---|---|
| England (MCZ) | 106 | `Marine_Conservation_Zones_England` on `services.arcgis.com/JJzESW51TqeY9uat` (paginated, `maxRecordCount=3`) | Marine and Coastal Access Act 2009, s.116 (per-zone Designation Order) |
| Scotland (Nature Conservation MPA) | 25 (territorial, `LEAD=SNH`) | `Marine_Protected_Areas` on `services1.arcgis.com/LM9GyVFsughzHdbO` | Marine (Scotland) Act 2010 ([asp 2010/5](https://www.legislation.gov.uk/asp/2010/5/contents)) |
| Wales (MCZ) | 1 (Skomer) | `Marine_Conservation_Zones` on NRW org `services.arcgis.com/hQoYDJEEJMaPw8Sy` | Marine and Coastal Access Act 2009 (Welsh Ministers) |
| **Northern Ireland (MCZ)** | **5** | `All_MPAs_NI_Marine_Plan_Extent` on DAERA/OSNI org `services-eu1.arcgis.com/kswen6BYexuc1SUk`, `MPA_Type='MCZ' AND Site_Code LIKE 'UKMCZNI%'` | **Marine Act (Northern Ireland) 2013** ([nia 2013/10](https://www.legislation.gov.uk/nia/2013/10/contents)) |

The 13 JNCC-lead UK-offshore MPAs in the Scottish service are excluded (they
are not Scottish territorial designations). NI MCZs: Strangford Lough,
Carlingford Lough, Rathlin, Outer Belfast Lough, Waterfoot.

### 3. National Parks (GB) — 15, **NI = 0 (stated, not omitted)**

| Nation | n | Source service | Instrument |
|---|---|---|---|
| England | 10 | `National_Parks_England` on `services.arcgis.com/JJzESW51TqeY9uat` | NPACA 1949 (designation orders) |
| Wales | 3 | `National_Parks` on NRW org `services.arcgis.com/hQoYDJEEJMaPw8Sy` | NPACA 1949 |
| Scotland | 2 | `Boundaries_National_Parks/FeatureServer/5` on NatureScot org `services-eu1.arcgis.com/cECIr59LclpO818r` | National Parks (Scotland) Act 2000 ([asp 2000/10](https://www.legislation.gov.uk/asp/2000/10/contents)) |
| **Northern Ireland** | **0** | — | **NI has never designated a national park.** This is stated in the legend and the layer label; NI is genuinely absent from this layer only. |

### 4. AONBs / National Scenic Areas (UK) — 87, **NI = 8**

| Nation | n | Kind | Source service | Instrument |
|---|---|---|---|---|
| England | 34 | AONB | `Areas_of_Outstanding_Natural_Beauty_England` on `services.arcgis.com/JJzESW51TqeY9uat` | CROW Act 2000 Pt IV (older: NPACA 1949) |
| Wales | 5 | AONB | `Area_of_Outstanding_Natural_Beauty` on NRW org `services.arcgis.com/hQoYDJEEJMaPw8Sy` | CROW Act 2000 Pt IV |
| **Northern Ireland** | **8** | AONB | `AONB` on OSNI/SpatialNI org `services-eu1.arcgis.com/d5l49Upuvx1Y6xxs` | **Nature Conservation and Amenity Lands (NI) Order 1985** ([nisi 1985/170](https://www.legislation.gov.uk/nisi/1985/170/contents)) |
| Scotland | 40 | National Scenic Area (analogue) | `National_Scenic_Areas` on `services3.arcgis.com/zqVHg5bAKuLwkW3f` (ArcGIS republish of NatureScot data) | Planning etc. (Scotland) Act 2006 ([asp 2006/17](https://www.legislation.gov.uk/asp/2006/17/contents)) |

The Wye Valley "(England)" row from the NRW service is dropped (the English
side is covered by the England layer); the "(Wales)" side is kept.
NI AONBs: Mourne, Strangford and Lecale, Ring of Gullion, Causeway Coast,
Antrim Coast and Glens, Lagan Valley, Binevenagh, Sperrin.

### 5. COVID-19 restrictions, 2 Dec 2020 (devolved — England tiers vs separate regimes) — 348 features

The starkest divergence: England's tier schedule did **not** apply elsewhere;
each nation ran its own legal regime.

| Nation | n | Encoding | Instrument |
|---|---|---|---|
| England | 314 LADs | Tier 1/2/3 choropleth (reused from the prior England fetch) | [SI 2020/1374, Sch. 4](https://www.legislation.gov.uk/uksi/2020/1374/schedule/4/made) |
| Scotland | 32 council areas | **Strategic Framework protection levels 1–4** by council, transcribed from the gov.scot allocation review in force on 2 Dec 2020 | [SSI 2020/344](https://www.legislation.gov.uk/ssi/2020/344/contents) |
| Wales | 1 (national fill) | Neutral national-level fill + popup; **no per-area data invented** | [WSI 2020/1149](https://www.legislation.gov.uk/wsi/2020/1149/contents) |
| Northern Ireland | 1 (national fill) | Neutral national-level fill + popup; **no per-area data invented** | NI Health Protection regs 2020 |

**Scotland levels on 2 Dec 2020** (gov.scot review of 1 Dec 2020, unchanged from
24 Nov; the 11 Level-4 areas moved on 20 Nov):

- **Level 1 (5):** Highland, Moray, Orkney Islands, Shetland Islands, Na h-Eileanan Siar
- **Level 2 (6):** Scottish Borders, Dumfries and Galloway, Aberdeen City, Aberdeenshire, Argyll and Bute, East Lothian
- **Level 3 (10):** North Ayrshire, Fife, Clackmannanshire, Falkirk, Inverclyde, Midlothian, City of Edinburgh, Angus, Dundee City, Perth and Kinross
- **Level 4 (11):** East Ayrshire, South Ayrshire, Stirling, East Renfrewshire, Renfrewshire, West Dunbartonshire, East Dunbartonshire, Glasgow City, South Lanarkshire, North Lanarkshire, West Lothian

(5+6+10+11 = 32; all 32 councils resolved, 0 unresolved.) Scottish council
geometry: `LAD_DEC_2020_UK_BGC` (`S%` codes) on `services1.arcgis.com/ESMARspQHYMw9BZ9`.
Wales/NI national outlines: `Countries_December_2020_UK_BGC_2022` (same org).

**How COVID was handled for the devolved nations (honesty):** Scotland's
levels are a deterministic transcription of a published gov.scot allocation —
not fabricated per-area data. Wales and NI ran genuinely non-geographic
regimes on that date (nationwide rules, not a council-area tier/level map), so
they are shown as a single neutral national fill whose popup links the
relevant nation's own regulations, rather than inventing per-area levels.

## Template / provenance

Built from the established template: the `<base>`-href shim, the adaptive
`PROXIED` tile logic (`/api/osm-tile`, `/api/topo-tile` when served, public
hosts on `file://`), vendored Leaflet (`vendor/`), the intro + legend +
`L.control.layers` pattern. **No UK Parliament API data is used**, so there is
no Open Parliament Licence string; attribution credits ONS, Natural England /
JNCC, NatureScot, Natural Resources Wales / DataMapWales, DAERA / OSNI,
OpenStreetMap / OpenTopoMap, and legislation.gov.uk (OGL v3.0 / CC-BY-SA as
appropriate).

## Files

```
index.html                            the map (single page)
data.js                               all five layers inlined as window.* GeoJSON globals
data/constituencies.geojson           650 UK Westminster constituencies (E543/S57/W32/N18), SI 2023/1230
data/mpa.geojson                      137 UK marine protected areas (E106/S25/W1/N5)
data/national_parks.geojson           15 GB national parks (E10/W3/S2; NI = none)
data/aonb.geojson                     87 UK AONBs + Scottish NSAs (E34/W5/N8 AONB + S40 NSA)
data/covid_tiers_2020-12-02.geojson   348 features: England LAD tiers + Scotland council levels + Wales/NI national fills
vendor/                               Leaflet
README.md                             this file
```
