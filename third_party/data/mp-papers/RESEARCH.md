# Locating UK MPs' personal papers & writings (1834→) as first-hand bill-history sources

**Scope.** Post-1834 MPs (the 1834 Palace of Westminster fire destroyed
earlier Commons records; personal papers reliably survive from ~1834 on).
An MP who sponsored or fought a bill very often wrote about it in diaries,
letters, memoirs, or was the subject of a biography. This document nails
the **method, the working sources, a grounded sample, and a scalable
pipeline** — it does *not* attempt all ~13,000 post-1834 MPs.

**Honesty note.** Every holding below is grounded in a real probe (curl /
WebFetch / WebSearch) run 2026-06-18 from this environment. Archive
catalogues bot-gate aggressively; what is reachable vs blocked is reported
honestly. Items marked *(general knowledge — verify)* are not yet
confirmed against a primary record.

---

## 1. Discovery tools — what actually works

Probed 2026-06-18. "Reachable" = returned usable data from *this*
environment (cloud egress). Many catalogues serve a Cloudflare/Imperva
challenge (HTTP 202 / 403 "Restricted") to datacentre IPs but work fine
from a browser — flagged as **bot-gated**.

| Tool | Endpoint | Type | Status from here | Verdict |
|---|---|---|---|---|
| **TNA Discovery — record details** | `https://discovery.nationalarchives.gov.uk/API/records/v1/details/{C-id}` | JSON API, no auth, OGL | **200 — works** (full ISAD(G) JSON: `scopeContent`, `heldBy`, `citableReference`, dates) | Use to expand a known catalogue record id |
| **TNA Discovery — search** | `/API/search/records?sps.searchQuery=…` and `/API/search/v1/records?searchQuery=…` | JSON API | **403 "Restricted"** to datacentre IP (both `sps.` and v1 shapes) | **bot-gated**; the *discovery* step (search by person) is blocked here — works from a browser / residential IP |
| **TNA Discovery — NRA person record** | `/details/c/{F-id}` (HTML) ; `/API/records/v1/details/{F-id}` | HTML / JSON | HTML **202** (challenge); API **204** (NRA person index not served via the open details API) | NRA person pages are **citable URLs** but not openly machine-readable here |
| **Archives Hub (Jisc)** | `archiveshub.jisc.ac.uk/search/archives/{uuid}` ; `/oai-pmh?verb=…` | HTML + **OAI-PMH** feed | HTML **403**, OAI **403** to datacentre IP | **bot-gated** here; clean stable per-collection permalinks surface via web search and resolve in a browser. OAI-PMH feed is the documented bulk route |
| **Library Hub Discover (Jisc)** | `discover.libraryhub.jisc.ac.uk/search?q=…` | HTML | **403** (and `sru.libraryhub.jisc.ac.uk` did not resolve) | **bot-gated**; published memoirs/biographies are here but not reachable from this egress |
| **Oxford DNB (ODNB)** | `oxforddnb.com` | HTML, **paywalled** | not fetched (subscription) | Authoritative "Archives" + "Sources" + "Wealth at death" sections per entry; **paywalled** — institutional login needed |
| **History of Parliament** | `www.historyofparliamentonline.org/...` and `membersafter1832.historyofparliamentonline.org/members/{id}` | HTML | root **401** to bots; **membersafter1832** page fetched via WebFetch but is **thin** (dates/constituencies/office only — no papers/bibliography section in the 1832+ tranche yet) | The published *printed* HoP volumes carry rich "Ref Volumes / bibliography"; the **1832-1868 section is still being written** and the online member stub is currently sparse |
| **Wikidata** | `query.wikidata.org/sparql` ; `wikidata.org/w/api.php` | SPARQL + JSON API, CC0 | **200 — works** | **The scalable join.** See §3 |
| **British Library A&M** | `searcharchives.bl.uk/catalog/{id}` | HTML | root **200** | Stable permalinks (e.g. Gladstone Add MS 44086-44835); surfaced via web search |
| **Bodleian Archives & MSS** | `archives.bodleian.ox.ac.uk/repositories/2/resources/{id}` | HTML (ArchivesSpace) | reachable via search | Clean ArchivesSpace permalinks (e.g. Disraeli Dep. Hughenden) |
| **NLW Wales / NLS Scotland / NLI Ireland** | various | HTML | NLS root **200** | Wikidata P485 frequently points here for Welsh/Scots/Irish MPs |
| **NLA / Trove (Australia)** | `api.trove.nla.gov.au/v3/…` ; `nla.gov.au/nla.obj-…/findingaid` | JSON API (**key required**) + HTML finding aids | Trove API **401** (needs free key) | **AJCP** (Australian Joint Copying Project) microfilmed many UK political papers — e.g. Gladstone — giving a second, often-digitised copy. Colonial/emigrant MPs especially |

**Single best discovery tool: Wikidata SPARQL.** It is the only one that
(a) is reachable from automation here, (b) joins by stable identifier
rather than free-text name, and (c) carries *both* the holding repository
(P485 "archives at") *and* a direct cross-walk to the National Register of
Archives (**P3029 = "NRA person/family/corporate identifier"**, the TNA
`/details/c/{F-id}` page). It is the spine; the repository catalogues
(BL, Bodleian, Archives Hub, NLW) are the leaves you resolve to.

---

## 2. Demonstrated sample (bill-associated post-1834 MPs)

All rows grounded in probes 2026-06-18. Repository/reference confirmed via
the cited record URL unless marked *(general knowledge — verify)*.

| MP (QID) | Bill connection | Personal papers — repository & reference | Memoir / biography | Source URL probed |
|---|---|---|---|---|
| **W. E. Gladstone** (Q160852) | Numberless — e.g. Irish Church Act 1869, Reform Act 1884, Home Rule Bills 1886/1893 | **British Library**, *Gladstone Papers*, **Add MS 44086–44835** (~750 vols); family papers + ~50k political docs at **Glynne-Gladstone Archive, Gladstone's Library, Hawarden**. NRA person id **F256969**. | Morley, *Life of Gladstone* (1903); his own diaries published (Foot & Matthew, 14 vols) | discovery.../details/c/F256969 ; archiveshub.../archives/4247db76-… (Glynne-Gladstone) ; searcharchives.bl.uk |
| **Benjamin Disraeli** (Q82006) | Reform Act 1867; opposed Corn Law repeal 1846 | **Bodleian Library**, *Hughenden Papers*, **Dep. Hughenden 1–382** (>50k items; deposited by National Trust 1978); copies **MSS. Eng. lett. d. 340–343** | Monypenny & Buckle, *Life of Disraeli* (6 vols); own novels (*Coningsby*, *Sybil*) are political texts | archives.bodleian.ox.ac.uk/repositories/2/resources/2571 |
| **Charles Bradlaugh** (Q387458) | Oaths Act 1888 (the Bradlaugh affirmation saga); Affirmation Bill | **Bishopsgate Institute, London** — *Charles Bradlaugh Archive* (personal & political correspondence 1853–1891, drafts/articles 1850–1891). NRA id **F55103**. TNA Discovery record permalink exists. | **Autobiography** *A Page of His Life* (1873); biography by daughter H. B. Bonner & J. M. Robertson (full text on Project Gutenberg) | bishopsgate.org.uk/collections/charles-bradlaugh-archive ; discovery.../details/r/05d83b45-… ; gutenberg.org/files/45131 |
| **Samuel Plimsoll** (Q333611) | **Merchant Shipping Act 1876** (the "Plimsoll line"); *Our Seamen* (1873) drove it | NRA person id **F34780** (resolves to the NRA repository list — page bot-gated here). *Our Seamen* pamphlet catalogued at TNA Discovery. *(repository list — verify via NRA page in a browser)* | *Our Seamen: An Appeal* (1873) is his own polemic; later biographies | wikidata.org/wiki/Q333611 ; discovery.../details/r/C1865302 (Our Seamen) |
| **Sir Robert Peel, 2nd Bt** (Q181875) | Catholic Relief Act 1829; **Repeal of the Corn Laws 1846**; Metropolitan Police Act 1829 | **British Library**, *Peel Papers*, **Add MS 40181–40617** *(general knowledge — verify)*. Wikidata currently has **no P485** for Peel — a coverage gap to backfill. | Own *Memoirs* (posth. 1856–57); Gash, *Sir Robert Peel* | wikidata Q181875 (P485 absent) |
| **Henry Campbell-Bannerman** (Q106618) | PM 1905–08; Trade Disputes Act 1906 era | Wikidata P485 → **National Library of Wales** *(import value — verify; his main papers are BL Add MS 41206–41252, general knowledge)*. NRA id **F257613**. | Spender, *Life of … Campbell-Bannerman* (1923) | wikidata Q106618 |
| **W. B. Yeats** (Q-) / colonial cases | — (shows the colonial/diaspora reach) | Wikidata P485 → **British Library** + AJCP/Trove copies for Australia-linked figures | — | sample SPARQL (see §3) |

**Data-quality flags found in the sample (do not trust blindly):**
- Wikidata P485 for **Disraeli** and **Campbell-Bannerman** both read
  "National Library of Wales" — almost certainly a **bad bulk import**
  (Disraeli's papers are demonstrably at the **Bodleian**). P485 is
  **sparse and sometimes wrong**; treat it as a *lead*, not an authority.
- **Peel** (a top-tier bill protagonist) has **no P485 at all** — so a
  Wikidata-only pass misses him. The fallback is his **NRA person id**
  (P3029) and/or a name+dates search of BL/Discovery.
- ⇒ **P3029 (NRA id) is the more reliable join than P485**, because it
  points into the curated National Register of Archives rather than a
  free-text repository label.

---

## 3. Feasibility at scale — verdict: **semi-queryable** (Wikidata join + per-repo resolve)

**Is MP→papers a clean queryable join?** *Partly.* Three tiers:

1. **Queryable now (automation-friendly).** Wikidata SPARQL gives a
   one-shot join from "is a UK MP" → holding repository (P485) and → NRA
   person id (P3029). Coverage measured live 2026-06-18:
   - **1,673** people with a UK-constituency MP statement *and* a P485
     "archives at" value.
   - The reliable MP predicate is `?p wdt:P39 ?pos . ?pos wdt:P279
     wd:Q16707842` ("Member of Parliament of the UK"); the constituency
     qualifier `?st pq:P768 ?dist` is broader but **leaks non-UK
     parliaments** (Québec, France) and must be filtered.
   This covers the famous bill protagonists well but is a **minority** of
   the ~13k post-1834 MPs — it is biased toward PMs, Cabinet ministers
   and the already-notable.

2. **Semi-manual (AI-assisted resolve).** For MPs with an **NRA id but no
   P485**, or a name only: the NRA person page
   (`discovery.nationalarchives.gov.uk/details/c/{F-id}`) lists every
   repository holding their papers — but it is **bot-gated** from cloud
   IPs (202/403). Resolving it needs a browser-context fetcher
   (chrome-devtools MCP / residential proxy) or a one-off human pass.
   ODNB's "Archives" section is the richest single source but is
   **paywalled**.

3. **Manual / synthesis.** Linking a *specific bill* to a *specific
   diary entry or letter* is **not** a structured join anywhere — it is an
   AI/historian task over the collection's scope notes and full-text. The
   structured layer gets you "Plimsoll's papers are at X"; "Plimsoll wrote
   *this* about the Merchant Shipping Bill" requires reading the finding
   aid / digitised item.

**Join key recommendation.** Use the repo's existing identity spine:
- Primary entity key: **Wikidata QID** (already bridged to the Parliament
  `members` id via `skills/identity-graph` — `parl:memberId` literal).
- Papers-location keys carried by Wikidata: **P485** (repository QID →
  resolve to BL/Bodleian/Archives Hub/NLW catalogue) and **P3029** (NRA
  person id → TNA Discovery `/details/c/{F-id}`).
- For published memoirs/biographies: **VIAF/worldcat** via P214, or a
  Library Hub Discover lookup by author (when reachable).

The post-1834 MPs whose papers are *not* in Wikidata fall back to:
name + birth/death year against the NRA (browser-context) and BL/Bodleian
catalogues — a long tail best handled with an AI agent per name, not a
bulk join.

---

## 4. Proposed pipeline (MP list → papers/writings)

```
skills/members  ──┐
                  │  (Parliament member id, name, dates, constituency, party)
                  ▼
[A] Filter to post-1834 MPs (membership end ≥ 1834, or first sat ≥ 1834)
                  │
                  ▼
skills/identity-graph  ──►  member id ⇄ Wikidata QID      (parl:memberId join)
                  │          (already maintained in repo)
                  ▼
[B] Wikidata SPARQL batch (skills/wikidata):
      for each QID, fetch:
        P485  (archives at  → repository QID/label)
        P3029 (NRA person id → discovery.../details/c/{F-id})
        P1343 (described by source → ODNB/DNB)
        P214/P244 (VIAF/LCCN → worldcat/Library Hub for memoirs)
      Tier-1 hits land in:  papers.jsonl  (member id, QID, repo, NRA id, refs)
                  │
                  ├─ HAS NRA id / repo ──►  RESOLVE LEAF:
                  │     - repo = British Library  → searcharchives.bl.uk permalink
                  │     - repo = Bodleian         → archives.bodleian ArchivesSpace
                  │     - repo = NLW/NLS/NLI       → national-library catalogue
                  │     - else / NRA id only      → TNA Discovery /details/c/{F-id}
                  │       (browser-context fetch — chrome-devtools MCP — because
                  │        the open API/HTML is bot-gated from cloud egress)
                  │
                  └─ NO Wikidata papers data ──►  FALLBACK (long tail):
                        AI agent per MP: name+dates query against
                        NRA (browser) + BL + Archives Hub OAI/permalink +
                        Library Hub (memoirs) + History of Parliament volume
                        → judgment_needed.jsonl for ambiguous/none
                  │
                  ▼
[C] BILL LINK (synthesis, not a join):
      - skills/bills + skills/skill-bill (History of Parliament Trust ref)
        give the MP↔bill sponsorship/stage edges.
      - For each (MP, bill) pair where papers exist, flag the collection's
        scope-note date range overlapping the bill's passage as a
        *candidate* first-hand source; confirm by reading the finding aid.
                  ▼
      third_party/data/mp-papers/papers.jsonl   (one row per MP)
      fields: memberId, qid, name, born, died, repository, repositoryQid,
              reference, nraId, nraUrl, odnbId, memoirs[], biographies[],
              billLinks[], confidence, sourceUrl
```

**Practical notes for whoever builds this:**
- Run the Wikidata pass first (cheap, reachable, gives 1,600+ for free).
- The bot-gating is the main engineering constraint: **TNA Discovery
  search, Archives Hub, Library Hub all 403 datacentre IPs.** Budget a
  browser-context fetcher (the chrome-devtools MCP already available in
  this harness) or a residential proxy for the leaf-resolution + long-tail
  fallback. The Discovery **record-details** API (`/API/records/v1/details/`)
  *is* open, so once you have a C-id the expansion is free.
- Respect provenance: a catalogue hit confirms a file *exists* and *where*;
  asserting its *content* needs the digitised scan or a reader-room visit
  (per `skills/tna-discovery` caveats).
- Identifier hygiene (per `skills/data-quality`): store QID + memberId +
  NRA id, **not** repository names as the key. Wikidata P485 labels are
  demonstrably dirty (Disraeli "NLW" error above) — never treat a P485
  label as a confirmed holding without resolving the leaf catalogue.

---

## Appendix — reproducible probes

```sh
# Reachable: Wikidata — UK MPs with an "archives at" value (count)
curl -s -G -H 'User-Agent: forgetmenot-research/0.1 (danbri@danbri.org)' \
  -H 'Accept: application/sparql-results+json' \
  'https://query.wikidata.org/sparql' --data-urlencode \
  'query=SELECT (COUNT(DISTINCT ?p) AS ?n) WHERE {
     ?p wdt:P39 ?pos . ?pos wdt:P279 wd:Q16707842 . ?p wdt:P485 ?a . }'
#   -> ~1673

# Reachable: per-MP archives + NRA id (sample)
#   query: ?p wdt:P39/?pos wdt:P279 wd:Q16707842 ; OPTIONAL P485, P3029
#   (full query in repo history of this research run)

# Reachable: TNA Discovery record DETAILS (open JSON)
curl -s -H 'User-Agent: Mozilla/5.0' \
  'https://discovery.nationalarchives.gov.uk/API/records/v1/details/C2840649'
#   -> 200, full ISAD(G) JSON

# BOT-GATED (403 "Restricted") from cloud egress — needs browser context:
#   /API/search/records?sps.searchQuery=Gladstone        (Discovery search)
#   archiveshub.jisc.ac.uk/search/archives/{uuid}        (Archives Hub)
#   discover.libraryhub.jisc.ac.uk/search?q=…            (Library Hub)
#   www.historyofparliamentonline.org/                   (HoP, 401 to bots)

# Citable NRA person URL pattern (resolves in a browser):
#   https://discovery.nationalarchives.gov.uk/details/c/F256969   (Gladstone)
```

*Probes run 2026-06-18 from the forgetmenot research environment.*
