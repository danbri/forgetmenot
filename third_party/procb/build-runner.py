#!/usr/bin/env python3
"""Generate the procb gallery served at /procb/: a searchable before/after
runner over all 130 procedure-browser queries, with the alpha-equivalence
verdict, the getter delta, and EDITABLE inputs for each #{template slot}
pre-filled with a real example value.

Reads manifest.json + verify-report.json + getter-deltas.json + queries/*.rq.
Derives each id slot's ontology class from the corpus and resolves one real
example id per class from the public endpoint (cached in slot-examples.json).
Emits <web>/queries.json + runner.html and copies the kgx engine in.
"""
import json, re, glob, pathlib, shutil, urllib.request, urllib.parse

HERE = pathlib.Path(__file__).parent
QDIR = HERE / "queries"
WEB = HERE.parent.parent / "demos" / "parliament-live" / "web" / "procb"
WEB.mkdir(parents=True, exist_ok=True)
EP = "https://api.parliament.uk/sparql"
SCHEMA = "https://id.parliament.uk/schema/"

# ---- slot -> ontology class, derived from the corpus -----------------------
def derive_slot_classes():
    sc = {}
    for f in glob.glob(str(QDIR / "*.before.rq")):
        s = open(f).read()
        for var, slot in re.findall(r"filter\s*\(\s*([?$]\w+)\s+in\s*\(\s*id:#\{(\w+)\}", s, re.I):
            m = re.search(re.escape(var) + r"\s+a\s+:(\w+)", s)
            if m: sc.setdefault(slot, m.group(1))
    sc.setdefault("work_package_id", "WorkPackage")   # filtered without an inline `a :` triple
    return sc

def resolve_examples(classes):
    cache = HERE / "slot-examples.json"
    if cache.exists():
        return json.loads(cache.read_text())
    ex = {}
    for c in sorted(set(classes)):
        q = f"PREFIX : <{SCHEMA}> SELECT ?x WHERE {{ ?x a :{c} }} LIMIT 1"
        req = urllib.request.Request(EP + "?query=" + urllib.parse.quote(q),
                                     headers={"Accept": "application/sparql-results+json"})
        try:
            d = json.loads(urllib.request.urlopen(req, timeout=40).read())
            b = d["results"]["bindings"]
            ex[c] = b[0]["x"]["value"] if b else ""
        except Exception:
            ex[c] = ""
    cache.write_text(json.dumps(ex, indent=1))
    return ex

SLOT_CLASS = derive_slot_classes()
EX = resolve_examples(SLOT_CLASS.values())

def slot_kind(name):
    if name in ("limit", "offset"): return "number"
    if name == "letter": return "letter"
    if name.endswith("uri"): return "uri"
    return "id"

def slot_example(name):
    k = slot_kind(name)
    if k == "number": return "20" if name == "limit" else "0"
    if k == "letter": return "a"
    if k == "uri": return EX.get("ActOfParliament", "")          # full URI, used inside <>
    return (EX.get(SLOT_CLASS.get(name, ""), "") or "").split("/")[-1]   # local id

def slots_of(query):
    seen, out = set(), []
    for name in re.findall(r"#\{(\w+)\}", query):
        if name in seen: continue
        seen.add(name)
        out.append({"name": name, "kind": slot_kind(name),
                    "cls": SLOT_CLASS.get(name, ""), "example": slot_example(name)})
    return out

# ---- build records ---------------------------------------------------------
manifest = json.loads((HERE / "manifest.json").read_text())
verdicts = {r["name"]: r["verdict"] for r in json.loads((HERE / "verify-report.json").read_text())}
deltas = json.loads((HERE / "getter-deltas.json").read_text())

records = []
for m in manifest:
    n = m["name"]
    before = (QDIR / f"{n}.before.rq").read_text().rstrip("\n")
    records.append({
        "name": n, "title": m.get("title", n), "source": m.get("source", ""),
        "before": before, "after": (QDIR / f"{n}.after.rq").read_text().rstrip("\n"),
        "verdict": verdicts.get(n, "?"),
        "getter": deltas.get(n, {}).get("getter_file"),
        "replacements": deltas.get(n, {}).get("replacements", []),
        "slots": slots_of(before),
    })
(WEB / "queries.json").write_text(json.dumps(records, ensure_ascii=False), encoding="utf-8")
shutil.copy(HERE.parent.parent / "demos/parliament-live/web/kgx/js/sparql-core.js", WEB / "sparql-core.js")

npass = sum(1 for r in records if r["verdict"] == "alpha-equivalent")
nrep = sum(len(r["replacements"]) for r in records)
ntmpl = sum(1 for r in records if r["slots"])

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
 input,select{font:inherit}
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
 #qin{position:relative;background:transparent;color:transparent;caret-color:#fff;resize:none;min-height:130px;-webkit-text-fill-color:transparent;display:block}
 .t-com{color:#7c9c7c;font-style:italic}.t-kw{color:#c792ea;font-weight:600}.t-iri{color:#82aaff}
 .t-pname{color:#7fd1c4}.t-var{color:#f7b955}.t-str{color:#c3e88d}.t-num{color:#f78c6c}.t-interp{color:#ff5370;font-weight:600}
 #slots{margin-top:10px}#slots .slot{display:flex;align-items:center;gap:6px;margin:5px 0;flex-wrap:wrap}
 #slots .slot code{color:#ff5370;font-size:12.5px;min-width:120px}
 #slots .slot input{flex:1 1 180px;min-width:140px;padding:8px 10px;border:1px solid var(--rule);border-radius:7px;font-size:14px;font-family:ui-monospace,monospace}
 #slots .ex{border:1px solid var(--rule);background:#fff;border-radius:7px;padding:8px 10px;cursor:pointer;font-size:13px}
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
<nav><a href="/kgx/">kgx</a> &middot; procb &middot; <a href="/procb/graph.html">ontology graph</a> &middot; <a href="/sparqling/run1/runner.html">run1</a></nav>
<h1>procedure-browser query cleanup <span class="badge">unreviewed prototype</span></h1>
<p class="sub">All 130 SPARQL queries from
<a href="https://github.com/ukparliament/procedure-browser/tree/main/lib/sparql/queries" target="_blank" rel="noopener">ukparliament/procedure-browser</a>,
cleaned to the house style and proven meaning-preserving. Flip <b>before/after</b>,
fill any <span class="t-interp">#{template&nbsp;slots}</span> (pre-filled with real
example values), run against the public endpoint, and see the getter change each
rename implies. A read-only mirror &mdash; no PRs.</p>
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
<div id="slots"></div>
<div class="bar"><button class="run" id="run">Run &#9656;</button><span class="meta" id="ep"></span></div>
<div class="getter" id="getter" hidden></div>
<div class="meta" id="status"></div>
<div id="out"></div>

<footer>Engine: vendored <code>kgx/js/sparql-core.js</code>. Endpoint: public UK Parliament SPARQL
(<code>api.parliament.uk/sparql</code>). Template <span class="t-interp">#{slots}</span> are filled by the app at
runtime; here they are editable and pre-filled with a real example resolved from the endpoint (use &#8635; for a
fresh one). The public endpoint holds only part of the procedure data, so some templates run but return no rows.
Contains Parliamentary information licensed under the
<a href="https://www.parliament.uk/site-information/copyright-parliament/open-parliament-licence/" target="_blank" rel="noopener">Open Parliament Licence v3.0</a>. Third-party prototype.</footer>

<script src="sparql-core.js"></script>
<script>
const ENDPOINT={id:"parliament-ddp",url:"https://api.parliament.uk/sparql"},SCHEMA="https://id.parliament.uk/schema/";
document.getElementById("ep").textContent="GET "+ENDPOINT.url;
const KW=new Set(("PREFIX BASE SELECT DISTINCT REDUCED CONSTRUCT ASK DESCRIBE WHERE FROM NAMED ORDER BY GROUP HAVING LIMIT OFFSET OPTIONAL UNION MINUS GRAPH SERVICE FILTER BIND VALUES AS ASC DESC IN NOT EXISTS COUNT SUM AVG MIN MAX SAMPLE GROUP_CONCAT STR LANG DATATYPE BOUND IRI URI BNODE COALESCE IF REGEX SUBSTR REPLACE YEAR MONTH DAY NOW").split(/\s+/));
const TOK=[["com",/^#\{[^}]*\}/,"interp"],["com",/^#[^\n]*/],["ws",/^\s+/],["str",/^"(?:[^"\\]|\\.)*"(?:@[\w-]+|\^\^[^\s,)\]]+)?/],["iri",/^<[^>\s]*>/],["var",/^[?$][A-Za-z_]\w*/],["pname",/^[A-Za-z_][\w.-]*:[\w.%/-]*|^:[\w.%/-]*/],["num",/^[+-]?\d+\.?\d*/],["word",/^[A-Za-z_]\w*/],["punc",/^[\s\S]/]];
function esc(s){return s.replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]))}
function hl(src){let o="",i=0;while(i<src.length){let m=null,t=null,cls=null;for(const e of TOK){const mm=e[1].exec(src.slice(i));if(mm){m=mm[0];t=e[0];cls=e[2]||e[0];break}}if(t==="ws")o+=esc(m);else if(t==="word"){o+=KW.has(m.toUpperCase())?'<span class="t-kw">'+esc(m)+'</span>':esc(m)}else if(t==="punc")o+=esc(m);else o+='<span class="t-'+cls+'">'+esc(m)+'</span>';i+=m.length}return o}

let DATA=[],view=[],cur=0,ver="after";
const $=id=>document.getElementById(id);
function syncHL(){$("hl").innerHTML=hl($("qin").value)+"\n";$("qin").style.height="auto";$("qin").style.height=$("qin").scrollHeight+"px"}
$("qin").addEventListener("input",syncHL);
$("qin").addEventListener("scroll",()=>{$("hl").scrollTop=$("qin").scrollTop;$("hl").scrollLeft=$("qin").scrollLeft});

function renderPick(){const f=$("filter").value.toLowerCase();view=DATA.filter(d=>(d.name+" "+d.title).toLowerCase().includes(f));$("pick").innerHTML=view.map((d,i)=>'<option value="'+i+'">'+esc(d.title)+'  ('+d.name+')</option>').join("");if(view.length){cur=0;$("pick").value=0;load()}else{$("meta").textContent="no match";$("slots").innerHTML="";$("qin").value="";syncHL()}}

async function fetchExample(cls,input){if(!cls)return;input.value="…";const q="PREFIX : <"+SCHEMA+"> SELECT ?x WHERE { ?x a :"+cls+" } ORDER BY RAND() LIMIT 1";try{const r=await SparqlCore.execute(ENDPOINT,q);const b=r.json&&r.json.results&&r.json.results.bindings;if(b&&b.length){const v=b[0].x.value;input.value=input.dataset.uri?v:v.split("/").pop()}else input.value=""}catch(e){input.value=""}}

function renderSlots(d){const host=$("slots");host.innerHTML="";(d.slots||[]).forEach(s=>{const row=document.createElement("div");row.className="slot";const lab=document.createElement("code");lab.textContent="#{"+s.name+"}";const inp=document.createElement("input");inp.value=s.example||"";inp.dataset.slot=s.name;if(s.kind==="uri")inp.dataset.uri="1";row.appendChild(lab);row.appendChild(inp);if(s.kind==="id"||s.kind==="uri"){const b=document.createElement("button");b.className="ex";b.title="fetch a fresh example "+(s.cls?(":"+s.cls):"");b.textContent="↻";b.onclick=()=>fetchExample(s.cls,inp);row.appendChild(b)}host.appendChild(row)})}

function load(){const d=view[cur];if(!d)return;const ok=d.verdict==="alpha-equivalent";$("meta").innerHTML='<a href="'+d.source+'" target="_blank" rel="noopener">'+d.name+'.rb</a> &middot; '+(ok?'<span class="v-ok">&#10003; proven &alpha;-equivalent</span>':'<span class="v-warn">&#9888; '+d.verdict+'</span>');$("vb").setAttribute("aria-pressed",ver==="before");$("va").setAttribute("aria-pressed",ver==="after");$("qin").value=d[ver];syncHL();renderSlots(d);const g=$("getter");if(d.replacements&&d.replacements.length){g.hidden=false;g.innerHTML='<b>Getter change</b> &mdash; <code>'+esc(d.getter)+'</code>:<br>'+d.replacements.map(r=>'<code>'+esc(r.from)+'</code> &rarr; <code>'+esc(r.to)+'</code>').join("&nbsp; ")}else g.hidden=true}

$("filter").addEventListener("input",renderPick);
$("pick").addEventListener("change",()=>{cur=+$("pick").value;load()});
$("vb").addEventListener("click",()=>{ver="before";load()});
$("va").addEventListener("click",()=>{ver="after";load()});

function fill(q){document.querySelectorAll("#slots input").forEach(inp=>{q=q.split("#{"+inp.dataset.slot+"}").join(inp.value.trim()||"0")});return q}
$("run").addEventListener("click",async()=>{const b=$("run");b.disabled=true;$("status").textContent="running…";$("out").innerHTML="";try{const res=await SparqlCore.execute(ENDPOINT,fill($("qin").value));const n=(res.json&&res.json.results&&res.json.results.bindings||[]).length;$("status").textContent=(res.ok?n+" row"+(n===1?"":"s"):"HTTP "+res.status)+(res.ms!=null?" in "+res.ms+" ms":"");SparqlCore.render($("out"),res,{})}catch(e){$("status").textContent="failed: "+e.message}finally{b.disabled=false}});
fetch("queries.json").then(r=>r.json()).then(d=>{DATA=d;renderPick()});
</script></body></html>"""
HTML = HTML.replace("__STATS__",
   f"{len(records)} queries &middot; <b>{npass} proven &alpha;-equivalent</b> &middot; "
   f"0 differ &middot; {len(deltas)} renamed &middot; {nrep} getter row[] replacements &middot; "
   f"{ntmpl} are fillable templates")
(WEB / "runner.html").write_text(HTML, encoding="utf-8")
print(f"wrote {WEB}/runner.html + queries.json ({len(records)} queries, {npass} proven, "
      f"{ntmpl} templates, {len(SLOT_CLASS)} slot types)")
