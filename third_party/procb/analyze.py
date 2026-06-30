#!/usr/bin/env python3
"""Mine the procedure-browser query corpus into a schema.

The Parliament ontology encodes domain/range in predicate names
(`workPackageHasBusinessItem` = WorkPackage -> BusinessItem), so we can recover
the model from the 130 queries without a separate ontology file. Emits:

  procedure-ontology.ttl       RDFS/OWL: classes + object/datatype properties
  procedure-shapes.shacl.ttl   SHACL NodeShape per class + PropertyShapes
                               (sh:minCount 1 where the corpus uses a link
                                required, 0 where it is only inside OPTIONAL)
  graph.json                   {nodes:[classes], links:[object props]} for the viz

All derived deterministically from queries/*.after.rq. Re-run: python3 analyze.py
"""
import glob, re, json, pathlib
from collections import defaultdict

HERE = pathlib.Path(__file__).parent
SCHEMA = "https://id.parliament.uk/schema/"

# ---- collect predicates + which are used required vs only-optional ----------
pred_uses = defaultdict(lambda: {"required": False, "optional": False, "count": 0})
asserted_classes = set()

for f in glob.glob(str(HERE / "queries" / "*.after.rq")):
    src = open(f).read()
    for c in re.findall(r"[?$]\w+\s+a\s+:(\w+)", src): asserted_classes.add(c)
    # walk lines tracking OPTIONAL depth (brace based)
    depth = 0; opt_stack = []
    for ln in src.split("\n"):
        s = ln.strip()
        if s.startswith("#"): continue
        opens_opt = bool(re.match(r"OPTIONAL\s*\{", s))
        for p in re.findall(r"(?<![\w<]):([a-z]\w+)", s):
            inside_opt = any(opt_stack)
            pred_uses[p]["count"] += 1
            if inside_opt: pred_uses[p]["optional"] = True
            else: pred_uses[p]["required"] = True
        # update brace depth + optional stack
        for ch in s:
            if ch == "{":
                opt_stack.append(opens_opt); opens_opt = False
            elif ch == "}":
                if opt_stack: opt_stack.pop()

# ---- candidate classes: asserted + every Has/In/IsFrom/IsTo target ----------
# Verbs that separate a domain class from a range class. "In"/"For" are NOT
# included as separators because they occur INSIDE class names
# (StepDisplayDepthInProcedure), which is what produced bogus classes like
# "ProcedureHasDepth" from greedy matching.
LINKWORDS = r"(?:Has|IsFrom|IsTo)"
BOGUS = re.compile(r"(Has|IsFrom|IsTo)[A-Z]")   # a class name must not contain a verb
classes = set(asserted_classes)
for p in pred_uses:
    for m in re.finditer(LINKWORDS + r"([A-Z][a-z]\w*)$", p):  # range = tail after the verb
        classes.add(m.group(1))
# also seed from resolved examples
examples = json.loads((HERE / "slot-examples.json").read_text()) if (HERE / "slot-examples.json").exists() else {}
classes |= set(examples)
classes = {c for c in classes if not BOGUS.search(c)}          # drop any verb-containing pseudo-class
low2cls = {c[0].lower() + c[1:]: c for c in sorted(classes, key=len, reverse=True)}

def domain_of(pred):
    for lc in sorted(low2cls, key=len, reverse=True):
        if pred.startswith(lc): return low2cls[lc], pred[len(lc):]
    return None, pred

object_props = {}   # pred -> (domain, range)
data_props = {}     # pred -> domain
EDGE_VERB = re.compile(r"(?:Has|IsFrom|IsTo|In|For)([A-Z]\w+)$")  # In/For ok here: range is validated
for p in pred_uses:
    dom, rest = domain_of(p)
    m = EDGE_VERB.match(rest)
    if dom and m and m.group(1) in classes:
        object_props[p] = (dom, m.group(1))   # accept only when range is a known class
    else:
        data_props[p] = dom   # may be None for the bare :name / :enabling etc.

# ---- emit ontology.ttl -----------------------------------------------------
def ttl_header():
    return ("@prefix : <%s> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n"
            "@prefix owl: <http://www.w3.org/2002/07/owl#> .\n"
            "@prefix sh: <http://www.w3.org/ns/shacl#> .\n"
            "@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .\n\n" % SCHEMA)

onto = [ttl_header(),
        "# Procedure-browser ontology, MINED from the 130 SPARQL queries in\n"
        "# ukparliament/procedure-browser. Domain/range recovered from predicate\n"
        "# naming + usage; not the authoritative ontology. Unreviewed.\n"]
for c in sorted(classes):
    onto.append(f":{c} a owl:Class .")
onto.append("")
for p,(d,r) in sorted(object_props.items()):
    onto.append(f":{p} a owl:ObjectProperty ; rdfs:domain :{d} ; rdfs:range :{r} .")
onto.append("")
for p,d in sorted(data_props.items()):
    dom = f" rdfs:domain :{d} ;" if d else ""
    onto.append(f":{p} a owl:DatatypeProperty ;{dom} rdfs:range rdfs:Literal .")
(HERE / "procedure-ontology.ttl").write_text("\n".join(onto) + "\n")

# ---- emit SHACL ------------------------------------------------------------
shapes_by_class = defaultdict(list)
for p,(d,r) in object_props.items():
    shapes_by_class[d].append((p, f"sh:class :{r}", pred_uses[p]))
for p,d in data_props.items():
    if d: shapes_by_class[d].append((p, "sh:nodeKind sh:Literal", pred_uses[p]))

shacl = [ttl_header(),
         "# SHACL shapes MINED from the procedure-browser query corpus: the shapes\n"
         "# the app actually relies on. sh:minCount 1 where a link is used required;\n"
         "# 0 where it only ever appears inside OPTIONAL. Unreviewed, corpus-derived.\n"]
for c in sorted(shapes_by_class):
    shacl.append(f":{c}Shape a sh:NodeShape ;\n    sh:targetClass :{c} ;")
    props = sorted(shapes_by_class[c])
    for i,(p, kind, use) in enumerate(props):
        mincount = 1 if (use["required"] and not use["optional"]) else 0
        end = " ." if i == len(props)-1 else " ;"
        shacl.append(f"    sh:property [ sh:path :{p} ; {kind} ; sh:minCount {mincount} ]{end}")
    shacl.append("")
(HERE / "procedure-shapes.shacl.ttl").write_text("\n".join(shacl) + "\n")

# ---- emit graph.json for the viz -------------------------------------------
deg = defaultdict(int)
for p,(d,r) in object_props.items(): deg[d]+=pred_uses[p]["count"]; deg[r]+=pred_uses[p]["count"]
nodes = [{"id": c, "label": c, "weight": deg.get(c,1),
          "example": examples.get(c,"").split("/")[-1]} for c in sorted(classes)]
links = [{"source": d, "target": r, "label": p, "count": pred_uses[p]["count"]}
         for p,(d,r) in sorted(object_props.items())]
data_attrs = defaultdict(list)
for p,d in data_props.items():
    if d: data_attrs[d].append(p)
(HERE / "graph.json").write_text(json.dumps(
    {"nodes": nodes, "links": links, "dataProps": {k:sorted(v) for k,v in data_attrs.items()}},
    ensure_ascii=False, indent=1))

print(f"classes={len(classes)}  object_props={len(object_props)}  data_props={len(data_props)}")
print("wrote procedure-ontology.ttl, procedure-shapes.shacl.ttl, graph.json")
