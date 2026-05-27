# mySociety appg-membership probe — 2026-05-27

## Verdict

| Question | Answer |
|---|---|
| **Complete?** | For *officers, secretariat, benefits, contact details, AGM*: complete and copies the official register more accurately than our own scraper. For *membership lists* (the wider membership beyond officers): partial — agent-scraped from APPG websites where found; many APPGs have empty `members_list` because the agent couldn't locate an authoritative members page. |
| **Maintained?** | Yes, actively. Last commit 2026-04-27 (and an ongoing-today commit). The 260413 edition (April 2026) is ingested. Cadence matches the Parliament Register publishing rhythm (roughly six-weekly). |
| **Open source?** | Yes — **MIT license** on the scraper code (and the committed data). Underlying register source remains under the Open Parliament Licence v3.0; attribution to `publications.parliament.uk` is required when re-using. |
| **Open data?** | Yes — one JSON file per APPG under `data/appgs/` in the GitHub repo. No CSV / Parquet release assets; users derive those if needed. |

## Repo
- <https://github.com/mysociety/appg-membership>
- Each APPG → one JSON file at `data/appgs/<slug>.json`
- Equivalents at `data/apg_ni/`, `data/cpg_scotland/`, `data/cpg_senedd_en/`, `data/cpg_senedd_cy/`
- Joins to Parliament via `mnis_id` (and `twfy_id` for TheyWorkForYou's person URI)

## Comparison vs our `parl appg crawl` output (edition 260413)

Random-30 sample of APPG slugs:

| | Ours | mySociety |
|---|---|---|
| APPGs with at least one benefit declared | 3 | 11 |
| APPGs where the other surface found benefits we missed | 0 | 8 |
| APPGs where we found benefits the other missed | — | 0 |

**Conclusion**: our scraper misses roughly **two-thirds of declared benefits** that mySociety captures. The earlier AI-APPG report flagged this as either "genuine empty" or "scraper miss"; mySociety's data confirms it was a scraper miss. The three target groups in that earlier report actually had:

- APPG on AI — Big Innovation Centre — £49,501-£51,000 (we showed nothing)
- APPG on Blockchain Technologies — British Blockchain Association — £19,501-£21,000 (we showed nothing)
- APPG for Data and Emerging Technologies — Policy Connect, paid by **ACCA, Open Data Institute, Zurich** — £37,501-£39,000 (we showed nothing)

That third record is the most important — mySociety captures Policy Connect's *upstream funders* (the corporates / professional bodies that fund the secretariat) — visible in the register but flattened out of our scraper.

## Bug location

`lib/facilities/appg.mjs` or its associated scraper. The benefits panel parsing returns empty `{financial: [], inKind: []}` for almost every group. Needs a fix — probably the panel selector or the HTML markup changed.

## Suggested follow-ups

1. **Fix `appg` scraper** to populate `benefits.financial` and `benefits.inKind` correctly. Use mySociety's `data/appgs/<slug>.json` as a per-group oracle test.
2. **Re-run the AI-APPG report** with corrected benefit data; in particular re-examine the DET APPG's ACCA / Open Data Institute / Zurich upstream funders against the 12 officers' interests.
3. **Re-import mySociety data into the `transparency-graph`** built today: it would expand the entity-resolution sets significantly (more benefit-source entities → more overlap opportunities).
4. **Add mySociety as a tier-3 (third-party) skill** in `skills/mysoc-appg/` — they already have `mysoc-fms`, `mysoc-mapit`, `mysoc-twfy`; this would slot in alongside.
