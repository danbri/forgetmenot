# AI-APPG donations cross-reference — paper trail

Run date: 2026-05-24
Operator: Claude (claude-opus-4-7), forgetmenot repo, branch claude/system-prompt-skills-list-RGwlQ
Question: "Check for donations to any APPG leads whose group relates to AI, then go back to see who else shares that same donor."

## Source registers used

| Tier | Source | Skill | Coverage |
|---|---|---|---|
| 2 (scraped) | Register of All-Party Parliamentary Groups, edition 260413 | `parl appg` (cache at `third_party/data/appg/`) | Group title, purpose, officers, declared benefits to the group, secretariat |
| 1 | Register of Members' Financial Interests | `parl interests` | Personal benefits declared by each MP/peer |
| 3 | Electoral Commission donations register | `parl ec donations` | Statutory PPERA-reported donations to parties / candidates / MPs |

## APPG cache provenance

- `third_party/data/appg/summary.json`: edition 260413, fetched 2026-05-03T16:13:56Z, 2170/2198 officers auto-resolved to Members API ids (98.7%).
- Live re-fetch of `https://publications.parliament.uk/pa/cm/cmallparty/260413/artificial-intelligence.htm` on 2026-05-24 returns a Cloudflare interstitial — cached scrape is the operative copy.

## Target groups (AI-related)

Selection rule: title or purpose contains "artificial intelligence", "AI", "machine learning", "data and emerging tech", "blockchain" (blockchain included because of overlap with web3/AI compute markets — caveat in report).

| Group | Slug | Secretariat | AGM | Income/exp. approved |
|---|---|---|---|---|
| APPG on Artificial Intelligence | `artificial-intelligence` | Big Innovation Centre | 2026-01-26 | Yes |
| APPG on Blockchain Technologies | `blockchain-technologies` | British Blockchain Association | 2025-03-17 | No |
| APPG for Data and Emerging Technologies | `data-and-emerging-technologies` | Policy Connect | 2026-02-10 | No |

All three records have `benefits.financial = []` and `benefits.inKind = []` in the cached scrape. Possible explanations:
  (a) genuine — group has not yet been required to declare benefits in this reporting cycle (the income/expenditure approval row for blockchain + DET is "No", which suggests AGM happened but financial schedule not yet filed);
  (b) scraper missed the benefits table.
Cannot disambiguate while upstream HTML is behind Cloudflare. Treated as "no recorded group-level benefits in cache" with explicit caveat in final report.

## Officers under investigation (n=12)

| Member ID | Name | House | Party | APPG role |
|---|---|---|---|---|
| 5334 | Dr Allison Gardner | Commons (Stoke-on-Trent South) | Labour | AI — Chair & Registered Contact |
| 3396 | Lord Clement-Jones | Lords | Liberal Democrat | AI — Co-Chair |
| 1489 | Dawn Butler | Commons (Brent East) | Labour | AI — Vice Chair |
| 4989 | Lord Ranger of Northwood | Lords | Conservative | AI — Vice Chair |
| 5323 | Matt Bishop | Commons (Forest of Dean) | Labour | Blockchain — Chair & Registered Contact |
| 4702 | Lord McNicol of West Kilbride | Lords | Labour | Blockchain — Vice Chair |
| 4334 | Lord Goddard of Stockport | Lords | Liberal Democrat | Blockchain — Vice Chair |
| 4844 | Matt Vickers | Commons (Stockton West) | Conservative | Blockchain — Vice Chair |
| 4382 | Daniel Zeichner | Commons (Cambridge) | Labour | DET — Chair & Registered Contact |
| 5220 | Tristan Osborne | Commons (Chatham and Aylesford) | Labour | DET — Officer |
| 4294 | Lord Holmes of Richmond | Lords | Conservative | DET — Officer |
| 1827 | Baroness Uddin | Lords | Non-affiliated | DET — Officer |

## API calls (chronological)


### Members API (Lords interests)

For each of the 6 peers, called:
- `GET https://members-api.parliament.uk/api/Members/{id}/RegisteredInterests`

Counts of registered interests by Lords category:

| Member ID | Name | Cat 1 (paid roles) | Cat 2 (shares) | Cat 3 (property) | Cat 5 (visits) | Cat 6 (gifts) |
|---|---|---|---|---|---|---|
| 3396 | Lord Clement-Jones | 3 | – | – | – | – |
| 4989 | Lord Ranger of Northwood | 8 | – | 1 | 8 | – |
| 4702 | Lord McNicol of West Kilbride | 12 | 1 | – | – | 1 |
| 4334 | Lord Goddard of Stockport | 4 | 1 | – | – | 2 |
| 4294 | Lord Holmes of Richmond | 45 | 3 | – | – | – |
| 1827 | Baroness Uddin | 1 | 1 | – | 4 | 1 |

### Interests API (Commons RMFI)

For each of the 6 Commons MPs, called:
- `GET https://interests-api.parliament.uk/api/v1/Interests?MemberId={id}&take=200`

Totals: Gardner 2, Butler 7, Bishop 6, Vickers 2, Zeichner 2, Osborne 1. The interests-api covers Commons only — peers always return 0 from this endpoint; their data was sourced from the Members API endpoint above.

### Latest Commons RMFI snapshot bundle

- `GET https://interests-api.parliament.uk/api/v1/Registers?take=1` → registerId 799 (published 2026-05-18)
- `GET https://interests-api.parliament.uk/api/v1/Interests/csv?registerId=799` → ZIP of 12 per-category CSVs, used for full-text grep across Commons RMFI

### Electoral Commission donations

Base: `https://search.electoralcommission.org.uk/api/search/Donations`. Required boilerplate parameters (the wrapper in `lib/facilities/ec-donations.mjs` does not currently send these, so calls returned `Total: -1` until I went direct):

```
&et=pp&et=ppm&et=tp&et=perm&et=rd&et=ind
&date=Reported&prePoll=true&postPoll=true
&register=gb&register=ni&register=none
&isIrishSourceYes=true&isIrishSourceNo=true
&includeOutsideSection75=true
```

Note also: `donorName=` is silently ignored and returns the unfiltered corpus (~93k records). The working free-text field is `query=`. The EC wrapper needs fixing — filed as caveat below.

For each officer, ran `query={name}` (rows=500). Then filtered results client-side to those whose `RegulatedEntityName` actually matches the officer (because the EC search hits the whole record, not the recipient field).

Counts of EC donations where the officer is the named recipient:

| Officer | EC entries (as recipient) |
|---|---|
| Dawn Butler MP | 18 |
| Daniel Zeichner MP | 1 |
| Matt Vickers MP | 9 |
| Allison Gardner | 0 |
| Matt Bishop | 0 |
| Tristan Osborne | 0 (1 entry where Osborne is donor to Labour Party) |
| (all 6 peers) | 0 (donations to peers are exceptional; party-level donations were in scope but not attributed individually) |

### Pivot — donations TO our 12 officers, then OUT FROM each donor

For each non-trivial donor / payer / visit-funder identified across the previous steps, re-queried the EC donations API to find every other recipient. Pivot files in `tmp/ai-appg-report/raw/ec/pivot/`.

Donors with hits across multiple recipients (relevance to the shared-donor question):

| Donor | All recipients in EC register | AI-APPG officer cross-link |
|---|---|---|
| Anthony Watson (individual) | Labour Party £260k, Angela Eagle £97.5k, Owen Smith £67.5k, **Dawn Butler £46.7k**, Wes Streeting £35k, **Peter Kyle £16k**, Tom Watson £6k, Yvette Cooper £5k, Oliver Ryan £4.6k | Funds Dawn Butler (AI APPG Vice Chair) AND Peter Kyle (current DSIT Secretary of State, the Cabinet minister responsible for AI policy) |
| IX Wireless Limited | Conservative Party (many) + Northern Campaign Group £125k + Chris Green / Simon Fell / **Matt Vickers** | Funds Matt Vickers (Blockchain APPG Vice Chair); also funded multiple other Conservative MPs and the party |
| Heward(s) Mills Ltd | **Dawn Butler £2,925**, Diane Abbott £2,930 (×2), Bell Ribeiro-Addy £2,930 | Same donor, same date (May 2025), same value range → looks like a sponsored event covering 4 Labour MPs |
| GUBA Foundation | **Dawn Butler £2,631**, Diane Abbott £2,631, Bell Ribeiro-Addy £2,631, Abena Oppong-Asare £2,631 | Same date (Nov 2021), identical value → one sponsored event covering 4 Labour MPs |
| DLA Piper LLP | Labour Party £100k+ (over 2007–2022) | Lord Clement-Jones (AI APPG Co-Chair) is a paid consultant to DLA Piper — though no direct payment from DLA Piper to Clement-Jones is on the EC register (his retainer is a personal interest, declared in Lords RMFI Category 1) |
| Big Innovation Centre (Middle East) | Mr Damien Moore £6,500 + Mr Stephen Metcalfe MP £7,000 — both visits to Dubai's "AI Everything Conference" in April 2019, sponsored as the then-Chairs of APPG Blockchain (Moore) and APPG AI (Metcalfe). The London arm of Big Innovation Centre is the **current** secretariat for the APPG on Artificial Intelligence. | Track record of arranging Middle East AI conference travel for APPG-AI/Blockchain leadership. Predates our current 12 officers; included as historical context on the secretariat's pattern of activity. |

### Lords RMFI — visits funded by the same entity

Free-text scan of Lords Cat 5 (Overseas visits) entries for the 6 peers:

- **UKUS Crypto Alliance** funded all three of: Lord Ranger's Oct-Nov 2025 Washington DC trip, Lord Ranger's Mar 2026 Washington DC trip, **and** Baroness Uddin's Oct-Nov 2025 Washington DC/New York trip. Both Oct-Nov trips overlap in time, both for "meetings about crypto and digital assets". One AI-APPG Vice Chair (Ranger, also blockchain-active) and one DET-APPG Officer (Uddin) on US trips paid for by the same small crypto trade body.
- Commons RMFI cross-check (grep over Category 4 CSV from register 799): no Commons MP has declared a visit paid for by UKUS Crypto Alliance. Two false-positive matches for "AUKUS" (the security pact, Mr Mark Francois) excluded.

## Caveats & limitations to flag in the report

1. **APPG benefits in cache are empty for all three target groups.** Could be either genuine (recent AGMs not yet filed) or scraper miss. Live HTML check blocked by Cloudflare interstitial on 2026-05-24. Report this honestly; do not infer absence of benefits.
2. **APPG cache is 21 days old** (fetched 2026-05-03, edition 260413). User invited use; we used it.
3. **Lords RMFI** is exposed via Members API but the structure differs from the Commons Interests API and there is no full-text search — searches across all 800 peers would need bulk download (not done). Anything found is per-person, not cross-Lords.
4. **EC `recipient`/`donorName` query parameters silently fail** in the wrapper — only `query=` works. Wrapper bug to file as follow-up.
5. **EC free-text `query=` hits any field**, not just the recipient. We filtered client-side; same-surname false positives (e.g. multiple "Anthony Watson"s in the EC register) were not de-duplicated by address — assumed single identity where context (donor type = Individual + recipient party affiliation = Labour) was consistent.
6. **The "shared donor" inference is hard upper-bound.** Two persons with the same name in different contexts could be different humans; the EC register's free-text donor names are the canonical join key but are not always unique.
7. **Peers' Cat 1 paid roles** are not donations in the political sense — they are paid employment / consultancies. Treated as a *commercial connection* in the report rather than a "donor" link, and labelled as such.
