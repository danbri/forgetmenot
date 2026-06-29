#!/usr/bin/env python3
"""Verify every queries/<name>.before.rq vs <name>.after.rq is alpha-equivalent
(same query up to a consistent variable renaming) using Apache Jena ARQ's
algebra + the skill's sse-canon.py --alpha canonicaliser.

Writes verify-report.json and prints a summary. Exit 1 if any pair fails.
"""
import json, subprocess, pathlib, os, sys

HERE = pathlib.Path(__file__).parent
QDIR = HERE / "queries"
CANON = HERE.parent.parent / "skills" / "sparqling-cleanup" / "bin" / "sse-canon.py"
JENA = pathlib.Path(os.path.expanduser("~/.cache/forgetmenot/jena-5.4.0/apache-jena-5.4.0/bin/qparse"))

import re, tempfile
def desugar(text):
    """Replace Ruby template holes #{...} with valid SPARQL tokens so the
    template parses. Identical substitution in before+after, so equivalence is
    unaffected. LIMIT/OFFSET need an integer; a prefixed-name local part needs a
    name; bare holes get a name too."""
    text = re.sub(r"\b(LIMIT|OFFSET)(\s+)#\{[^}]*\}", r"\1\g<2>1", text, flags=re.I)
    text = re.sub(r"#\{[^}]*\}", "ph", text)     # e.g. id:#{procedure_id} -> id:ph
    return text

def algebra_alpha(path):
    src = desugar(pathlib.Path(path).read_text())
    tf = tempfile.NamedTemporaryFile("w", suffix=".rq", delete=False)
    tf.write(src); tf.close(); path = tf.name
    op = subprocess.run([str(JENA), "--query", str(path), "--print=op"],
                        capture_output=True, text=True)
    os.unlink(path)
    if op.returncode != 0:
        return None, op.stderr.strip().splitlines()[-1] if op.stderr else "parse error"
    canon = subprocess.run([sys.executable, str(CANON), "--alpha"],
                           input=op.stdout, capture_output=True, text=True)
    return canon.stdout.strip(), None

def main():
    if not JENA.exists():
        sys.exit(f"Jena qparse not found at {JENA} — run the skill's sparql-equiv.sh once to download it.")
    manifest = json.loads((HERE / "manifest.json").read_text())
    report, npass, nfail, nerr = [], 0, 0, 0
    for m in manifest:
        name = m["name"]
        a, ea = algebra_alpha(QDIR / f"{name}.before.rq")
        b, eb = algebra_alpha(QDIR / f"{name}.after.rq")
        if ea or eb:
            verdict = "parse-error"; nerr += 1
            report.append({"name": name, "verdict": verdict, "before_err": ea, "after_err": eb})
        elif a == b:
            verdict = "alpha-equivalent"; npass += 1
            report.append({"name": name, "verdict": verdict})
        else:
            verdict = "DIFFERS"; nfail += 1
            report.append({"name": name, "verdict": verdict})
    (HERE / "verify-report.json").write_text(json.dumps(report, indent=1), encoding="utf-8")
    print(f"{len(manifest)} pairs: {npass} alpha-equivalent, {nfail} DIFFER, {nerr} parse-error")
    if nfail or nerr:
        print("\nnot-equivalent / errored:")
        for r in report:
            if r["verdict"] != "alpha-equivalent":
                print(" ", r["verdict"], r["name"], r.get("before_err") or "", r.get("after_err") or "")
    sys.exit(1 if (nfail or nerr) else 0)

if __name__ == "__main__":
    main()
