#!/usr/bin/env python3
"""De-template each cleaned query into an INDICATIVE query (drop the
`#{...}`-pinned FILTERs that tie it to one instance, cap to LIMIT 5) and run it
live against api.parliament.uk/sparql to capture a handful of real bindings.

Writes example-sets.json: { name: {query, vars, rows[], n, error?} }.
This is the raw material; the LLM-written descriptions land in explanations.json
(authored separately on top of this).

Network goes through the agent proxy (same as analyze.py).
"""
import glob, re, json, pathlib, urllib.request, urllib.parse, time, sys
HERE = pathlib.Path(__file__).parent
EP = "https://api.parliament.uk/sparql"

def sparql(q, timeout=40):
    req = urllib.request.Request(EP + "?query=" + urllib.parse.quote(q),
                                 headers={"Accept": "application/sparql-results+json",
                                          "User-Agent": "forgetmenot/procb-examples"})
    return json.loads(urllib.request.urlopen(req, timeout=timeout).read())

def indicative(src):
    """Strip template-pinned FILTERs and comments; cap LIMIT to 5. Returns the
    indicative query, or None if a `#{...}` hole survives somewhere we can't
    safely neutralise (so the query would not parse)."""
    out = []
    for ln in src.split("\n"):
        s = ln.strip()
        if s.startswith("#"):
            continue
        if "#{" in ln:
            if re.match(r"FILTER\b", s, re.I):          # drop the instance-pinning filter
                continue
            ln = re.sub(r"\bLIMIT\s+#\{[^}]*\}", "LIMIT 5", ln, flags=re.I)
            ln = re.sub(r"\bOFFSET\s+#\{[^}]*\}", "", ln, flags=re.I)
            if "#{" in ln:
                return None
        out.append(ln)
    q = "\n".join(out)
    if re.search(r"\bLIMIT\b", q, re.I):
        q = re.sub(r"\bLIMIT\s+\d+", "LIMIT 5", q, flags=re.I)
    else:
        q = q.rstrip() + "\nLIMIT 5"
    return q

def main():
    only = set(sys.argv[1:])  # optional: restrict to named queries
    out = {}
    files = sorted(glob.glob(str(HERE / "queries" / "*.after.rq")))
    for f in files:
        name = pathlib.Path(f).name[:-len(".after.rq")]
        if only and name not in only:
            continue
        q = indicative(open(f).read())
        if q is None:
            out[name] = {"skip": "unresolved template"}
            continue
        rec = {"query": q}
        try:
            res = sparql(q)
            rec["vars"] = res.get("head", {}).get("vars", [])
            bnds = res.get("results", {}).get("bindings", [])[:5]
            rec["rows"] = [{k: v.get("value") for k, v in b.items()} for b in bnds]
            rec["n"] = len(rec["rows"])
        except Exception as e:
            rec["error"] = str(e)[:200]
            rec["n"] = 0
        out[name] = rec
        flag = rec.get("error") or f"{rec.get('n',0)} rows"
        print(f"{name:55s} {flag}")
        time.sleep(0.25)
    (HERE / "example-sets.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
    good = [k for k, v in out.items() if v.get("n")]
    print(f"\nwrote example-sets.json — {len(good)}/{len(out)} returned >=1 row")

if __name__ == "__main__":
    main()
