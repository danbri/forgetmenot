---
name: mysoc-fms
description: "Query FixMyStreet (mySociety) — the per-council issue-reporting service used for potholes, fly-tipping, broken street furniture, and other street-level issues across UK local authorities. Surface is RSS only (no public JSON API on fixmystreet.com — the /reports.json and /api paths return 404; the open-source FixMyStreet platform's API spec is only exposed on cobrand instances that opt in). Wraps the all-reports feed, per-area feeds, and per-postcode / lat-lon proximity feeds. Use when the question is about street-level issues reported in a constituency, a council's response patterns, or as constituency-level civic-engagement signal."
license: Creative Commons Attribution-ShareAlike 3.0 (mySociety)
metadata:
  facility: mysoc-fms
  cli-alias: fms
  base-url: https://www.fixmystreet.com
  provenance:
    tier: 3
    operator: mySociety
    service: fixmystreet.com
    upstream-data: "User-submitted reports of street-level issues, routed by mySociety to ~400 UK council issue-tracking systems"
    citation-short: "via FixMyStreet (mySociety)"
    citation-formal: "FixMyStreet, mySociety Ltd, retrieved {date}, CC BY-SA 3.0"
    confidence: derived
    confidence-notes: "User-generated content. Reports are individual citizen statements, not authoritative for whether the issue exists or has been resolved — the council's own record is the source of truth for resolution status."
---

# FixMyStreet (mySociety)

Base URL: `https://www.fixmystreet.com`. RSS only — the JSON API spec
exists in the FixMyStreet open-source codebase but `fixmystreet.com`
itself doesn't expose it.

## CLI

```sh
parl fms feed                                    # all reports RSS
parl fms feed-area London                        # one council/area
parl fms feed-around --postcode SW1P3JA --distance 1
parl fms feed-around --lat 51.4968 --lon -0.1262 --distance 1 --state open
parl fms url 123456                              # permanent URL for a report
```

## Joins to Parliament

- Use `mapit postcode <pc>` or `mapit point` to pin a coord, then
  `fms feed-around` for street-level issues in the area — a useful
  signal of constituency-level civic engagement.
- Combined with `members` constituency lookup, can answer
  "what street issues are being reported in MP X's seat".

## Provenance to cite

**Tier 3 — third-party (mySociety), user-generated.**

- Inline cite: **"(via FixMyStreet, mySociety)"** — once per paragraph.
- Don't present individual user reports as authoritative for
  whether an issue exists; cite as "a FixMyStreet report …".
- See [`../../docs/provenance.md`](../../docs/provenance.md).
