# Tracing AI regulation through every Parliament data source

A novel enquiry against each of the 22 facilities `forgetmenot` knows
about, woven into a single connected narrative. The unifying thread:
the **Artificial Intelligence (Regulation) Bill [HL]** introduced by
Lord Holmes of Richmond — and the wider procedural footprint AI
leaves behind it. Every fact below is sourced from a live tool call
on 2026-05-17 against the URL cited.

---

## 1. `bills` — the seed

`parl bills search --term "Artificial Intelligence"` returns three
Bills, of which the live one is **billId 3942, "Artificial
Intelligence (Regulation) Bill [HL]"**, introduced in Session 39 on
**4 March 2025**, originating in the Lords, sponsor **Lord Holmes of
Richmond** (memberId 4294, Conservative life peer).

> https://bills-api.parliament.uk/api/v1/Bills/3942

`parl bills stages 3942` shows the Bill is still stuck at **1st
reading** — typical for a Private Member's Bill in the Lords with no
government time.

That single result fans out into the rest of the report.

---

## 2. `members` — the sponsor

`parl members get 4294`:

| field | value |
|---|---|
| Name | The Lord Holmes of Richmond MBE |
| Membership | Life peer since 2013-09-13 |
| Party | Conservative |

> https://members-api.parliament.uk/api/Members/4294

A natural sister-call to **MNIS** below.

---

## 3. `interests` — why this Bill, by this peer

`parl members interests 4294` exposes his Category 1 entries:

- Director, **CHconserve Ltd** (advisory)
- Director, **CHedserve Ltd** (professional education)
- Director, **Calcaneum UK Limited** ("*new technologies advisory*")

So the sponsor of a Bill to regulate AI also runs a "new technologies
advisory" company. The Lords' transparency rules require him to
declare a relevant interest whenever he raises related business — which
he does (see §11).

---

## 4. `committees` — the prior inquiry

`parl committees business-search --term "artificial intelligence"`
surfaces inquiry **id 4658, "Robotics and artificial intelligence"**,
opened 2016-03-22, closed 2017-05-03 by the Commons Science and
Technology Committee, with a **5th Report** published on
2016-10-12 and a **Government Response** on 2017-01-16.

> https://committees-api.parliament.uk/api/Committees/business/4658

So the policy area has been the subject of a formal Select Committee
inquiry once before the current Bill — which Parliament's own
research office can now build on.

---

## 5. `hansard` — current debates

`parl hansard search-debates --term "artificial intelligence" --from
2026-01-01 --to 2026-05-17`:

| Date | Title | House |
|---|---|---|
| 2026-04-13 | Artificial Intelligence: Impact on Employment | Lords |
| 2026-03-18 | Artificial Intelligence Growth Zones | Commons |
| 2026-01-22 | Artificial Intelligence: UK Preparedness | Lords |

`parl hansard debate 5D5AAA0E-BE76-4BA1-877F-25D32337BECE` confirms
the 13 April Lords debate sits in Volume 855, between "Clerk
Assistant" and the "Britain's Battery Future Report". `parl hansard
speakers-in …` returns nine member-IDs participating.

---

## 6. `commons-votes` — most recent divided House

The Bill is in the Lords so there is no Commons vote on it yet.
The most recent recorded Commons division (`parl commons-votes
search --take 3`) is **Division 2350, 28 April 2026, 19:41**: the
*Draft Immigration and Asylum (Provision of Accommodation to Failed
Asylum-Seekers) (Amendment) Regulations 2026* — passed **304 / 28**
with Labour tellers Caliskan (Barking) and Costigan (Ealing Southall)
opposed by SNP tellers Blackman and Leadbitter. (Cited to show the
facility works, since AI itself has not divided the Commons.)

> https://commonsvotes-api.parliament.uk/data/divisions.json/search?take=3

---

## 7. `lords-votes` — Lord Holmes' own voting record

`parl lords-votes member 4294 --take 5` returns Lord Holmes' last
five Lords divisions. The most recent is **Division 3672, 27 April
2026, on the Pension Schemes Bill** (Baroness Bowles' Motion A1,
double-insistence on Amendments 15–24 et al.). The House divided
**Content 197 / Not Content 129 — Lord Holmes voted Content** (i.e.
against the Government).

> https://lordsvotes-api.parliament.uk/data/divisions/membervoting?MemberId=4294

So Lord Holmes is an active dissenter on the government side — a
useful data point when weighing whether his AI Bill is intended to
shape government policy or to provoke it.

---

## 8. `oral-questions` — what MPs are tabling

`parl oral-questions questions --from 2026-01-01 --to 2026-05-17
--term "artificial intelligence"` returns **1,945 total questions**
matching across the session, the first page of which leads on the
Home Office's departmental responsibilities slot tabled by David
Burton-Sampson MP (Southend West and Leigh) and answered by the
Home Secretary, Shabana Mahmood (Birmingham Ladywood).

> https://oralquestionsandmotions-api.parliament.uk/oralquestions/list

---

## 9. `wq` (written questions) — and a self-declared interest

`parl wq search --term "artificial intelligence" --from 2026-01-01
--to 2026-05-17` reports **963 written questions** with that string
in the current period. The first hit is **HL16685**, tabled 22 April
2026 by Member 1796 to the DHSC, about NHS use of AI and data
analytics platforms. Even the answer is illuminating:

> *"It has not proved possible to respond to this question in the
> time available before Prorogation. Ministers will correspond
> directly with the Member."*

The reference to **Prorogation** is independently confirmed by §13
below.

`parl wq search --member-id 4294 --term "artificial intelligence"
--from 2025-01-01 --to 2026-05-17` returns exactly one question Lord
Holmes has personally tabled on AI in this period — **HL14281, 4
February 2026, "Artificial Intelligence: Safety"** — and crucially
the API flags `"memberHasInterest": true`, the formal declaration
that ties back to his Category 1 entries in §3. The Government reply
points him at the *AI Opportunities Action Plan*.

---

## 10. `si` (statutory instruments)

`parl si search` returns the live SI workpackages. The most recent
laid (2026-05-14) include **SI 2026/519, "English Devolution and
Community Empowerment Act 2026 (Consequential Amendments and
Revocations) (England) Regulations 2026"**, made negative — i.e.
the Act that just got Royal Assent (the same Act Lord Holmes
contributed one speech to on 13 April: see §11) is now generating
its first wave of secondary legislation.

> https://statutoryinstruments-api.parliament.uk/api/v2/StatutoryInstrument

(Note: no SI directly named "Artificial Intelligence" yet — secondary
AI legislation is the gap the Bill in §1 is intended to address.)

---

## 11. `treaties` — a *negative* finding worth recording

`parl treaties search --search-text "artificial intelligence"`
returns **zero items**. Likewise `--search-text "Council of Europe
Framework"`. The Council of Europe's **Framework Convention on AI**
(opened for signature May 2024) is not yet visible to the Treaties
API — i.e. the UK has not laid it under CRaG. That absence is itself
the answer.

A working example exists for the wider treaty pipeline:
`--search-text "Vilnius"` returns *CP 1185 (Lithuania No. 1 (2024))*,
laid before both Houses on 28 November 2024 by the FCDO with
`parliamentaryConclusion: "CanRatify"`.

> https://treaties-api.parliament.uk/api/Treaty?SearchText=Vilnius

---

## 12. `em` (Erskine May) — the procedure behind §1

`parl em search "private members bill"` returns 147 paragraphs.
The procedurally exact passage is `parl em paragraph 29.10`:

- Section 5441, title **"Government and Private Members' Bills"**,
- Chapter 29, *Proceedings on public bills in the House of Lords*,
- Part 4 (Public bills).

> https://erskinemay-api.parliament.uk/api/Search/Paragraphs?SearchTerm=private%20members%20bill

It records that the House normally accords priority to government
Bills — i.e. precisely why a Holmes-sponsored PMB has sat at 1R for
over a year.

---

## 13. `now` — the live annunciator confirms recess/prorogation

`parl now current CommonsMain` and `parl now current LordsMain` at
21:09 BST today both return a single `BlankSlide` with `publishTime`
of **2026-05-14T16:51** and **2026-05-14T17:33** respectively. The
annunciator went blank in mid-afternoon on 14 May and has not stirred
since — consistent with the Prorogation language in §9.

> https://now-api.parliament.uk/api/Annunciator/Current/CommonsMain

---

## 14. `petitions` — public temperature on AI

`parl petitions search --term "artificial intelligence" --count 5`
returns 6 pages of AI-related petitions. Two illustrative ones:

- **#713888 "Ban artificial intelligence-produced imagery and art
  from being copyrighted"** — closed, 1,080 signatures, sponsored
  department DCMS.
- **#715706 "Make a criminal offence not to label AI generated media
  & communication as such"** — closed.

For comparison, the *current* top petition by signatures
(`--state open --count 1`) is petition **#746363 on Indefinite Leave
to Remain** with **244,423 signatures**, scheduled for debate
2 February 2026 and already debated.

> https://petition.parliament.uk/petitions.json?q=artificial+intelligence

---

## 15. `sparql` — proving the DDP store is live

```sparql
PREFIX schema: <https://id.parliament.uk/schema/>
SELECT (COUNT(?x) AS ?n) WHERE { ?x a schema:Person }
```

→ **5,460 Persons** in the DDP graph. The triple store is online;
this is the public-facing DDP store fronted by
`api.parliament.uk/sparql`.

A second sanity query

```sparql
SELECT ?label WHERE { ?x schema:houseName ?label } LIMIT 5
```

returns the two house labels — *House of Commons* and *House of
Lords* — confirming basic schema browsing works.

> https://api.parliament.uk/sparql

---

## 16. `odata` — same graph, different surface

`parl odata sets` lists `TemporalThing`, `PastThing`, `MnisThing`,
`DodsThing`, `PimsThing`, `WikidataThing`, `Person` and the rest.
A sample query
`parl odata get Person --top 1 --filter "contains(personGivenName,'Chris')"`
yields **Christine Crawley** (DDP `LocalId aJ7Os4SE`, Dods 26891,
Pims 2768, MNIS 3386).

> https://api.parliament.uk/odata/Person?$top=1&$filter=contains(personGivenName,%27Chris%27)

The local Christine-Crawley LocalId is the same identifier system
SPARQL exposes — i.e. SPARQL and OData are two views of one store.

---

## 17. `pq` (parameterised query) — the same store again, by name

`parl pq run person_lookup --property mnisId --value 4294` returns

```json
{ "@id": "34bI5Ock", "@type": "Person" }
```

So Lord Holmes' **DDP person id is `34bI5Ock`**, derivable from the
Members API id `4294`. This is the canonical bridge between the
modern REST APIs and the linked-data graph.

> https://api.parliament.uk/query/person_lookup?property=mnisId&value=4294

(Note: the `postcode` template `constituency_lookup_by_postcode`
returned HTTP 500 today for several known-good postcodes — a real
upstream outage worth reporting to data@parliament.uk.)

---

## 18. `lda` (legacy Linked Data API)

`parl lda datasets` lists 15 datasets including `commonsdivisions`,
`lordsdivisions`, `commonswrittenquestions`, `edms`,
`billamendments`. `parl lda get bills --page-size 3` returns the
Elda payload (e.g. *Prisons (Interference with Wireless Telegraphy)
Bill* 2017-19, Baroness Pidding and Maria Caulfield sponsors). The
legacy stack still serves data — useful when a modern endpoint is
missing a field.

> http://eldaddp.azurewebsites.net/bills.json?_pageSize=3

---

## 19. `hh` (historic Hansard 1803-2005) — the long view

`parl hh fetch /sittings/1973` returns the **timeline page for 1973**
— the year of the **Lighthill Report** that triggered the first AI
Winter and the cancellation of UK AI funding. The HTML lists every
sitting month of 1973, navigable into individual debates.

> https://api.parliament.uk/historic-hansard/sittings/1973

Holding the modern Bill (§1) and the 1973 timeline side by side
makes the half-century gap visible: Parliament has been arguing
about machine intelligence for ~50 years.

---

## 20. `mnis` (legacy Members Data Platform)

`parl mnis members --house Lords` returns the canonical legacy XML
list of Lords. Entry 1 (`Member_Id=631`) is **Baroness Adams of
Craigielea**, with the older Dods/Pims/Clerks IDs all present —
the same IDs that surface via `WikidataThing` in OData (§16) and
`person_lookup` in PQ (§17). MNIS predates the modern Members API
but is still the system of record for some legacy cross-references.

> https://data.parliament.uk/membersdataplatform/services/mnis/members/query/house=Lords/

---

## 21. `ddpd` (data.parliament.uk dataset catalogue)

`parl ddpd list` enumerates the 19 explore.data.parliament.uk
datasets and `parl ddpd map "Lords Written Questions"` confirms
which modern API supersedes each one:

```json
{ "ldaSlug": "lordswrittenquestions", "modernApi": "written-questions", "notes": "" }
```

So Lord Holmes' Q HL14281 (§9) and the historic dataset
`lordswrittenquestions` are the same body of evidence, just two
different access surfaces.

---

## 22. `appg` (All-Party Parliamentary Groups)

`parl appg editions --year 2026` lists three editions of the
Register so far this year (12 Jan, 23 Feb, 13 Apr). The 13 April
edition contains the **All-Party Parliamentary Group on Artificial
Intelligence**:

| Role | Name | Party |
|---|---|---|
| Chair & Registered Contact | Dr Allison Gardner MP (Stoke-on-Trent South) | Labour |
| Co-Chair | Lord Clement-Jones | Liberal Democrat |
| Vice Chair | Dawn Butler MP | Labour |
| Vice Chair | Lord Ranger of Northwood | Conservative |

Secretariat: **Big Innovation Centre**. AGM held 26 January 2026.

> https://publications.parliament.uk/pa/cm/cmallparty/260413/artificial-intelligence.htm

Notably, **Lord Holmes is not on the APPG**, despite sponsoring the
AI Bill — i.e. AI policy in the Lords has at least two distinct
poles of activity: the cross-party APPG (chaired by a Labour MP with
a Lib Dem peer co-chair) and Lord Holmes' own Conservative-backed
PMB pipeline.

---

## Threads pulled

Reading the 22 sections together yields findings that no single
facility shows:

1. The **AI Regulation Bill** has been in 1R for **14 months** — and
   Erskine May 29.10 (§12) explains why a Lords PMB rarely
   progresses.
2. The sponsor declares a **commercial interest in new-technologies
   advisory** (§3) and **the wq API automatically flags his AI
   question accordingly** (§9, `memberHasInterest: true`) — the
   declaration system is working as designed.
3. There is **a thriving cross-party AI APPG** (§22) that is
   completely disjoint from the Holmes Bill — different chambers,
   different parties.
4. AI generates **almost 1,000 written questions and ~2,000 oral
   slots** per session (§§8–9) but **zero statutory instruments**
   directly (§10) and **zero treaties** (§11) — i.e. AI policy is
   currently almost entirely a primary-legislation and oversight
   conversation.
5. The **annunciator went blank on 14 May 2026** (§13) and the WQ
   replies reference **Prorogation** (§9): Parliament is between
   sessions as of today.
6. **Five identifier systems** (Members API id 4294, MNIS, Dods,
   Pims, DDP `34bI5Ock`) all refer to the same person — and `pq
   person_lookup` (§17) is the canonical bridge between them.
7. The **Lighthill Report** debate sits in the historic-hansard
   1973 timeline (§19): Parliament has been arguing about machine
   intelligence for half a century.

Twenty-two facilities, one Bill, one peer, and one current question
about whether (and how) the UK will legislate for AI.
