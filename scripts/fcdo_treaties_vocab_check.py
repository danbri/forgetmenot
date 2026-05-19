#!/usr/bin/env python3
"""Check that fm:* terms emitted by the FCDO lift are declared in fm-vocab.ttl.

Fails non-zero if the extractor emits a predicate or class under
`fm:` that isn't declared in
`third_party/data/fcdo_treaties/extractors/factoids/fm-vocab.ttl`, or
if the vocab file declares a term the extractor never emits. Run
manually or wire into `tests/test_cli.sh` / CI.

    python3 scripts/fcdo_treaties_vocab_check.py

The check parses the extractor source for `FM.<name>` references and
the vocab file for `fm:<name>` declarations, then diffs the two sets.
It does NOT validate the lifted .nq output -- only that the script's
intent and the vocab's declarations match. Run the lift separately
to confirm the emitted data uses what the script names.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

import rdflib

REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT    = REPO_ROOT / "scripts/fcdo_treaties_extract.py"
VOCAB     = REPO_ROOT / "third_party/data/fcdo_treaties/extractors/factoids/fm-vocab.ttl"

FM_NS = "https://forgetmenot.local/vocab#"


def emitted_terms() -> set[str]:
    """Pull every `FM.<name>` reference out of the extractor source."""
    src = SCRIPT.read_text()
    return set(re.findall(r"\bFM\.([A-Za-z][A-Za-z0-9]*)", src))


def declared_terms() -> set[str]:
    """Pull every subject `fm:X` (where X is a local-name under the
    main fm: namespace) out of the vocab Turtle."""
    g = rdflib.Graph()
    g.parse(str(VOCAB), format="turtle")
    out: set[str] = set()
    for s in g.subjects():
        if isinstance(s, rdflib.URIRef) and str(s).startswith(FM_NS):
            local = str(s)[len(FM_NS):]
            if local:
                out.add(local)
    return out


def main() -> int:
    emitted  = emitted_terms()
    declared = declared_terms()

    missing  = sorted(emitted  - declared)   # emitted but not declared
    orphaned = sorted(declared - emitted)    # declared but not emitted

    if not missing and not orphaned:
        print(f"OK: {len(emitted)} terms emitted and declared.")
        return 0

    if missing:
        print(f"FAIL: {len(missing)} term(s) emitted by "
              f"{SCRIPT.name} but NOT declared in {VOCAB.name}:")
        for t in missing:
            print(f"  fm:{t}")
    if orphaned:
        print(f"FAIL: {len(orphaned)} term(s) declared in "
              f"{VOCAB.name} but NOT emitted by {SCRIPT.name}:")
        for t in orphaned:
            print(f"  fm:{t}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
