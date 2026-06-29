#!/usr/bin/env python3
"""Mirror the UK Parliament procedure-browser SPARQL query library.

Fetches every lib/sparql/queries/*.rb from ukparliament/procedure-browser,
pulls the SPARQL string out of each [title, link, query] wrapper, writes it to
queries/<name>.before.rq, and records title/link/classification in manifest.json.

Read-only mirror of a public repo (we have no write access there). Re-run to
refresh:  python3 extract.py
"""
import json, re, urllib.request, textwrap, pathlib, sys

REPO = "ukparliament/procedure-browser"
RAW  = f"https://raw.githubusercontent.com/{REPO}/main/"
HERE = pathlib.Path(__file__).parent
QDIR = HERE / "queries"; QDIR.mkdir(exist_ok=True)

def get(url):
    return urllib.request.urlopen(url, timeout=60).read().decode("utf-8", "replace")

tree = json.loads(get(f"https://api.github.com/repos/{REPO}/git/trees/main?recursive=1"))
files = sorted(e["path"] for e in tree["tree"]
               if e["type"] == "blob"
               and e["path"].startswith("lib/sparql/queries/")
               and e["path"].endswith(".rb"))

def classify(q):
    code = re.sub(r"#[^\n]*", "", q)                      # strip comments first
    has_comments = q.count("#") >= 2
    upper_ok = not re.search(r"\b(select|where|prefix|optional|filter|order\s+by|group\s+by|construct|ask)\b", code)
    # CamelCase variables (uppercase first letter) -> rule-6 rename needed
    camel_vars = sorted(set(re.findall(r"[?$]([A-Z]\w*)", code)))
    decl = set(re.findall(r"PREFIX\s+([\w-]*):", code, re.I))
    used = set(re.findall(r"(?<![\w<])([\w-]*):[\w-]", code))
    unused = sorted(p for p in decl if p and p not in used)
    issues = {}
    if not upper_ok: issues["lower_keywords"] = True
    if not has_comments: issues["no_comments"] = True
    if unused: issues["unused_prefixes"] = unused
    if camel_vars: issues["camel_vars_need_rename"] = camel_vars
    return ("clean" if not issues else "needs-work"), issues

manifest = []
for path in files:
    name = path.split("/")[-1][:-3]            # strip .rb
    src = get(RAW + path)
    # title + link are single-quoted; the query is the one double-quoted string.
    title = (re.search(r"'([^']*)'", src) or [None, name]).__getitem__(1) if "'" in src else name
    links = re.findall(r"'(https?://[^']*)'", src)
    link = links[0] if links else ""
    m = re.search(r'"((?:[^"\\]|\\.)*)"', src, re.S)
    if not m:
        print("  !! no query string in", name, file=sys.stderr); continue
    q = textwrap.dedent(m.group(1).strip("\n")).strip() + "\n"
    (QDIR / f"{name}.before.rq").write_text(q, encoding="utf-8")
    cls, why = classify(q)
    manifest.append({"name": name, "title": title, "link": link,
                     "source": f"https://github.com/{REPO}/blob/main/{path}",
                     "classification": cls, "why": why})

(HERE / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
clean = sum(1 for m in manifest if m["classification"] == "clean")
print(f"extracted {len(manifest)} queries -> {clean} clean / {len(manifest)-clean} needs-work")
