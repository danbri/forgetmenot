#!/usr/bin/env python3
"""kgx-chain — read a kgx daisychain TriG manifest and print the chain spec.

A lightweight interop demo. Any tool that speaks TriG + SPARQL can load
a chain manifest saved from FPKG's writable Oxigraph and reconstruct
the chain — title, branches, steps in execution order — without any
FPKG client code.

The TriG vocabulary is documented in
docs/kgx/trig-manifest-review.md (Phase 2A) and
docs/kgx/node-flow-design.md.

Usage:
    kgx_chain.py <file.trig>                 # human-readable summary
    kgx_chain.py --json <file.trig>          # spec as JSON (round-trips)
    kgx_chain.py --query "<sparql>" <file.trig>   # arbitrary SPARQL
    cat chain.trig | kgx_chain.py -          # stdin

Dependencies:
    pip install rdflib
"""

import argparse
import json
import sys

try:
    from rdflib import Dataset, Namespace, URIRef
    from rdflib.namespace import RDF, DCTERMS
except ImportError:
    sys.exit("kgx-chain needs rdflib. Install with: pip install rdflib")

# Phase 2A vocabulary. The parser also accepts the Phase-1 namespace
# (https://forgetmenot.local/vocab/kgx/) so chains saved before the
# IRI rationalisation still load cleanly.
KGX        = Namespace("urn:kgx:vocab:")
KGX_LEGACY = Namespace("https://forgetmenot.local/vocab/kgx/")

BUNDLE_KIND_NAMES = ("SourceBundle", "FilterBundle", "PivotBundle", "AugmentBundle")


def load_trig(source):
    """Parse a TriG file or stdin stream into an rdflib Dataset."""
    ds = Dataset()
    if source == "-":
        ds.parse(data=sys.stdin.read(), format="trig")
    else:
        ds.parse(source, format="trig")
    return ds


def find_chain_graph(ds):
    """Pick the manifest graph from a Dataset.

    Convention: the chain's graph IRI is also a subject in its own
    graph carrying a dct:title. There's normally just one named graph
    per manifest file; we pick the first that satisfies the rule.
    """
    for ctx in ds.graphs():
        cid = ctx.identifier
        # rdflib uses one anonymous default graph; skip it.
        if str(cid).startswith("urn:x-rdflib:default"):
            continue
        if (cid, DCTERMS.title, None) in ctx:
            return cid, ctx
    raise ValueError(
        "no chain graph found — expected a named graph asserting its own dct:title"
    )


def _local(uri):
    """Strip the kgx: vocab namespace from a URIRef and return the local name."""
    s = str(uri)
    if s.startswith(str(KGX)):
        return s[len(str(KGX)):]
    if s.startswith(str(KGX_LEGACY)):
        return s[len(str(KGX_LEGACY)):]
    return None


def collect_bundle(graph, subject):
    """Read every kgx: predicate on a bundle subject into a dict."""
    out = {}
    for p, o in graph.predicate_objects(subject):
        local = _local(p)
        if local is None:
            continue
        # Manifest emits each predicate at most once per subject; if
        # that ever changes the duplicates show up as a list.
        if local in out:
            existing = out[local]
            out[local] = (existing if isinstance(existing, list) else [existing]) + [str(o)]
        else:
            out[local] = str(o)
    return out


def all_bundles(graph):
    """Every rdf:type kgx:*Bundle subject in the graph, with its props."""
    bundles = []
    for kind_name in BUNDLE_KIND_NAMES:
        for ns in (KGX, KGX_LEGACY):
            kind_iri = ns[kind_name]
            for s in graph.subjects(RDF.type, kind_iri):
                bundles.append(
                    {"uri": str(s), "kind": kind_name, "props": collect_bundle(graph, s)}
                )
    return bundles


def bundle_to_step(b):
    kind, props = b["kind"], b["props"]
    if kind == "SourceBundle":
        return {"kind": "starter", "id": props["starterId"]}
    if kind == "PivotBundle":
        step = {"kind": "op", "op": "rel-pivot", "template": props["relTemplate"]}
        if "relVariant" in props:
            step["variant"] = props["relVariant"]
        return step
    # FilterBundle and AugmentBundle both carry kgx:op (+ optional opValue).
    step = {"kind": "op", "op": props["op"]}
    if "opValue" in props:
        step["value"] = props["opValue"]
    return step


def walk_branch(bundles, branch_uris):
    """Order one branch's bundles by walking kgx:derivedFrom forward.

    Branch root = the bundle whose derivedFrom either isn't set, or
    points outside the branch (the latter is how forks express their
    parent linkage).
    """
    roots = [
        b for b in bundles
        if b["props"].get("derivedFrom") not in branch_uris
        or "derivedFrom" not in b["props"]
    ]
    if len(roots) != 1:
        raise ValueError(f"branch needs exactly 1 root, got {len(roots)}")
    ordered = [roots[0]]
    while len(ordered) < len(bundles):
        cur_uri = ordered[-1]["uri"]
        nxt = next(
            (b for b in bundles if b["props"].get("derivedFrom") == cur_uri),
            None,
        )
        if not nxt:
            break
        ordered.append(nxt)
    if len(ordered) != len(bundles):
        raise ValueError(
            f"branch graph not connected — walked {len(ordered)} of {len(bundles)}"
        )
    return ordered


def chain_to_spec(chain_iri, graph):
    """Reconstruct a {title, sub, id, steps|branches, activeBranch} spec."""
    title  = graph.value(chain_iri, DCTERMS.title)
    sub    = graph.value(chain_iri, DCTERMS.description)
    cid    = graph.value(chain_iri, DCTERMS.identifier)
    active = (graph.value(chain_iri, KGX.activeBranch)
              or graph.value(chain_iri, KGX_LEGACY.activeBranch))

    bundles = all_bundles(graph)
    if not bundles:
        raise ValueError("no bundles found in chain graph")

    spec = {}
    if title:  spec["title"] = str(title)
    if sub:    spec["sub"]   = str(sub)
    if cid:    spec["id"]    = str(cid)

    is_multi = bool(active) or any("branch" in b["props"] for b in bundles)

    if not is_multi:
        ordered = walk_branch(bundles, {b["uri"] for b in bundles})
        spec["steps"] = [bundle_to_step(b) for b in ordered]
        return spec

    # Multi-branch: group by kgx:branch, walk each branch independently,
    # recover forkedFrom by which sibling branch contains the cross-
    # branch predecessor.
    by_branch = {}
    for b in bundles:
        bid = b["props"].get("branch")
        if not bid:
            raise ValueError(
                f"multi-branch manifest: bundle {b['uri']} missing kgx:branch tag"
            )
        by_branch.setdefault(bid, []).append(b)

    ordered_by_branch = {}
    for bid, bs in by_branch.items():
        ordered_by_branch[bid] = walk_branch(bs, {b["uri"] for b in bs})

    spec_branches = []
    for bid, ordered in ordered_by_branch.items():
        branch = {"id": bid, "steps": [bundle_to_step(b) for b in ordered]}
        root_df = ordered[0]["props"].get("derivedFrom")
        if root_df:
            for pid, p_ordered in ordered_by_branch.items():
                if pid == bid:
                    continue
                for idx, pb in enumerate(p_ordered):
                    if pb["uri"] == root_df:
                        branch["forkedFrom"] = {"branch": pid, "beadIdx": idx}
                        break
                if "forkedFrom" in branch:
                    break
            if "forkedFrom" not in branch:
                raise ValueError(
                    f"branch {bid!r} root derives from {root_df} but no other "
                    f"branch contains that bundle"
                )
        spec_branches.append(branch)

    spec["branches"] = spec_branches
    if active:
        spec["activeBranch"] = str(active)
    return spec


def format_step(s):
    if s["kind"] == "starter":
        return f"source = {s['id']}"
    if s["op"] == "rel-pivot":
        return f"pivot {s['template']}" + (f" / {s['variant']}" if "variant" in s else "")
    if "value" in s:
        return f"{s['op']} = {s['value']!r}"
    return s["op"]


def print_summary(spec):
    print(f"title:   {spec.get('title', '(untitled)')}")
    if spec.get("sub"):
        print(f"sub:     {spec['sub']}")
    if spec.get("id"):
        print(f"id:      {spec['id']}")
    if "branches" in spec:
        active = spec.get("activeBranch")
        print(f"branches ({len(spec['branches'])}, active = {active!r}):")
        for branch in spec["branches"]:
            print(f"  - {branch['id']}")
            if "forkedFrom" in branch:
                ff = branch["forkedFrom"]
                print(f"    forked from {ff['branch']!r} at bead {ff['beadIdx']}")
            for i, step in enumerate(branch["steps"], 1):
                print(f"    {i}. {format_step(step)}")
    else:
        print(f"steps ({len(spec['steps'])}):")
        for i, step in enumerate(spec["steps"], 1):
            print(f"  {i}. {format_step(step)}")


def main(argv=None):
    p = argparse.ArgumentParser(
        description=__doc__.strip().split("\n")[0],
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="See docs/kgx/trig-manifest-review.md for the TriG vocabulary.",
    )
    p.add_argument("file", help="path to a kgx daisychain TriG file ('-' for stdin)")
    g = p.add_mutually_exclusive_group()
    g.add_argument("--json", action="store_true", help="emit chain spec as JSON")
    g.add_argument("--query", metavar="SPARQL",
                   help="run an arbitrary SPARQL query against the manifest")
    args = p.parse_args(argv)

    ds = load_trig(args.file)

    if args.query:
        rows = list(ds.query(args.query))
        if not rows:
            print("(no rows)", file=sys.stderr)
            return
        for row in rows:
            print("\t".join("" if t is None else str(t) for t in row))
        return

    chain_iri, graph = find_chain_graph(ds)
    spec = chain_to_spec(chain_iri, graph)
    if args.json:
        print(json.dumps(spec, indent=2, ensure_ascii=False))
    else:
        print_summary(spec)


if __name__ == "__main__":
    main()
