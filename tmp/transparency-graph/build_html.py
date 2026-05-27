#!/usr/bin/env python3
import json, os, html

with open("tmp/transparency-graph/query-results.json") as f:
    R = json.load(f)
with open("third_party/data/transparency-graph/manifest.json") as f:
    M = json.load(f)

def tbl(rows, headers):
    if not rows: return "<p><em>No rows.</em></p>"
    th = "".join(f"<th>{html.escape(h)}</th>" for h in headers)
    body = "".join("<tr>" + "".join(f"<td>{html.escape(str(c)) if c is not None else '—'}</td>" for c in r) + "</tr>" for r in rows)
    return f'<table><thead><tr>{th}</tr></thead><tbody>{body}</tbody></table>'

sections = [
    ("q1", "Officers of an APPG whose secretariat appears in their own Lords RMFI",
     "Strict overlap — the peer is both an APPG officer AND has declared a paid role / consultancy / advisory tie to the organisation that acts as that APPG's secretariat. These are <em>entity matches</em>, not allegations: in most cases the connection is openly disclosed and reflects domain expertise that motivated both the APPG role and the personal one.",
     tbl(R["q1_officers_with_secretariat_overlap"], ["Peer", "Party", "APPG", "Entity"])),
    ("q2", "Entities most often appearing across the APPG register and peers' interests",
     "Entities that appear as APPG secretariats / benefit-providers <em>and</em> as named organisations in Lords RMFI text. Ranked by number of distinct peers + distinct APPGs. Entity normalisation is naive (lowercase + suffix-strip); small duplicates remain (e.g. 'AtkinsRealis' vs 'AtkinsRealis Inc').",
     tbl(R["q2_entities_appearing_across_appg_and_interests"], ["Entity", "APPGs", "Peers"])),
    ("q3", "APPGs with the most overlap to peer-declared entities",
     "An APPG is over-represented here if many of its secretariat / benefit-providing entities also turn up as named ties in peers' RMFI text.",
     tbl(R["q3_appgs_with_most_member_interest_overlap"], ["APPG", "Peers connected", "Entities connected"])),
    ("q4", "Peers with the most APPG-overlap connections",
     "Each row counts the number of APPGs to which a peer has at least one organisational tie via their RMFI. High counts here reflect either dense civic-society networks or commercial portfolios that intersect many policy areas.",
     tbl(R["q4_peers_with_most_appg_overlaps"], ["Peer", "Party", "APPG overlaps"])),
    ("q5", "Top financial donors to APPGs (by count)",
     "Defence and trade associations dominate the small-cap end of APPG financial benefits. Note the dataset's currency: edition 260413 (April 2026), cached 3 May 2026.",
     tbl(R["q5_top_appg_funders_overall"], ["Donor", "APPGs"])),
    ("q6", "APPG financial donors that are also named in a peer's declared interest",
     "Sharper overlap: an APPG receives a financial benefit from organisation X, AND a peer's RMFI mentions organisation X. Surfaces Google → PICTFOR & Lord Vaizey; National Grid → Environment APPG & Lord Livingston; AtkinsRealis → Environment APPG & Baroness McGregor-Smith; UKRI → Parliamentary & Scientific APPG & Baroness Bull.",
     tbl(R["q6_appg_funder_also_peer_interest"], ["Entity", "APPG", "Peer"])),
]

body = "".join(f'''
<section id="{sid}">
<h2>{html.escape(title)}</h2>
<p>{desc}</p>
{tab}
</section>''' for sid, title, desc, tab in sections)

HTML = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Lords interests × APPGs — transparency overlap graph</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root {{ --bg:#fff; --fg:#1a1a1a; --muted:#555; --rule:#d8d8d8; --accent:#003478; --pill:#f0f2f4; --warn:#c98c00; --warn-bg:#fff7e6 }}
@media (prefers-color-scheme: dark) {{ :root {{ --bg:#111418; --fg:#ecedef; --muted:#a5acb4; --rule:#2c3137; --accent:#6ea7ff; --pill:#1c2026; --warn-bg:#2c2210 }} }}
* {{ box-sizing:border-box }}
html {{ font-size:16px; line-height:1.55 }}
body {{ margin:0; color:var(--fg); background:var(--bg); font-family:ui-sans-serif,system-ui,sans-serif }}
header {{ border-bottom:1px solid var(--rule); padding:1.5rem 1rem; max-width:65rem; margin:0 auto }}
header h1 {{ margin:0 0 0.3rem; font-size:1.6rem }}
main {{ max-width:65rem; margin:0 auto; padding:1rem 1rem 4rem }}
h2 {{ font-size:1.2rem; margin-top:2.4rem; padding-top:0.4rem; border-top:1px solid var(--rule) }}
table {{ border-collapse:collapse; width:100%; font-size:0.9rem; margin:0.6rem 0 }}
th,td {{ text-align:left; padding:0.4rem 0.55rem; border-bottom:1px solid var(--rule); vertical-align:top }}
th {{ background:var(--pill); font-weight:600 }}
code {{ background:var(--pill); padding:0.05rem 0.3rem; border-radius:3px; font-size:0.85em }}
a {{ color:var(--accent) }}
.counts {{ display:flex; flex-wrap:wrap; gap:0.5rem; margin:1rem 0 }}
.counts span {{ background:var(--pill); padding:0.3rem 0.6rem; border-radius:4px; font-size:0.85rem }}
.counts b {{ color:var(--accent) }}
blockquote.warn {{ margin:1rem 0; padding:0.7rem 1rem; background:var(--warn-bg); border-left:4px solid var(--warn); font-size:0.92rem }}
.muted {{ color:var(--muted); font-size:0.92rem }}
nav.toc {{ position:sticky; top:0; background:var(--bg); border-bottom:1px solid var(--rule); padding:0.4rem 1rem; font-size:0.85rem; overflow-x:auto; white-space:nowrap; z-index:10 }}
nav.toc a {{ color:var(--fg); margin-right:0.7rem; text-decoration:none }}
</style></head>
<body>
<header>
<h1>Lords interests × APPGs — transparency overlap graph</h1>
<p class="muted">Entity-resolution view of where the <strong>Register of All-Party Parliamentary Groups</strong> and the <strong>Lords Register of Members' Financial Interests</strong> name the same organisation. Generated {html.escape(M['generated'])}.</p>
<blockquote class="warn"><strong>Framing.</strong> Every row in this report is an entity match between two public registers. Most matches are <em>expected</em> — peers chair APPGs about sectors they work in, and the openness of the registers is what allows that connection to be visible. This document is for context and follow-up, not for inferring undisclosed conflict of interest. Cross-check the actual RMFI text and the APPG entry before drawing any conclusion.</blockquote>
<div class="counts">
  <span><b>{M['source_counts']['appgs']}</b> APPGs</span>
  <span><b>{M['source_counts']['lords_interests_files']}</b> Lords interest files</span>
  <span><b>{M['source_counts']['distinct_appg_entity_links']}</b> distinct APPG entity links</span>
  <span><b>{M['source_counts']['members_with_interest_entity']}</b> peers with named entities</span>
  <span><b>{M['source_counts']['officer_self_overlaps']}</b> officer/secretariat self-overlaps</span>
  <span><b>{M['quads']:,}</b> RDF quads</span>
</div>
</header>
<nav class="toc">{"".join(f'<a href="#{sid}">{sid.upper()}</a>' for sid, *_ in sections)}<a href="#about">About</a><a href="#caveats">Caveats</a></nav>
<main>

<section id="about">
<h2>About this graph</h2>
<p><strong>Sources:</strong></p>
<ul>
<li>Register of All-Party Parliamentary Groups, edition 260413 (cached at <code>third_party/data/appg/resolved.json</code>) — title, purpose, secretariat, financial + in-kind benefits, officers</li>
<li>Lords Register of Members' Financial Interests, fetched 27 May 2026 (cached at <code>tmp/scrutiny-graph/raw/lords-interests/</code>) — full text of Cat 1 paid roles, Cat 5 visits, Cat 6 gifts</li>
<li>UK Parliament Members API for peer name/party</li>
</ul>
<p><strong>What was NOT pulled and why:</strong></p>
<ul>
<li><strong>Companies House / Persons with Significant Control</strong> — requires API key; not configured in this environment.</li>
<li><strong>Office of the Registrar of Consultant Lobbyists (ORCL)</strong> statutory register — the official Salesforce-hosted site returned 403/404 for unauthenticated bulk fetch on 2026-05-27; manual download or scrape would be needed.</li>
<li><strong>mySociety APPG CSV/Parquet dump</strong> — we have the equivalent data via our own scraper.</li>
<li><strong>Wikidata enrichment for entity disambiguation</strong> — possible follow-up; would help collapse "AtkinsRealis" / "AtkinsRealis Inc" duplicates.</li>
</ul>
<p><strong>Graph shape:</strong> 5 named graphs (<code>appg-register</code>, <code>lords-rmfi</code>, <code>members</code>, <code>entities-resolved</code>, <code>overlaps</code>) at <code>third_party/data/transparency-graph/transparency.nq</code>. Entity normalisation: lowercase + strip Ltd/Limited/LLP/Inc/PLC/etc; this is intentionally lossy and undercounts (e.g. "International Bar Association's Human Rights Institute" stays whole). For high-confidence work, layer in Wikidata QID resolution per entity.</p>
</section>

{body}

<section id="caveats">
<h2>Caveats</h2>
<ol>
<li><strong>Entity matching is string-based.</strong> "Google" matches as soon as the word "Google" appears in interest text; a peer who declares "speaking fee, Google" is matched to the APPG's "Google" benefit-provider, but so would "Google Search" or "Google Cloud". For attribution work, hand-verify each match.</li>
<li><strong>Naming variants are not collapsed.</strong> "National Grid" and "National Grid plc" appear as two separate entities in some queries. A Wikidata-QID layer would fix this.</li>
<li><strong>The APPG register edition is 260413</strong> (April 2026; the latest at the time of caching). Some APPGs change secretariat or officers between editions.</li>
<li><strong>Lords RMFI parsing is heuristic.</strong> The <code>build.py</code> extractor uses pattern matching to pull org names from free text. Some entries (e.g. nested chains like "Adviser, Firm A on behalf of Firm B") get only the top-level entity. Review the <code>scr:interestText</code> property directly for full context.</li>
<li><strong>Only Lords interests are processed</strong>, not Commons. Equivalent overlap would exist on the Commons side — see <code>tmp/ai-appg-report/</code> for that work as applied to AI-APPG officers specifically.</li>
<li><strong>"Overlap" ≠ "conflict of interest."</strong> Each row should be read as "these two registers name the same entity," which is precisely what the public-disclosure regime is designed to make visible.</li>
</ol>
</section>

</main></body></html>
"""

OUT = "third_party/data/transparency-graph/report.html"
with open(OUT, "w") as f:
    f.write(HTML)
print(f"Wrote {OUT} ({os.path.getsize(OUT)} bytes)")
