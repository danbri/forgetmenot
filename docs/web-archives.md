# UK web archives and MP websites

Three archives could plausibly hold an MP's website. Their coverage,
access terms, and engineering interfaces differ a lot. This doc
tells the operator what's worth trying and what's not.

## TL;DR

| Archive | Coverage of MP sites | Public access | Useful as a fallback? |
|---|---|---|---|
| **Internet Archive — Wayback Machine** | Most live MP sites have at least one capture; many have hundreds. | Open, free, no auth. CDX + Availability JSON APIs. | **Yes — primary fallback.** |
| **UK Web Archive (BL et al.)** | Comprehensive in principle (annual UK-domain crawl since 2013). | **Restricted.** Most pages viewable only on the premises of one of the six legal-deposit libraries. ~19 k sites are openly viewable because the publisher granted permission. | **No, in practice.** Plus the public site has been offline since the [October 2023 BL cyberattack](https://blogs.bl.uk/webarchive/legal-deposit/) and was still listed as unavailable in late 2025. |
| **TNA UK Government Web Archive** | Central-government sites and Parliament's own sites (`parliament.uk` etc.) since 2009. **Does NOT cover MP personal websites** — they're not central-government estate. | Open. | **No — wrong scope.** |

## Internet Archive Wayback Machine

This is the only fallback worth coding against.

**Availability API** (one URL → most-recent capture):
```
GET https://archive.org/wayback/available?url=<url>
→ {"archived_snapshots":{"closest":{"available":true,"url":"https://web.archive.org/web/20260101000000/https://example.org/","timestamp":"20260101000000","status":"200"}}}
```

**CDX server** (full capture history):
```
GET https://web.archive.org/cdx/search/cdx?url=<url>&output=json&from=2024
→ [["urlkey","timestamp","original","mimetype","statuscode","digest","length"],
   ["org,example)/", "20260101000000", "https://example.org/", "text/html", "200", "ABC...", "12345"],
   ...]
```

The first row is column names; subsequent rows are captures. Useful
parameters: `from=YYYYMMDDhhmmss`, `to=...`, `limit=N`, `filter=` (regex
on a column), `collapse=urlkey:0` (one row per URL).

A "memento" URL is `https://web.archive.org/web/<timestamp>/<original>`.

**Etiquette:** Wayback's CDX server is rate-limited but generous to
small clients. Stay under a few QPS, set a real `User-Agent`
identifying yourself, and don't hammer it from many parallel workers.

## UK Web Archive (UKWA)

UKWA is run by the British Library plus the five other UK legal
deposit libraries (Bodleian, Cambridge UL, NLW, NLS, Trinity Dublin).
Under the
[Legal Deposit Libraries (Non-Print Works) Regulations 2013](https://www.legislation.gov.uk/uksi/2013/777),
they crawl the UK domain (.uk, .scot, .cymru, .wales, plus IP-based
"in the UK" sites) **at least once a year**. So MP websites with UK
TLDs are very likely to be in UKWA's index.

**The catch is access**: legal deposit terms restrict viewing to
workstations physically inside one of the legal deposit libraries,
unless the publisher (the MP, in our case) has granted UKWA explicit
permission to make the captures openly viewable. Roughly 19 000
sites have such permission; the rest do not. We have not surveyed
which MP sites are in the openly-accessible subset.

**Programmatic access:** there is a Solr-backed search at
`webarchive.org.uk/api/...` historically but UKWA has been listed
as unavailable since the [October 2023 BL cyberattack](https://blogs.bl.uk/webarchive/legal-deposit/),
and was still down in December 2025 per the BL's status page.

**Practical recommendation:** treat UKWA as a *future* avenue. If
and when it returns, an `lib/facilities/ukwa.mjs` wrapper would be
the right place to add it. The data is there; the access path is
broken.

## TNA UK Government Web Archive

`webarchive.nationalarchives.gov.uk` covers central government and
the parliamentary estate (parliament.uk, hansard.parliament.uk,
members-api.parliament.uk, etc.) from 2009. **It does not cover
MP personal/constituency websites** — they are not central
government estate. Useful for archival of Parliament's own pages
(separate from Hansard which we already cover via the Hansard API).

The TNA archive has its own discovery interface but not a strongly
documented JSON API; results are HTML. For our purposes there is
no MP-site value here.

## Recommended fallback chain in this repo

1. **Live origin** with the polite UA + `From:` header (current).
2. **Wayback Machine availability API** for the same URL,
   accepting the most recent successful 200 capture.
3. (Future) UKWA Solr API once UKWA is back online and we add a
   wrapper.

The fallback should be visibly logged in the manifest (we want it
auditable that a record came from Wayback rather than the origin).

## Sandbox note

This document was written without empirical probing of Wayback or
UKWA — the sandbox running the build blocks egress to `archive.org`
and `webarchive.org.uk`. The code added in `lib/facilities/wayback.mjs`
is built to a documented public API and verified by tests with a
mocked fetch; first real runs should be done from the operator's
machine.

## Sources

- [British Library — Legal deposit and web archiving](https://www.bl.uk/services/legal-deposit/web-archiving)
- [UK Web Archive — Cambridge University Library guide](https://www.lib.cam.ac.uk/collections/departments/legal-deposit/uk-web-archive)
- [UK Web Archive — Bodleian Libraries guide](https://www.bodleian.ox.ac.uk/collections-and-resources/legal-deposit/uk-web-archive)
- [UK Web Archive — Wikipedia](https://en.wikipedia.org/wiki/UK_Web_Archive)
- [TNA — UK Government Web Archive](https://www.nationalarchives.gov.uk/webarchive/)
- [Wayback Machine APIs](https://archive.org/help/wayback_api.php)
- [Wayback CDX server README](https://github.com/internetarchive/wayback/blob/master/wayback-cdx-server/README.md)
