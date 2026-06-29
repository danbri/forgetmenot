#!/usr/bin/env python3
"""Deterministically clean each queries/<name>.before.rq into <name>.after.rq,
following the procedure-browser house style:

  * SPARQL keywords/functions UPPER-CASED
  * PREFIX declarations that are never used are dropped
  * variables lower-camelCased (?Paper -> ?paper) per checklist rule 6
  * consistent brace-depth indentation; blank-line noise collapsed
  * existing comments preserved verbatim

Variable lower-casing renames RETURNED columns, so for every query we also log
the getter file (lib/sparql/get/<name>.rb) and the row['Old'] -> row['new']
search/replace it implies, into getter-deltas.json.

Meaning is preserved up to consistent variable renaming (alpha-equivalence);
verify with verify.py after running this.
"""
import json, re, pathlib, urllib.request

HERE = pathlib.Path(__file__).parent
QDIR = HERE / "queries"
REPO = "ukparliament/procedure-browser"
GET_RAW = f"https://raw.githubusercontent.com/{REPO}/main/lib/sparql/get/"

KEYWORDS = set("""PREFIX BASE SELECT DISTINCT REDUCED CONSTRUCT ASK DESCRIBE WHERE FROM NAMED
ORDER BY GROUP HAVING LIMIT OFFSET OPTIONAL UNION MINUS GRAPH SERVICE FILTER BIND VALUES AS
ASC DESC IN NOT EXISTS COUNT SUM AVG MIN MAX SAMPLE GROUP_CONCAT SEPARATOR STR LANG LANGMATCHES
DATATYPE BOUND IRI URI BNODE RAND ABS CEIL FLOOR ROUND CONCAT STRLEN UCASE LCASE CONTAINS
STRSTARTS STRENDS STRBEFORE STRAFTER ENCODE_FOR_URI YEAR MONTH DAY HOURS MINUTES SECONDS
TIMEZONE TZ NOW UUID STRUUID MD5 SHA1 SHA256 SHA384 SHA512 COALESCE IF STRLANG STRDT SAMETERM
ISIRI ISURI ISBLANK ISLITERAL ISNUMERIC REGEX SUBSTR REPLACE""".split())
# 'a' (rdf:type shorthand) is intentionally left lower-case.

# ---- lexer -----------------------------------------------------------------
TOKEN = [
    ("interp", re.compile(r"#\{[^}]*\}")),   # Ruby template hole — opaque, before comment rule
    ("com",   re.compile(r"#[^\n]*")),
    ("ws",    re.compile(r"\s+")),
    ("str",   re.compile(r'"(?:[^"\\]|\\.)*"(?:@[\w-]+|\^\^[^\s,)\]]+)?' r"|'(?:[^'\\]|\\.)*'")),
    ("iri",   re.compile(r"<[^>\s]*>")),
    ("var",   re.compile(r"[?$][A-Za-z_]\w*")),
    ("pname", re.compile(r"[A-Za-z_][\w.-]*:[\w.%/-]*|:[\w.%/-]*")),
    ("num",   re.compile(r"[+-]?\d+\.?\d*")),
    ("word",  re.compile(r"[A-Za-z_]\w*")),
    ("punc",  re.compile(r"[^\s]")),
]
def lex(s):
    i, out = 0, []
    while i < len(s):
        for t, rx in TOKEN:
            m = rx.match(s, i)
            if m:
                out.append((t, m.group(0))); i = m.end(); break
        else:
            i += 1
    return out

def clean_query(src):
    toks = lex(src)
    # 1. variable rename map (lower-camel the first letter), collision-safe
    orig_vars = {v for t, v in toks if t == "var"}
    rename = {}
    for v in orig_vars:
        sig, name = v[0], v[1:]
        nn = name[:1].lower() + name[1:]
        cand = sig + nn
        if cand != v and (sig + nn) in orig_vars:   # would collide with a distinct var
            continue                                # leave it; flagged below
        rename[v] = cand
    collisions = sorted(v for v in orig_vars if v not in rename)

    # 2. apply token transforms
    out = []
    for t, x in toks:
        if t == "word" and x.upper() in KEYWORDS:
            out.append((t, x.upper()))
        elif t == "var":
            out.append((t, rename.get(x, x)))
        elif t == "com":
            # keep comments, but rename any ?Var they mention so they don't drift
            out.append((t, re.sub(r"[?$][A-Za-z_]\w*", lambda mm: rename.get(mm.group(0), mm.group(0)), x)))
        else:
            out.append((t, x))   # interp (#{...}), iri, str, pname, num, punc, ws — opaque
    text = "".join(x for _, x in out)

    # 3. drop unused PREFIX declarations (line-based, after upper-casing)
    used_pfx = {p.split(":", 1)[0] for tt, p in out if tt == "pname"}
    def keep(line):
        m = re.match(r"\s*PREFIX\s+([\w-]*):", line)
        return not (m and m.group(1) not in used_pfx)
    lines = [ln for ln in text.split("\n") if keep(ln)]

    # 4. reindent by brace depth; collapse blank runs
    res, depth, blank = [], 0, False
    for ln in lines:
        s = ln.strip()
        if not s:
            if not blank and res: res.append("")
            blank = True; continue
        blank = False
        lead = len(s) - len(s.lstrip("}"))
        res.append("  " * max(0, depth - lead) + s)
        depth = max(0, depth + s.count("{") - s.count("}"))
    return "\n".join(res).strip() + "\n", rename, collisions

def projected_vars(after):
    # vars between SELECT and WHERE (handles "SELECT *", "(expr AS ?v)")
    m = re.search(r"\bSELECT\b(.*?)\bWHERE\b", after, re.S | re.I)
    if not m: return None  # CONSTRUCT/ASK/DESCRIBE etc.
    head = m.group(1)
    if "*" in head: return "*"
    return re.findall(r"\bAS\s+[?$](\w+)|[?$](\w+)", head)

def getter_delta(name, rename):
    """Fetch lib/sparql/get/<name>.rb and find row['Col'] reads that a rename touches."""
    # column = variable without the ? ; rename maps ?Old -> ?new
    col_map = {old[1:]: new[1:] for old, new in rename.items() if old != new}
    try:
        body = urllib.request.urlopen(GET_RAW + name + ".rb", timeout=30).read().decode("utf-8", "replace")
    except Exception:
        return {"getter_file": f"lib/sparql/get/{name}.rb", "getter_found": False,
                "replacements": [{"from": f"row['{o}']", "to": f"row['{n}']"} for o, n in sorted(col_map.items())]}
    reps = []
    for col in re.findall(r"row\[['\"]([^'\"]+)['\"]\]", body):
        if col in col_map:
            reps.append({"from": f"row['{col}']", "to": f"row['{col_map[col]}']"})
    # de-dup, stable
    seen, uniq = set(), []
    for r in reps:
        k = (r["from"], r["to"])
        if k not in seen: seen.add(k); uniq.append(r)
    return {"getter_file": f"lib/sparql/get/{name}.rb", "getter_found": True, "replacements": uniq}

def main():
    manifest = json.loads((HERE / "manifest.json").read_text())
    deltas = {}
    for m in manifest:
        name = m["name"]
        before = (QDIR / f"{name}.before.rq").read_text()
        after, rename, collisions = clean_query(before)
        (QDIR / f"{name}.after.rq").write_text(after, encoding="utf-8")
        renamed = {o: n for o, n in rename.items() if o != n}
        if renamed:
            d = getter_delta(name, rename)
            d["var_renames"] = {o: n for o, n in sorted(renamed.items())}
            if collisions: d["rename_collisions_left_unchanged"] = collisions
            deltas[name] = d
    (HERE / "getter-deltas.json").write_text(json.dumps(deltas, ensure_ascii=False, indent=1), encoding="utf-8")
    nrep = sum(len(d["replacements"]) for d in deltas.values())
    print(f"cleaned {len(manifest)} queries; {len(deltas)} have variable renames; "
          f"{nrep} getter row[] replacements logged")

if __name__ == "__main__":
    main()
