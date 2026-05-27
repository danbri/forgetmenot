#!/usr/bin/env python3
"""Build a single-file HTML report from the scrutiny graph + query results."""
import json, os, datetime, html

with open("tmp/scrutiny-graph/query-results.json") as f:
    R = json.load(f)
with open("third_party/data/scrutiny-graph/manifest.json") as f:
    M = json.load(f)

def tbl(rows, headers):
    if not rows:
        return "<p><em>No rows.</em></p>"
    th = "".join(f"<th>{html.escape(h)}</th>" for h in headers)
    body = "".join(
        "<tr>" + "".join(f"<td>{html.escape(str(c)) if c is not None else '—'}</td>" for c in r) + "</tr>"
        for r in rows
    )
    return f'<table><thead><tr>{th}</tr></thead><tbody>{body}</tbody></table>'

sections = []

# Q1 — departments
sections.append(("q1", "Which departments' SIs receive the most Lords division attention?",
    "Across the 40 most recent Lords divisions on statutory instruments, ranked by how often each laying department appears as the SI's author.",
    tbl(R["q1_departments_by_lords_division_count"], ["Department", "Divisions", "SIs"])))

# Q2 — Acts
sections.append(("q2", "Which Acts of Parliament generate the most Lords-visible downstream SIs?",
    "Each row is one enabling Act of Parliament whose delegated powers were exercised to make an SI that the Lords subsequently divided on.",
    tbl(R["q2_acts_generating_most_lords_visible_sis"], ["Enabling Act", "SIs", "Divisions"])))

# Q6 — full SI summary
sections.append(("q6", "Every SI in the seed set, with its division, department, and procedure",
    "Per-SI table — date, division title, SI name, laying department, vote split (content / not content), procedure used.",
    tbl(R["q6_sis_with_division_summary"], ["Date", "Division title", "SI", "Department", "Content", "Not content", "Procedure"])))

# Q3 — peers voting most
sections.append(("q3", "Which peers vote most often on SI motions?",
    "Across all 40 divisions, the peers participating in the most. Heavy participation typically tracks party-whip discipline rather than personal expertise — see the next query for the interest-aligned subset.",
    tbl(R["q3_peers_voting_most_on_sis"], ["Peer", "Party", "Votes"])))

# Q5 — AI-tagged peers
sections.append(("q5", "Which peers carry an AI declared interest AND vote on SIs?",
    "Peers whose Lords RMFI Cat 1 / Cat 6 entries mention artificial intelligence / machine learning / data centres / generative AI and who also voted in at least one of the 40 SI divisions. Sector tagging is keyword-based.",
    tbl(R["q5_peers_with_ai_interest_who_voted_on_sis"], ["Peer", "Party", "SI votes"])))

# Q4 — scrutiny committee members
sections.append(("q4", "Current members of the four scrutiny committees",
    "Statutory Instruments (Joint Committee), Statutory Instruments (Select Committee), Delegated Powers and Regulatory Reform Committee, and the Lords Secondary Legislation Scrutiny Committee.",
    tbl(R["q4_peers_on_scrutiny_committees_now"], ["Peer", "Party", "Committee(s)"])))

# Q7 — sector × committee
sections.append(("q7", "Sector-tagged peers who also sit on a scrutiny committee",
    "The intersection of declared sectoral interests (from Lords RMFI) and current committee membership of one of the four scrutiny committees. This is where commercial expertise meets formal scrutiny role.",
    tbl(R["q7_peers_by_sector_with_committee_seat"], ["Sector", "Peer", "Party", "Committee(s)"])))

# Q8 — sector distribution
sections.append(("q8", "Distribution of sector tags across the 917 peers in the data",
    "Each tag is keyword-derived from the Lords RMFI free-text entries. A peer can have multiple tags.",
    tbl(R["q8_interest_alignment_per_sector"], ["Sector", "Peers"])))

# Q9 — top Acts overall
sections.append(("q9", "Top Acts by SI count in the seed set (without division filter)",
    "How many of our 35 SIs were made under each Act (one SI can be made under multiple Acts).",
    tbl(R["q9_top_acts_by_lord_si_count"], ["Act", "SIs"])))


body = "".join(f'''
<section id="{sid}">
  <h2>{html.escape(title)}</h2>
  <p>{html.escape(desc)}</p>
  {table}
</section>''' for sid, title, desc, table in sections)

nav = "".join(f'<a href="#{sid}">{n}</a>' for sid, (n, *_)in zip([s[0] for s in sections], [(s[1].split('?')[0].split('—')[0][:40] + '…',) for s in sections]))

generated = M["generated"]
counts = M["source_counts"]

HTML = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lords scrutiny of secondary legislation — graph + queries</title>
<style>
:root {{ --bg:#fff; --fg:#1a1a1a; --muted:#555; --rule:#d8d8d8; --accent:#003478; --pill:#f0f2f4; --max:65rem }}
@media (prefers-color-scheme: dark) {{ :root {{ --bg:#111418; --fg:#ecedef; --muted:#a5acb4; --rule:#2c3137; --accent:#6ea7ff; --pill:#1c2026 }} }}
* {{ box-sizing:border-box }}
html {{ font-size:16px; line-height:1.55 }}
body {{ margin:0; color:var(--fg); background:var(--bg); font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif }}
header {{ border-bottom:1px solid var(--rule); padding:1.5rem 1rem; max-width:var(--max); margin:0 auto }}
header h1 {{ margin:0 0 0.3rem; font-size:1.6rem }}
header .sub {{ color:var(--muted); font-size:0.95rem }}
main {{ max-width:var(--max); margin:0 auto; padding:1rem 1rem 4rem }}
h2 {{ font-size:1.25rem; margin-top:2.4rem; padding-top:0.4rem; border-top:1px solid var(--rule) }}
table {{ border-collapse:collapse; width:100%; font-size:0.9rem; margin:0.6rem 0 }}
th, td {{ text-align:left; padding:0.4rem 0.55rem; border-bottom:1px solid var(--rule); vertical-align:top }}
th {{ background:var(--pill); font-weight:600 }}
code {{ background:var(--pill); padding:0.05rem 0.3rem; border-radius:3px; font-size:0.85em }}
a {{ color:var(--accent) }}
.pill {{ display:inline-block; background:var(--pill); border-radius:999px; padding:0.1rem 0.55rem; font-size:0.8rem; color:var(--muted); margin-right:0.3rem }}
.counts {{ display:flex; flex-wrap:wrap; gap:0.5rem; margin:1rem 0 }}
.counts span {{ background:var(--pill); padding:0.3rem 0.6rem; border-radius:4px; font-size:0.85rem }}
.counts b {{ color:var(--accent) }}
nav.toc {{ position:sticky; top:0; background:var(--bg); border-bottom:1px solid var(--rule); padding:0.4rem 1rem; font-size:0.85rem; overflow-x:auto; white-space:nowrap; z-index:10 }}
nav.toc a {{ color:var(--fg); margin-right:0.7rem; text-decoration:none; padding:0.15rem 0 }}
nav.toc a:hover {{ border-bottom:2px solid var(--accent) }}
section p {{ color:var(--muted); font-size:0.92rem }}
</style></head>
<body>
<header>
  <h1>Lords scrutiny of secondary legislation — graph and queries</h1>
  <p class="sub">Cross-references statutory instruments, their enabling Acts and laying departments, against the Lords divisions that contested them, the peers who voted, those peers' declared interests, and the four Lords/joint scrutiny committees.</p>
  <p class="sub">Generated {html.escape(generated)} · Branch: <code>claude/system-prompt-skills-list-RGwlQ</code> · Graph: <code>third_party/data/scrutiny-graph/scrutiny.nq</code></p>
  <div class="counts">
    <span><b>{counts['members']}</b> members</span>
    <span><b>{counts['lords_interests']}</b> peers with interests</span>
    <span><b>{counts['si_details']}</b> SIs</span>
    <span><b>{counts['acts']}</b> enabling Acts</span>
    <span><b>{counts['departments']}</b> laying departments</span>
    <span><b>{counts['division_details']}</b> Lords divisions</span>
    <span><b>{counts['committees']}</b> scrutiny committees</span>
    <span><b>{counts['members_with_sector_tag']}</b> sector-tagged peers</span>
    <span><b>{M['quads']:,}</b> RDF quads</span>
  </div>
</header>
<nav class="toc"><a href="#about">About</a>{"".join(f'<a href="#{sid}">{sid.upper()}</a>' for sid, *_ in sections)}<a href="#sparql">SPARQL recipes</a></nav>
<main>

<section id="about">
<h2>About this graph</h2>
<p><strong>Seed.</strong> The 40 most recent House of Lords divisions whose motion title names a statutory instrument ("Regulations" or "Order") — a usable proxy for Lords division-level scrutiny of secondary legislation.</p>
<p><strong>Sources joined.</strong></p>
<ul>
  <li><a href="https://lordsvotes-api.parliament.uk/">lordsvotes-api.parliament.uk</a> — division metadata + every peer's vote</li>
  <li><a href="https://statutoryinstruments-api.parliament.uk/">statutoryinstruments-api.parliament.uk</a> — SI detail (enabling Acts, laying department, procedure, legislation.gov.uk link)</li>
  <li><a href="https://members-api.parliament.uk/">members-api.parliament.uk</a> — peer basics + Lords RMFI per member</li>
  <li><a href="https://committees-api.parliament.uk/">committees-api.parliament.uk</a> — four scrutiny committees (SLSC, JCSI, SISC, DPRRC) and current members</li>
</ul>
<p><strong>Graph shape.</strong> One named graph per source, plus a <code>cross-links</code> graph asserting <code>scr:divisionOnSI</code> per div→SI resolution. Same identifier (MNIS id) is the join key across members, votes, and interests. SI URI is the Parliament SI API IRI; Act URI is locally minted; <code>scr:legislationGovUkUri</code> on each SI provides the join to legislation.gov.uk.</p>
<p><strong>Sector tags</strong> on peers are keyword-derived from RMFI free text. Patterns are illustrative not authoritative — see <code>tmp/scrutiny-graph/build.py</code> for the regex set. They are a starting point for "is there a commercial reason this peer cares about this kind of SI", not a definitive overlap claim.</p>
</section>

{body}

<section id="sparql">
<h2>SPARQL recipes — run yourself</h2>
<p>The graph is N-Quads at <code>third_party/data/scrutiny-graph/scrutiny.nq</code>. Use the <code>local-sparql</code> skill to spin it up locally:</p>
<pre><code>parl local-sparql up third_party/data/scrutiny-graph/scrutiny.nq</code></pre>
<p>or use rdflib directly — the 9 example queries are in <code>tmp/scrutiny-graph/queries.py</code>.</p>
<p>Namespaces and named graphs:</p>
<pre><code>PREFIX scr:  &lt;https://forgetmenot.example/scrutiny#&gt;
PREFIX rdf:  &lt;http://www.w3.org/1999/02/22-rdf-syntax-ns#&gt;
PREFIX rdfs: &lt;http://www.w3.org/2000/01/rdf-schema#&gt;
PREFIX foaf: &lt;http://xmlns.com/foaf/0.1/&gt;

# Named graphs
&lt;https://forgetmenot.example/scrutiny#graph/parliament-si&gt;
&lt;https://forgetmenot.example/scrutiny#graph/lords-votes&gt;
&lt;https://forgetmenot.example/scrutiny#graph/lords-rmfi&gt;
&lt;https://forgetmenot.example/scrutiny#graph/committees&gt;
&lt;https://forgetmenot.example/scrutiny#graph/members&gt;
&lt;https://forgetmenot.example/scrutiny#graph/cross-links&gt;
</code></pre>
</section>

<section id="caveats">
<h2>Caveats</h2>
<ol>
<li><strong>Seed selection bias.</strong> 40 divisions filtered on title containing "Regulations" or "Order". Some SIs are scrutinised without ever reaching a division (the SLSC's "drawn to special attention" reports). Those non-division-triggering scrutiny events are NOT in this graph.</li>
<li><strong>Committee-to-SI links.</strong> The SLSC's per-SI assessments live in 545 weekly reports as HTML / PDF; not modelled here. The graph captures committee membership but not which committee flagged which SI.</li>
<li><strong>Sector tagging is keyword-based.</strong> Patterns favour over-tagging — a peer with "Lloyd's of London director" gets a banking tag; a peer who sits on an AI ethics board may not. Cross-check with the actual RMFI text in the graph (<code>scr:interestText</code>).</li>
<li><strong>"Most active voters" tracks whip discipline.</strong> Q3's table is dominated by Labour and Lib Dem opposition front-benchers, who vote on every Lords division. It's not a measure of substantive expertise.</li>
<li><strong>Legislation.gov.uk URIs are surfaced but not dereferenced.</strong> The graph holds the URI; a follow-up extension could pull the SI's RDF via content negotiation and add it.</li>
<li><strong>Committee-member set is the historical roll.</strong> The committees-api returned 30 members per committee including those with end dates; we filter to roles that have no end date or are flagged isCurrent, but the API's "current" semantics are imprecise.</li>
</ol>
</section>

</main></body></html>
"""

OUT_HTML = "third_party/data/scrutiny-graph/report.html"
with open(OUT_HTML, "w") as f:
    f.write(HTML)
print(f"Wrote {OUT_HTML} ({os.path.getsize(OUT_HTML)} bytes)")
