#!/usr/bin/env python3
import json, os, html

with open("tmp/accountability-graph/query-results.json") as f:
    R = json.load(f)
with open("third_party/data/accountability-graph/manifest.json") as f:
    M = json.load(f)

def tbl(rows, headers):
    if not rows: return "<p><em>No rows.</em></p>"
    th = "".join(f"<th>{html.escape(h)}</th>" for h in headers)
    body = "".join("<tr>" + "".join(f"<td>{html.escape(str(c)) if c is not None else '—'}</td>" for c in r) + "</tr>" for r in rows)
    return f'<table><thead><tr>{th}</tr></thead><tbody>{body}</tbody></table>'

sections = [
    ("q1", "Which arm's-length bodies are most often the substantive answer-target of Lords questions?",
     "For each question we scanned the <em>answer text</em> for ~40 named regulators / arm's-length bodies / agencies. The table counts how many distinct answers mention each body, and how many distinct departments routed the answer through it.",
     tbl(R["q1_alb_most_indirectly_accountable"], ["Body", "Mentions in answers", "Delegating departments"])),
    ("q2", "Department → arm's-length body delegation matrix",
     "Per-pair count: when answers from this department mentioned this body. NHS England via DHSC dominates because of how health policy is structured. Treasury → HMRC, Defra → Environment Agency, DSIT → Ofcom are other consistent patterns.",
     tbl(R["q2_dept_delegation_matrix"], ["Department", "Body mentioned", "Q&A count"])),
    ("q3", "Peers who repeatedly pursue the same arm's-length body",
     "Each row is a peer asking ≥2 questions whose answer mentions the same body, in this 5,000-question window (questions tabled Nov 2025 → May 2026). Useful as a signal of sustained scrutiny attention.",
     tbl([r for r in R["q3_peers_pursuing_same_body"] if r[2] >= 2], ["Peer", "Body", "Q count"])),
    ("q4", "Peers asking ≥4 questions on the same topic",
     "Topic is the prefix before ':' in each question's heading (the Parliament categoriser's own term). Heavy concentration here suggests dedicated portfolio scrutiny rather than scattergun enquiry.",
     tbl([r for r in R["q4_peers_pursuing_same_topic"] if r[2] >= 4], ["Peer", "Topic", "Q count"])),
    ("q5", "Short answers (<200 chars) that delegate to a named arm's-length body",
     "Often a 'this is operationally a matter for X' answer — useful starting point for the 'unclear departmental responsibility' question. Reading the actual answers in context is essential before drawing inferences.",
     tbl(R["q5_short_answers_with_delegation"], ["Department", "Body", "Question URI", "Heading", "Answer length"])),
    ("q6", "Peers who chain follow-up questions",
     "When a peer asks 'further to the Written Answer by … on … (HLxxxxx)…', that earlier UIN is a follow-up reference. Counts here show peers who maintain pressure across multiple linked questions. Captures genuine scrutiny stamina.",
     tbl(R["q6_followup_chains"], ["Peer", "Follow-up references"])),
    ("q7", "Top askers overall in the 5,000-question window",
     "Volume-only metric — high here means high tabling activity, not necessarily focused scrutiny.",
     tbl(R["q7_top_askers"], ["Peer", "Party", "Questions"])),
]

body = "".join(f'''
<section id="{sid}">
<h2>{html.escape(title)}</h2>
<p>{desc}</p>
{tab}
</section>''' for sid, title, desc, tab in sections)

HTML = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Lords questions → answer → arm's-length body — accountability graph</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root {{ --bg:#fff; --fg:#1a1a1a; --muted:#555; --rule:#d8d8d8; --accent:#003478; --pill:#f0f2f4 }}
@media (prefers-color-scheme: dark) {{ :root {{ --bg:#111418; --fg:#ecedef; --muted:#a5acb4; --rule:#2c3137; --accent:#6ea7ff; --pill:#1c2026 }} }}
* {{ box-sizing:border-box }}
html {{ font-size:16px; line-height:1.55 }}
body {{ margin:0; color:var(--fg); background:var(--bg); font-family:ui-sans-serif,system-ui,sans-serif }}
header {{ border-bottom:1px solid var(--rule); padding:1.5rem 1rem; max-width:65rem; margin:0 auto }}
header h1 {{ margin:0 0 0.3rem; font-size:1.55rem }}
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
.muted {{ color:var(--muted); font-size:0.92rem }}
nav.toc {{ position:sticky; top:0; background:var(--bg); border-bottom:1px solid var(--rule); padding:0.4rem 1rem; font-size:0.85rem; overflow-x:auto; white-space:nowrap; z-index:10 }}
nav.toc a {{ color:var(--fg); margin-right:0.7rem; text-decoration:none }}
</style></head>
<body>
<header>
<h1>Lords accountability graph — questions → answer → arm's-length body</h1>
<p class="muted">Joins 5,000 most recent Lords written questions (tabled Nov 2025 → 27 May 2026) with answering bodies, asker, and arm's-length-body mentions in the answer text.</p>
<div class="counts">
  <span><b>{M['source_counts']['questions']:,}</b> questions</span>
  <span><b>{M['source_counts']['answering_bodies']}</b> answering bodies</span>
  <span><b>{M['source_counts']['distinct_alb_mentions']}</b> named arm's-length bodies</span>
  <span><b>{M['source_counts']['distinct_askers']}</b> distinct askers</span>
  <span><b>{M['source_counts']['followup_edges']}</b> follow-up references</span>
  <span><b>{M['quads']:,}</b> RDF quads</span>
</div>
</header>
<nav class="toc">{"".join(f'<a href="#{sid}">{sid.upper()}</a>' for sid, *_ in sections)}<a href="#about">About</a><a href="#caveats">Caveats</a></nav>
<main>

<section id="about">
<h2>About</h2>
<p><strong>Source:</strong> <code>questions-statements-api.parliament.uk</code> — Lords written questions, <code>tabledWhenFrom=2025-11-01&amp;tabledWhenTo=2026-05-27</code>, paged in batches of 100. Cached locally.</p>
<p><strong>Arm's-length-body detection</strong> is regex-based against a curated list of ~40 named regulators / agencies / commissions. The pattern set is in <code>tmp/accountability-graph/build.py</code>. False positives are possible where the body name appears in a non-substantive context (e.g. "the Department, as the sponsoring body of the FCA, …" counts but tells you very little about delegation).</p>
<p><strong>Follow-up chains</strong> are detected by parsing question text for prior-UIN references of the form <code>HLnnnnn</code>. Captures explicit cross-references; doesn't capture conceptual follow-ups that don't cite a prior UIN.</p>
<p><strong>Graph shape:</strong> 5 named graphs (<code>questions-answers</code>, <code>answering-bodies</code>, <code>arms-length-bodies</code>, <code>members</code>, <code>cross-links</code>) at <code>third_party/data/accountability-graph/accountability.nq</code>.</p>
</section>

{body}

<section id="caveats">
<h2>Caveats</h2>
<ol>
<li><strong>Window-limited.</strong> 5,000 questions covers roughly Nov 2025 → May 2026. Longer-arc scrutiny patterns (a peer pursuing the same body for two years) won't show in this slice.</li>
<li><strong>ALB detection is keyword-based</strong> and intentionally curated. A body not in the regex list is invisible (e.g. devolved-administration bodies, smaller commissions, NHS trusts, individual regulators below the headline). For coverage of a specific policy area, extend the pattern list.</li>
<li><strong>"Delegation" inference is structural.</strong> An answer mentioning a body is not always a delegation; sometimes the answer says "we have asked the body to do X" which is a clear delegation; sometimes it says "the body's view is Y" which is a substantive response. Q5 is the closest cut: very short answers that mention a body are the highest-confidence "this is operationally for them" cases.</li>
<li><strong>"Pursuing the same body" should not be read as advocacy.</strong> A peer asking 25 NHS-England-routed questions may be holding the body to account, or they may be channelling sectoral interests; only the questions themselves tell you which. Read the actual text before inferring intent.</li>
<li><strong>Lords-only.</strong> Commons equivalent (much higher volume) is not in this graph; the API supports it via <code>house=Commons</code>.</li>
</ol>
</section>

</main></body></html>
"""
OUT = "third_party/data/accountability-graph/report.html"
with open(OUT, "w") as f:
    f.write(HTML)
print(f"Wrote {OUT} ({os.path.getsize(OUT)} bytes)")
