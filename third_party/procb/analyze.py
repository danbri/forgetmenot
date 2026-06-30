#!/usr/bin/env python3
"""Build the procedure schema from the AUTHORITATIVE Parliament ontology.

Domain/range/classes come from the endpoint's published ontology
(rdfs:domain, rdfs:range, owl:ObjectProperty/DatatypeProperty, rdfs:subClassOf)
- NOT from parsing predicate names. The 130 queries are used only to (a) decide
which predicates/classes to include, and (b) supply SHACL cardinality from
required-vs-OPTIONAL usage.

Emits (all corpus-scoped to what the queries touch):
  procedure-ontology.ttl       RDFS/OWL classes + object/datatype properties
  procedure-shapes.shacl.ttl   SHACL NodeShape per class (+ minCount from usage)
  graph.json                   {nodes, links, dataProps} for the viz

The fetched ontology slice is cached in ontology-cache.json. Re-run:
  python3 analyze.py           (delete the cache to re-fetch)
"""
import glob, re, json, pathlib, urllib.request, urllib.parse
from collections import defaultdict

HERE = pathlib.Path(__file__).parent
SCHEMA = "https://id.parliament.uk/schema/"
EP = "https://api.parliament.uk/sparql"

def sparql(q):
    req = urllib.request.Request(EP + "?query=" + urllib.parse.quote(q),
                                 headers={"Accept": "application/sparql-results+json"})
    return json.loads(urllib.request.urlopen(req, timeout=90).read())["results"]["bindings"]

def local(uri): return uri.rsplit("/", 1)[-1].rsplit("#", 1)[-1]

# ---- 1. what the corpus uses ----------------------------------------------
pred_uses = defaultdict(lambda: {"required": False, "optional": False, "count": 0})
asserted = set()
for f in glob.glob(str(HERE / "queries" / "*.after.rq")):
    src = open(f).read()
    for c in re.findall(r"[?$]\w+\s+a\s+:(\w+)", src): asserted.add(c)
    opt_stack = []
    for ln in src.split("\n"):
        s = ln.strip()
        if s.startswith("#"): continue
        opens = bool(re.match(r"OPTIONAL\s*\{", s))
        for p in re.findall(r"(?<![\w<]):([a-z]\w+)", s):
            pred_uses[p]["count"] += 1
            (pred_uses[p].__setitem__("optional", True) if any(opt_stack)
             else pred_uses[p].__setitem__("required", True))
        for ch in s:
            if ch == "{": opt_stack.append(opens); opens = False
            elif ch == "}":
                if opt_stack: opt_stack.pop()
USED_PREDS = sorted(pred_uses)

# ---- 2. fetch the authoritative ontology slice for those predicates --------
cache = HERE / "ontology-cache.json"
if cache.exists():
    onto = json.loads(cache.read_text())
else:
    vals = " ".join(f"<{SCHEMA}{p}>" for p in USED_PREDS)
    dr = sparql(f"""PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      SELECT ?p ?d ?r WHERE {{ VALUES ?p {{ {vals} }}
        OPTIONAL {{ ?p rdfs:domain ?d }} OPTIONAL {{ ?p rdfs:range ?r }} }}""")
    types = sparql(f"""PREFIX owl: <http://www.w3.org/2002/07/owl#>
      SELECT ?p ?t WHERE {{ VALUES ?p {{ {vals} }} ?p a ?t
        FILTER(?t IN (owl:ObjectProperty, owl:DatatypeProperty)) }}""")
    # subClassOf over every class that turns up as a domain/range, to pick the
    # most specific one when the ontology lists a sub+super pair.
    cls = set()
    for b in dr:
        for k in ("d", "r"):
            if k in b and b[k]["value"].startswith(SCHEMA): cls.add(b[k]["value"])
    cvals = " ".join(f"<{c}>" for c in sorted(cls))
    sub = sparql(f"""PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      SELECT ?c ?s WHERE {{ VALUES ?c {{ {cvals} }} ?c rdfs:subClassOf ?s }}""") if cls else []
    onto = {"dr": [{k: v["value"] for k, v in b.items()} for b in dr],
            "types": [{k: v["value"] for k, v in b.items()} for b in types],
            "sub": [{k: v["value"] for k, v in b.items()} for b in sub]}
    cache.write_text(json.dumps(onto, indent=1))

# property kinds
ptype = {local(b["p"]): local(b["t"]) for b in onto["types"]}   # ObjectProperty / DatatypeProperty
# subclass map (transitive) over local names
supers = defaultdict(set)
for b in onto["sub"]:
    if b.get("s","").startswith(SCHEMA): supers[local(b["c"])].add(local(b["s"]))
def is_super(a, b):           # a is a (proper) superclass of b?
    seen, stack = set(), list(supers[b])
    while stack:
        x = stack.pop()
        if x == a: return True
        if x in seen: continue
        seen.add(x); stack += list(supers[x])
    return False
def most_specific(cands):
    cands = sorted(cands)
    return [c for c in cands if not any(c != d and is_super(c, d) for d in cands)]

# collect candidate domains/ranges per predicate
dcand, rcand = defaultdict(set), defaultdict(set)
for b in onto["dr"]:
    p = local(b["p"])
    if b.get("d","").startswith(SCHEMA): dcand[p].add(local(b["d"]))
    if b.get("r","").startswith(SCHEMA): rcand[p].add(local(b["r"]))

object_props, data_props, classes = {}, {}, set(asserted)
for p in USED_PREDS:
    dom = (most_specific(dcand[p]) or [None])[0]
    rng = (most_specific(rcand[p]) or [None])[0]
    if dom: classes.add(dom)
    is_obj = ptype.get(p) == "ObjectProperty" or (rng is not None)
    if is_obj and rng:
        object_props[p] = (dom, rng); classes.add(rng)
    else:
        data_props[p] = dom
no_schema = [p for p in USED_PREDS if p not in dcand and p not in object_props and p not in data_props]

# ---- 3. emit --------------------------------------------------------------
def hdr():
    return ("@prefix : <%s> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n"
            "@prefix owl: <http://www.w3.org/2002/07/owl#> .\n"
            "@prefix sh: <http://www.w3.org/ns/shacl#> .\n\n" % SCHEMA)

onto_ttl = [hdr(),
 "# Procedure-browser schema. Classes + domain/range are the AUTHORITATIVE\n"
 "# Parliament ontology (fetched via rdfs:domain/range from api.parliament.uk/\n"
 "# sparql), scoped to the predicates the 130 queries use. Not invented here.\n"]
for c in sorted(classes): onto_ttl.append(f":{c} a owl:Class .")
onto_ttl.append("")
for p,(d,r) in sorted(object_props.items()):
    dd = f" rdfs:domain :{d} ;" if d else ""
    onto_ttl.append(f":{p} a owl:ObjectProperty ;{dd} rdfs:range :{r} .")
onto_ttl.append("")
for p,d in sorted(data_props.items()):
    dd = f" rdfs:domain :{d} ;" if d else ""
    onto_ttl.append(f":{p} a owl:DatatypeProperty ;{dd} rdfs:range rdfs:Literal .")
(HERE / "procedure-ontology.ttl").write_text("\n".join(onto_ttl) + "\n")

shapes = defaultdict(list)
for p,(d,r) in object_props.items():
    if d: shapes[d].append((p, f"sh:class :{r}", pred_uses[p]))
for p,d in data_props.items():
    if d: shapes[d].append((p, "sh:nodeKind sh:Literal", pred_uses[p]))
sh_ttl = [hdr(),
 "# SHACL shapes: authoritative domain/range (from the published ontology) with\n"
 "# sh:minCount derived from the corpus - 1 where the queries use a link\n"
 "# required, 0 where it only appears inside OPTIONAL. Unreviewed.\n"]
for c in sorted(shapes):
    sh_ttl.append(f":{c}Shape a sh:NodeShape ;\n    sh:targetClass :{c} ;")
    ps = sorted(shapes[c])
    for i,(p,kind,use) in enumerate(ps):
        mc = 1 if (use["required"] and not use["optional"]) else 0
        sh_ttl.append(f"    sh:property [ sh:path :{p} ; {kind} ; sh:minCount {mc} ]{' .' if i==len(ps)-1 else ' ;'}")
    sh_ttl.append("")
(HERE / "procedure-shapes.shacl.ttl").write_text("\n".join(sh_ttl) + "\n")

# ---- subClassOf (is-a) edges, authoritative, to connect the hierarchy -------
# Fetch subClassOf for every class, drop reflexive/owl:Thing, and pull in any
# bridging superclass that has >=2 in-scope subclasses (e.g. :Group) as a node.
def fetch_subclassof(cls_set):
    vals = " ".join(f"<{SCHEMA}{c}>" for c in sorted(cls_set))
    rows = sparql(f"""PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      SELECT ?c ?s WHERE {{ VALUES ?c {{ {vals} }} ?c rdfs:subClassOf ?s
        FILTER(STRSTARTS(STR(?s),"{SCHEMA}")) }}""")
    out = defaultdict(set)
    for b in rows:
        c, s = local(b["c"]["value"]), local(b["s"]["value"])
        if c != s: out[c].add(s)
    return out

subof = fetch_subclassof(classes)
# bridging superclasses (parents shared by >=2 in-scope classes) become nodes too
parent_count = defaultdict(int)
for c, ss in subof.items():
    for s in ss:
        if s not in classes: parent_count[s] += 1
bridges = {s for s, n in parent_count.items() if n >= 2}
allclasses = classes | bridges
subof2 = fetch_subclassof(bridges) if bridges else {}
subclass_links = []
for c, ss in list(subof.items()) + list(subof2.items()):
    for s in sorted(ss):
        if c in allclasses and s in allclasses:
            subclass_links.append({"child": c, "parent": s})

examples = json.loads((HERE / "slot-examples.json").read_text()) if (HERE / "slot-examples.json").exists() else {}
deg = defaultdict(int)
for p,(d,r) in object_props.items():
    deg[d]+=pred_uses[p]["count"]; deg[r]+=pred_uses[p]["count"]
nodes = [{"id":c,"label":c,"weight":max(1,deg.get(c,1)),"example":examples.get(c,"").split("/")[-1],
          "abstract": c in bridges or c not in classes}
         for c in sorted(allclasses)]
links = [{"source":d,"target":r,"label":p,"count":pred_uses[p]["count"]}
         for p,(d,r) in sorted(object_props.items()) if d and r]
dprops = defaultdict(list)
for p,d in data_props.items():
    if d: dprops[d].append(p)
(HERE / "graph.json").write_text(json.dumps(
    {"nodes":nodes,"links":links,"subclass":subclass_links,
     "dataProps":{k:sorted(v) for k,v in dprops.items()}},
    ensure_ascii=False, indent=1))
print(f"subclass(is-a) edges={len(subclass_links)}  bridging superclasses added={sorted(bridges)}")

print(f"classes={len(classes)}  object_props={len(object_props)}  data_props={len(data_props)}")
if no_schema: print(f"predicates with no ontology domain/range ({len(no_schema)}):", ", ".join(no_schema))
print("wrote procedure-ontology.ttl, procedure-shapes.shacl.ttl, graph.json")
