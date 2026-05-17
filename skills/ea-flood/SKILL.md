---
name: ea-flood
description: "Query the Environment Agency Real-Time Flood Monitoring API — active flood warnings and alerts, ~5,000 monitoring stations measuring river levels, flows, rainfall, tide and groundwater, and the historic archive. Free, no auth. Use when the question is about a current flood warning in a particular area (constituency / council / county), a river-level reading, rainfall recordings, or flood-area polygons. Coverage: England only (Scotland uses SEPA, Wales uses NRW, NI uses DfI Rivers). Pairs with mapit / ons-geo to ask 'is this constituency at flood risk right now'."
license: Open Government Licence v3.0 (Crown copyright; Environment Agency)
metadata:
  facility: ea-flood
  cli-alias: flood
  base-url: https://environment.data.gov.uk/flood-monitoring
  provenance:
    tier: 3
    operator: Environment Agency (DEFRA)
    service: environment.data.gov.uk/flood-monitoring
    upstream-data: "EA's live operational telemetry from monitoring stations + flood-warning service; historic readings archive back ~2015"
    citation-short: "via Environment Agency flood-monitoring API"
    citation-formal: "Environment Agency Real-Time Flood Monitoring API, retrieved {date}, OGL v3.0"
    confidence: authoritative
    confidence-notes: "Live operational data. Coverage limited to England — for Scotland use SEPA, Wales NRW, NI DfI Rivers (none wrapped yet). Sensor outages happen; check the `status` field on each station."
---

# Environment Agency flood monitoring

Base URL: `https://environment.data.gov.uk/flood-monitoring`
Documented at `https://environment.data.gov.uk/flood-monitoring/doc/reference`.

## What's wrapped

| Endpoint | Use |
|---|---|
| `/id/floods` | Currently-active flood warnings + alerts (severity 1-4). |
| `/id/floodAreas` | All ~4,400 defined warning / alert polygons. |
| `/id/floodAreas/<id>` | One area. |
| `/id/stations` | All monitoring stations. Filter by `parameter` (level / flow / rainfall / wind / temperature), location, river. |
| `/id/stations/<ref>` | One station. |
| `/id/stations/<ref>/readings` | Latest readings from one station. |
| `/data/readings` | Cross-station readings (big — filter aggressively). |
| `/archive` | Historic-readings dataset listing. |

## Severity levels for floods

| Level | Meaning |
|---|---|
| 1 | Severe Flood Warning — danger to life |
| 2 | Flood Warning — flooding is expected |
| 3 | Flood Alert — flooding is possible |
| 4 | Warning no Longer in Force — removed within last 24 h |

## CLI

```sh
parl flood warnings --min-severity 2 --take 50
parl flood warnings --county Somerset
parl flood stations --parameter level --river-name "River Severn"
parl flood stations --lat 51.5 --lon -0.1 --dist 10   # London-area
parl flood station-readings 1029TH --latest
parl flood station-readings 1029TH --since 2026-05-15T00:00:00Z
```

## Joins to Parliament

- Use [`mapit`](../mysoc-mapit/SKILL.md) to resolve a constituency
  to its bounding box / centroid; pass `--lat --lon --dist` to
  `flood warnings` / `flood stations` to filter by area.
- Flooding debates surface regularly in `hansard`; this skill is
  the live-operational backing for those debates.
- The Environment Agency itself answers PQs and appears before
  the EFRA select committee — pair with `committees` /
  `written-questions-and-statements`.

## Provenance to cite

**Tier 3 — third-party (Environment Agency), authoritative.**

- Inline cite: **"(via Environment Agency flood-monitoring API)"** —
  once per paragraph.
- Cite the station reference + parameter + timestamp for any
  specific reading (e.g. "River Lee at Walthamstow Low Hall,
  level 0.85m at 2026-05-17T18:00:00Z").
- Live values change every 15 minutes; date your statement.
- England only — for the rest of GB+NI cite that you don't have
  comparable data, rather than implying none exists.
- See [`../../docs/provenance.md`](../../docs/provenance.md).
