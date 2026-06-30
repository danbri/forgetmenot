#!/usr/bin/env python3
"""Emit highlights.json: for every cleaned query and every SHACL shape, the set
of schema predicates and classes it touches. The graph viz uses this to light up
the subgraph a query / shape exercises.

Predicates = lower-camel local names after `:` (object + datatype properties).
Classes    = upper-camel local names after `:`. The `id:` / `rdfs:` prefixes are
excluded by the negative-lookbehind (a prefix label is a word char before `:`).

Network-free — reads queries/*.after.rq and procedure-shapes.shacl.ttl only.
"""
import glob, re, json, pathlib
HERE = pathlib.Path(__file__).parent

PRED = re.compile(r"(?<![\w<]):([a-z]\w+)")
CLS  = re.compile(r"(?<![\w<]):([A-Z]\w+)")

def strip_comments(src):
    return "\n".join(ln for ln in src.split("\n") if not ln.lstrip().startswith("#"))

queries = {}
for f in sorted(glob.glob(str(HERE / "queries" / "*.after.rq"))):
    name = pathlib.Path(f).name[:-len(".after.rq")]
    body = strip_comments(open(f).read())
    queries[name] = {"preds": sorted(set(PRED.findall(body))),
                     "classes": sorted(set(CLS.findall(body)))}

shapes = {}
ttl = (HERE / "procedure-shapes.shacl.ttl").read_text()
for blk in re.split(r"\n(?=:\w+Shape\s+a\s+sh:NodeShape)", ttl):
    m = re.search(r"sh:targetClass\s+:(\w+)", blk)
    if not m:
        continue
    shapes[m.group(1)] = {"preds": sorted(set(re.findall(r"sh:path\s+:(\w+)", blk)))}

out = {"queries": queries, "shapes": shapes}
(HERE / "highlights.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
print(f"queries={len(queries)}  shapes={len(shapes)}")
print("sample query:", next(iter(queries)), queries[next(iter(queries))])
