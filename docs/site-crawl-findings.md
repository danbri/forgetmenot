# Site-crawl findings (snapshot of 436 MP websites)

Run: `parl members crawl-sites --in third_party/data/members --out third_party/data/sites --concurrency 4`
Snapshot in `third_party/data/sites/`. Aggregate stats in
`third_party/data/sites/analysis.json`.

> **Honesty note.** The snapshot was produced by an earlier version
> of `excludeReason()` that used naive substring matching. A re-
> evaluation under the fixed code (see `scripts/reeval-exclusions.mjs`)
> shows that **49 % of the personal-content exclusions were false
> positives** — almost all 111 `son` matches were words like
> *Mandelson*, *lesson*, *comparison*, *parson*. The headline
> exclusion counts here are the *raw snapshot* numbers; the
> per-rule audit table below distinguishes still-excluded from
> now-admitted.

## Headline numbers

| | |
|---|---|
| Sites attempted | 436 |
| OK (manifest produced) | **382** (87.6 %) |
| Failed | 54 (12.4 %) |
| Pages fetched (200) | 1 564 |
| Personal-content exclusions (snapshot) | 231 |
| → still excluded under fixed code | 117 |
| → now admitted | 114 |
| News-index items extracted | 1 720 |
| Campaign cards extracted | 1 391 |

## Failure modes (54 sites)

| Reason | Count |
|---|---:|
| Network / timeout | 23 |
| HTTP 403 (anti-bot WAF) | 16 |
| HTTP 503 (rate limit / Cloudflare gate) | 6 |
| Blocked by robots.txt | 5 |
| HTTP 404 (URL stale in Members API) | 3 |
| HTTP 410 (gone) | 1 |

403/503 cluster on Cloudflare-fronted Conservative templates and a
small number of TYPO3 sites. They are correctly recorded as
failures — we don't bypass the WAF.

## Platforms (382 sites)

| Platform | Count | Notes |
|---|---:|---|
| WordPress (vanilla) | 112 | Long-tail of independent themes |
| Drupal 10 | 77 | Conservative party CMS rollout |
| WordPress (`labour-new-theme`) | 71 | Labour party central template |
| Wix | 39 | |
| Squarespace | 28 | |
| TYPO3 CMS | 21 | Used by a Conservative-adjacent network |
| Webflow / GoDaddy / others | 5 | Long tail |
| Unknown / unfingerprinted | 29 | Mostly bespoke or behind cache layer |

The dominant Labour vs Conservative split is essentially WordPress
vs Drupal. That has consequences for parsing — a per-CMS extractor
covers ~80 % of sites with two implementations.

## Social platforms (links from homepages, 1 581 total)

| Host | Links |
|---|---:|
| facebook.com | 444 |
| twitter.com / x.com | 456 |
| instagram.com | 283 |
| youtube.com / youtu.be | 132 |
| linkedin.com | 83 |
| bsky.app | 37 |
| tiktok.com | 25 |
| substack.com | 2 |
| threads.net | 2 |
| whatsapp.com | 2 |

## Newsletter providers (where detectable on homepage)

Only **29 sites** expose a recognisable newsletter form on the
homepage; many sites use a generic `<form action="/subscribe">`
that doesn't fingerprint as anything specific.

| Provider | Sites |
|---|---:|
| Substack | 10 |
| Mailchimp | 8 |
| Action Network | 6 |
| ConvertKit | 3 |
| MailerLite / Brevo | 2 |

## Page-type coverage (sites with at least one fetched page of type)

| Type | Sites | Notes |
|---|---:|---|
| `news_index` | 319 | News/blog index. Often paginated; we fetch only the first index page. |
| `about` | 305 | Bio / profile. |
| `contact` | 302 | Office addresses, email, web form. |
| `privacy` | 235 | Presence-only (we don't fetch boilerplate). |
| `campaigns` | 182 | Listed priorities / issues. The richest cross-MP signal. |
| `parliament` | 159 | "In Parliament" / voting record summaries. |
| `get_involved` | 118 | Volunteer / join the local party. |
| `accessibility` | 84 | Presence-only. |
| `surgery` | 80 | Constituency surgeries / advice centres. |
| `petition` | 65 | Specific petitions or surveys. |
| `events` | 43 | Calendar / diary. |
| `donate` | 33 | Presence-only — links go off-site to party donation forms. |
| `jobs` | 26 | Office vacancies. |
| `newsletter` | 9 | Dedicated newsletter sub-page (most are inline forms instead). |

## Personal-content exclusion audit

| Rule | Snapshot fired | Still valid | Now admitted | Sample admitted |
|---|---:|---:|---:|---|
| `son` | 111 | **0** | 111 | `…/sir-olly-robbins-mandelson-vetting`, `…/comparison-of-x` |
| `children` | 77 | 77 | 0 | (rule still fires correctly) |
| `family` | 20 | 20 | 0 | |
| `anniversary` | 5 | 5 | 0 | |
| `worship` | 5 | 3 | 2 | `chelmsford.anglican.org/our-faith-in-action/churches-and-worshipping-communities` |
| `parents` | 5 | 5 | 0 | |
| `wedding` | 4 | 4 | 0 | |
| `spouse` | 2 | 2 | 0 | |
| `kids` | 1 | 0 | 1 | `grahamstuart.com/KidsFirst` (campaign page) |
| `pets` | 1 | 1 | 0 | |

Action: snapshot retained as-is for auditability; downstream
analysis should use the re-eval if it cares about admitting the
114 false positives.

## Campaign / issue clusters

Bag-of-words over the 1 391 extracted campaign-card titles, with
sidebar/widget words filtered out:

| Word | Hits | Likely cluster |
|---|---:|---|
| local | 68 | local services, "support local X" |
| stop | 35 | "Stop the …" oppositional campaigns |
| save | 30 | "Save the …" preservation campaigns |
| health / care | 25+19 | NHS, social care |
| bill | 25 | specific Bills MPs are championing |
| protecting / fighting / improving / supporting / working | 23+15+15+23+17 | action-verb-led pledges |
| green | 19 | environment / energy |
| transport / road | 15+14 | constituency infrastructure |
| services | 18 | NHS, council services |
| community | 20 | "in our community" framings |
| farm | 14 | the Family Farm Tax fight |
| east / north | 16+16 | regional identity |

The signal is real but messy — sidebar-noise filtering caught most
nav widgets but missed some platform-specific quirks (Drupal-10's
"Further details" boilerplate appears 26 times, "Member" 20). A
per-CMS extractor would clean this up further.

## Decisions audit (over all classified links)

| Action | Count |
|---|---:|
| `unclassified` | 7 115 |
| `classified-duplicate` | 2 109 |
| `classified` | 1 960 |
| `excluded-personal` | 231 |
| `skipped-robots` | 14 |

The high `unclassified` count is expected — every menu has dozens
of links into news posts, individual campaigns, external news
references etc. that don't match any top-level page type. We
treat them as evidence the link was seen but not followed.

---

# Mapping into a graph schema

The corpus is rich enough to populate a useful "MP web presence"
graph. Below is the recommended shape using Schema.org as the
vocabulary backbone with `parl:` for UK-Parliament-specific
extensions and `pol:` for political-research extensions.

## Node types

| Node | Source | Properties |
|---|---|---|
| `parl:Member` | Members API | `mnis_id`, `name`, `party`, `house`, `constituency`, `gender`, `term_start`, `term_end?` |
| `pol:Party` | Members API | `id`, `name`, `abbreviation` |
| `parl:Constituency` | Members API | `id`, `name`, `gss_code?` |
| `schema:WebSite` | Site crawl | `url`, `homepage_url`, `platform`, `newsletter_provider?`, `last_crawled` |
| `schema:WebPage` | Site crawl | `url`, `type` (one of POLITICAL_TYPES), `title`, `meta_description`, `last_crawled`, `http_status`, `body_digest` (multihash) |
| `pol:Campaign` | Site crawl `campaigns` | `title`, `summary`, `url?` (page or external), `cluster?` (issue tag) |
| `schema:Article` (news item) | Site crawl `news_index` | `title`, `url`, `date`, `mp_id` |
| `pol:Surgery` | Site crawl `surgery` | `mp_id`, `address?`, `postcode?`, `phone?`, `external_booking_url?` |
| `pol:OfficeAddress` | Members API + `contact` | `mp_id`, `kind` (Parliamentary / Constituency / Other), `lines[]`, `postcode`, `phone`, `email` |
| `schema:Organization` (newsletter) | Site crawl | `name` (Mailchimp/Substack/…), `kind=newsletter_provider` |
| `schema:DataFeed` | Site crawl `feeds` | `url`, `kind` (rss/atom), `body_digest` |
| `schema:ContactPoint` (social) | Site crawl + Members API | `platform`, `handle`, `url`, `mp_id` |
| `pol:Issue` | Derived (clustering) | `slug`, `display_name`, `synonyms[]` |

## Edge types

| Edge | Domain → Range | Source |
|---|---|---|
| `pol:represents` | Member → Constituency | Members API |
| `pol:memberOf` | Member → Party (with start/end dates) | Members API |
| `schema:owns` | Member → WebSite | Members API + site crawl |
| `schema:hasPart` | WebSite → WebPage | Site crawl decisions[] |
| `pol:promotes` | WebPage(`campaigns`) → Campaign | Site crawl `candidates.campaigns` |
| `pol:about` | Campaign → Issue | Derived clustering |
| `schema:author` | Article → Member | News index attribution |
| `pol:attendsSurgery` | Member → Surgery (location) | Site crawl `surgery` |
| `schema:contactPoint` | Member → ContactPoint(social) | Members `urls` + site `social[]` |
| `schema:contactPoint` | Member → OfficeAddress | Members `urls` |
| `pol:officerOf` | Member → APPG | APPG facility |
| `pol:hasFeed` | WebSite → DataFeed | Site crawl `feeds` |
| `pol:usesPlatform` | WebSite → CMS (label) | Site crawl `platform` |
| `pol:usesNewsletterProvider` | WebSite → Organization | Site crawl `newsletter_provider` |

## Cross-source joins available

- **Member → Campaign** via Site crawl. ~1 391 campaign cards
  across 182 MPs ⇒ avg ~7.6 declared campaigns per MP that has
  any. Cluster by issue for the "who's campaigning on X" lens.
- **Member ↔ Member via shared APPG** via the APPG facility.
  Already structured (officers list with role + name + party).
- **Member ↔ Member via shared Bill** via Bills API `sponsors[]`.
- **Member ↔ Member via shared EDM** via Oral Questions facility.
- **Member ↔ Member via shared committee** via Committees API.
- **Member → Issue** (joinable) via campaign cluster + EDM topic
  + voting record. Three independent signals for the same axis.

## Recommended next steps

1. **Issue ontology**: build a small (~30-entry) controlled vocab
   of UK political issues — "NHS", "Family Farm Tax", "Asylum
   policy", "Trans rights", "Gaza"… — and seed `pol:about` edges
   from the campaign-word clusters. This is a good two-pass /
   judgment task (see the earlier conversation about LLM
   callbacks): the crawler emits campaigns; a `parl members
   judge --issues` step categorises each.
2. **News-index structured fetch**: extend the crawler with a
   second-hop, bounded mode that pulls 10 most-recent items per
   MP into `pol:Article` records with full text. Lets you do
   "what is each MP saying this week" topic feeds.
3. **Per-CMS extractor**: write Drupal-10 and `labour-new-theme`
   parsers (covers ~140 sites with 2 implementations) to clean
   up the long-tail noise in `campaigns` candidates.
4. **Fingerprint Cloudflare-blocked sites**: 22 of the 54 failures
   are WAF rejections. Mark them in a registry rather than
   re-attempting; consider whether to honour their refusal.
5. **JSONL judgment hook**: emit `judgment_needed.jsonl` per site
   for ambiguous personal-vs-political pages, so the two-pass
   LLM step can reclassify the 114 over-admitted false positives
   by reading the actual page text rather than the URL slug.

## Provenance and reproducibility

All raw artefacts live alongside the parsed JSON
(`<site>/homepage.html`, `<site>/pages/<type>.html`,
`<site>/feeds/<n>.xml`) so any extraction here can be checked
against source. The crawler's per-fetch archival hook (when
enabled via `ctx.archive.sink`) emits SHA-1 + SHA-256 + SHA-512 +
SHA3-256 digests in self-describing form, ready for a future
WARC export. See `lib/archival.mjs` for the schema.
