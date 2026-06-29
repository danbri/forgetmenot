#!/usr/bin/env python3
"""Generate the procb gallery: a searchable before/after runner over all 130
procedure-browser queries, served on fpkg at /procb/.

Reads manifest.json + verify-report.json + getter-deltas.json + queries/*.rq,
emits <web>/queries.json + <web>/runner.html and copies the kgx engine in.
Re-run after clean.py / verify.py:  python3 build-runner.py
"""
import json, pathlib, shutil

HERE = pathlib.Path(__file__).parent
QDIR = HERE / "queries"
WEB = HERE.parent.parent / "demos" / "parliament-live" / "web" / "procb"
WEB.mkdir(parents=True, exist_ok=True)

manifest = json.loads((HERE / "manifest.json").read_text())
verdicts = {r["name"]: r["verdict"] for r in json.loads((HERE / "verify-report.json").read_text())}
deltas = json.loads((HERE / "getter-deltas.json").read_text())

records = []
for m in manifest:
    n = m["name"]
    records.append({
        "name": n, "title": m.get("title", n), "link": m.get("link", ""),
        "source": m.get("source", ""),
        "before": (QDIR / f"{n}.before.rq").read_text().rstrip("\n"),
        "after":  (QDIR / f"{n}.after.rq").read_text().rstrip("\n"),
        "verdict": verdicts.get(n, "?"),
        "getter": deltas.get(n, {}).get("getter_file"),
        "replacements": deltas.get(n, {}).get("replacements", []),
    })
(WEB / "queries.json").write_text(json.dumps(records, ensure_ascii=False), encoding="utf-8")
shutil.copy(HERE.parent.parent / "demos/parliament-live/web/kgx/js/sparql-core.js", WEB / "sparql-core.js")

npass = sum(1 for r in records if r["verdict"] == "alpha-equivalent")
nrep = sum(len(r["replacements"]) for r in records)

HTML = r"""<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>procedure-browser query cleanup — run/review</title>
<style>
 :root{--bg:#faf8f3;--ink:#1a1a1a;--soft:#4a4a4a;--accent:#2a4f76;--rule:#d8d4ca;
   --code:#2b2b36;--alt:#f4f1ea;--before:#9a5b00;--after:#1b6b3a;--ok:#1b6b3a;--warn:#9a5b00;}
 *{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--ink)}
 body{font:16px/1.5 -apple-system,BlinkMacSystemFont,system-ui,"Segoe UI",sans-serif;max-width:960px;margin:0 auto;padding:14px}
 a{color:var(--accent)}nav{font-size:13px;color:var(--soft);margin-bottom:8px}
 h1{font-size:20px;margin:4px 0}.sub{color:var(--soft);font-size:14px;margin:0 0 10px}
 .badge{display:inline-block;background:#fde68a;color:#7c4a03;border:1px solid #f59e0b;border-radius:6px;padding:2px 8px;font-size:12px;font-weight:700}
 .stats{font-size:13px;color:var(--soft);margin:8px 0}
 input[type=search],select{width:100%;padding:10px 12px;border:1px solid var(--rule);border-radius:8px;background:#fff;min-height:44px;font-size:16px;margin-top:6px}
 label{display:block;font-size:13px;color:var(--soft);margin:10px 0 0}
 .meta{font-size:13px;color:var(--soft);margin:6px 2px}
 .v-ok{color:var(--ok);font-weight:600}.v-warn{color:var(--warn);font-weight:600}
 .seg{display:inline-flex;border:1px solid var(--rule);border-radius:8px;overflow:hidden;margin-top:10px}
 .seg button{padding:8px 16px;background:#fff;border:0;border-right:1px solid var(--rule);cursor:pointer;font-size:14px;font-weight:600;color:var(--soft)}
 .seg button:last-child{border-right:0}.seg button[aria-pressed=true]{color:#fff}
 .seg .before[aria-pressed=true]{background:var(--before)}.seg .after[aria-pressed=true]{background:var(--after)}
 .editor{position:relative;margin-top:10px;border-radius:8px;background:var(--code);overflow:hidden}
 .q{margin:0;padding:12px 14px;border:0;width:100%;box-sizing:border-box;font:13px/1.5 ui-monospace,Menlo,Consolas,monospace;white-space:pre;tab-size:2;overflow:auto}
 #hl{position:absolute;inset:0;color:#e6e6e6;pointer-events:none}
 #qin{position:relative;background:transparent;color:transparent;caret-color:#fff;resize:none;min-height:140px;-webkit-text-fill-color:transparent;display:block}
 .t-com{color:#7c9c7c;font-style:italic}.t-kw{color:#c792ea;font-weight:600}.t-iri{color:#82aaff}
 .t-pname{color:#7fd1c4}.t-var{color:#f7b955}.t-str{color:#c3e88d}.t-num{color:#f78c6c}.t-interp{color:#ff5370;font-weight:600}
 .bar{display:flex;gap:10px;align-items:center;margin-top:10px;flex-wrap:wrap}
 button.run{background:var(--accent);color:#fff;border:0;border-radius:8px;padding:11px 20px;font-size:15px;font-weight:600;cursor:pointer;min-height:44px}
 .getter{background:#fff;border:1px solid var(--rule);border-radius:8px;padding:8px 12px;margin-top:10px;font-size:13px}
 .getter code{background:var(--alt);padding:1px 5px;border-radius:4px;font-size:12.5px}
 #out{margin-top:10px}#out table{border-collapse:collapse;width:100%;font-size:13px;display:block;overflow-x:auto}
 #out th,#out td{text-align:left;padding:6px 9px;border-bottom:1px solid var(--rule);white-space:nowrap}
 #out th{background:var(--code);color:#e6e6e6;font-size:11px;text-transform:uppercase}
 #out tr:nth-child(even) td{background:var(--alt)}#out a{color:var(--accent);text-decoration:none}
 footer{margin-top:18px;border-top:1px solid var(--rule);padding-top:10px;color:var(--soft);font-size:12px}
</style></head><body>
<nav><a href="/kgx/">kgx</a> &middot; procb &middot; <a href="/sparqling/run1/runner.html">run1</a></nav>
<h1>procedure-browser query cleanup <span class="badge">unreviewed prototype</span></h1>
<p class="sub">All 130 SPARQL queries from
<a href="https://github.com/ukparliament/procedure-browser/tree/main/lib/sparql/queries" target="_blank" rel="noopener">ukparliament/procedure-browser</a>,
cleaned to the house style. Flip <b>before/after</b>, run against the public
endpoint, and see the getter change each rename implies. A read-only mirror &mdash; no PRs.</p>
<p class="stats">__STATS__</p>

<label for="filter">Filter</label>
<input type="search" id="filter" placeholder="type to filter 130 queries by name or title&hellip;">
<select id="pick" size="1"></select>
<p class="meta" id="meta"></p>

<div class="seg" role="group">
  <button class="before" id="vb" aria-pressed="false">before</button>
  <button class="after" id="va" aria-pressed="true">after (cleaned)</button>
</div>
<div class="editor"><pre class="q" id="hl" aria-hidden="true"></pre><textarea class="q" id="qin" spellcheck="false" autocapitalize="off" autocomplete="off" wrap="off"></textarea></div>
<div class="bar"><button class="run" id="run">Run &#9656;</button><span class="meta" id="ep"></span></div>
<div class="getter" id="getter" hidden></div>
<div class="meta" id="status"></div>
<div id="out"></div>

<footer>Engine: vendored <code>kgx/js/sparql-core.js</code>. Endpoint: public UK Parliament SPARQL
(<code>api.parliament.uk/sparql</code>). Template queries contain <span class="t-interp">#{holes}</span>
filled by the app at runtime; here they are substituted with a placeholder, so they parse and run but
return no rows without a real id. Contains Parliamentary information licensed under the
<a href="https://www.parliament.uk/site-information/copyright-parliament/open-parliament-licence/" target="_blank" rel="noopener">Open Parliament Licence v3.0</a>. Third-party prototype.</footer>

<script src="sparql-core.js"></script>
<script>
const ENDPOINT={id:"parliament-ddp",url:"https://api.parliament.uk/sparql"};
document.getElementById("ep").textContent="GET "+ENDPOINT.url;
const KW=new Set(("PREFIX BASE SELECT DISTINCT REDUCED CONSTRUCT ASK DESCRIBE WHERE FROM NAMED ORDER BY GROUP HAVING LIMIT OFFSET OPTIONAL UNION MINUS GRAPH SERVICE FILTER BIND VALUES AS ASC DESC IN NOT EXISTS COUNT SUM AVG MIN MAX SAMPLE GROUP_CONCAT STR LANG DATATYPE BOUND IRI URI BNODE COALESCE IF REGEX SUBSTR REPLACE YEAR MONTH DAY").split(/\s+/));
const TOK=[["com",/^#\{[^}]*\}/,"interp"],["com",/^#[^\n]*/],["ws",/^\s+/],["str",/^"(?:[^"\\]|\\.)*"(?:@[\w-]+|\^\^[^\s,)\]]+)?/],["iri",/^<[^>\s]*>/],["var",/^[?$][A-Za-z_]\w*/],["pname",/^[A-Za-z_][\w.-]*:[\w.%/-]*|^:[\w.%/-]*/],["num",/^[+-]?\d+\.?\d*/],["word",/^[A-Za-z_]\w*/],["punc",/^[\s\S]/]];
function esc(s){return s.replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]))}
function hl(src){let o="",i=0;while(i<src.length){let m=null,t=null,cls=null;for(const e of TOK){const mm=e[1].exec(src.slice(i));if(mm){m=mm[0];t=e[0];cls=e[2]||e[0];break}}if(t==="ws")o+=esc(m);else if(t==="word"){o+=KW.has(m.toUpperCase())?'<span class="t-kw">'+esc(m)+'</span>':esc(m)}else if(t==="punc")o+=esc(m);else o+='<span class="t-'+cls+'">'+esc(m)+'</span>';i+=m.length}return o}

let DATA=[],view=[],cur=0,ver="after";
const $=id=>document.getElementById(id);
function syncHL(){$("hl").innerHTML=hl($("qin").value)+"\n";$("qin").style.height="auto";$("qin").style.height=$("qin").scrollHeight+"px"}
$("qin").addEventListener("input",syncHL);
$("qin").addEventListener("scroll",()=>{$("hl").scrollTop=$("qin").scrollTop;$("hl").scrollLeft=$("qin").scrollLeft});
function renderPick(){const f=$("filter").value.toLowerCase();view=DATA.filter(d=>(d.name+" "+d.title).toLowerCase().includes(f));$("pick").innerHTML=view.map((d,i)=>'<option value="'+i+'">'+esc(d.title)+'  ('+d.name+')</option>').join("");if(view.length){cur=0;$("pick").value=0;load()}else{$("meta").textContent="no match"}}
function load(){const d=view[cur];if(!d)return;const ok=d.verdict==="alpha-equivalent";$("meta").innerHTML='<a href="'+d.source+'" target="_blank" rel="noopener">'+d.name+'.rb</a> &middot; '+(ok?'<span class="v-ok">&#10003; proven &alpha;-equivalent</span>':'<span class="v-warn">&#9888; '+d.verdict+' (source doesn’t parse in Jena)</span>');$("vb").setAttribute("aria-pressed",ver==="before");$("va").setAttribute("aria-pressed",ver==="after");$("qin").value=d[ver];syncHL();const g=$("getter");if(d.replacements&&d.replacements.length){g.hidden=false;g.innerHTML='<b>Getter change</b> &mdash; <code>'+esc(d.getter)+'</code>:<br>'+d.replacements.map(r=>'<code>'+esc(r.from)+'</code> &rarr; <code>'+esc(r.to)+'</code>').join("&nbsp; ")}else g.hidden=true}
$("filter").addEventListener("input",renderPick);
$("pick").addEventListener("change",()=>{cur=+$("pick").value;load()});
$("vb").addEventListener("click",()=>{ver="before";load()});
$("va").addEventListener("click",()=>{ver="after";load()});
function desugar(q){return q.replace(/\b(LIMIT|OFFSET)(\s+)#\{[^}]*\}/gi,"$1$2 1").replace(/#\{[^}]*\}/g,"ph")}
$("run").addEventListener("click",async()=>{const b=$("run");b.disabled=true;$("status").textContent="running…";$("out").innerHTML="";try{const res=await SparqlCore.execute(ENDPOINT,desugar($("qin").value));const n=(res.json&&res.json.results&&res.json.results.bindings||[]).length;$("status").textContent=(res.ok?n+" row"+(n===1?"":"s"):"HTTP "+res.status)+(res.ms!=null?" in "+res.ms+" ms":"");SparqlCore.render($("out"),res,{})}catch(e){$("status").textContent="failed: "+e.message}finally{b.disabled=false}});
fetch("queries.json").then(r=>r.json()).then(d=>{DATA=d;renderPick()});
</script></body></html>"""
HTML = HTML.replace("__STATS__",
   f"{len(records)} queries &middot; <b>{npass} proven &alpha;-equivalent</b> &middot; "
   f"{len(records)-npass} unparseable-in-Jena (source bug) &middot; {len(deltas)} renamed &middot; "
   f"{nrep} getter row[] replacements logged")
(WEB / "runner.html").write_text(HTML, encoding="utf-8")
print(f"wrote {WEB}/runner.html + queries.json ({len(records)} queries, {npass} proven, {nrep} getter reps)")
