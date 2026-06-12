#!/usr/bin/env python3
"""kgx-chain — read a kgx daisychain TriG manifest and report what's in it.

A lightweight interop demo. Any tool that speaks TriG + SPARQL can load
a chain manifest saved from FPKG's writable Oxigraph and reconstruct
the chain — title, branches, steps in execution order — without any
FPKG client code.

The tool tries to be honest about a real limitation of today's
manifests: they describe the chain's *structural shape* (lineage,
branch tree, op names) but rarely the *grounding* that would let a
third-party tool actually execute the chain. Grounding means: which
SPARQL endpoint, which property / class IRIs, which actual SPARQL
fragment per step, and which steps fused into a single engine call.

When a bead carries grounding (`kgx:gloss`, `kgx:queryAgainst`,
`kgx:sparqlFragment`, `kgx:executedBy`, `kgx:variants` /
`kgx:activeVariant`), this tool surfaces it. When a bead doesn't, the
tool says so — explicitly marking the bead "ungrounded" rather than
silently glossing the absence as a normal chain. The grounding
vocabulary itself is endpoint-agnostic: every target is just an
`sd:Service` (W3C SPARQL Service Description). The tool privileges no
specific KG; pointing at Wikidata, Parliament DDP, GeoNames, or an
in-house Stardog is the same shape.

Vocabulary references:
    - docs/kgx/trig-manifest-review.md  (Phase 2A IRI shape — landed)
    - docs/kgx/slim-channel-dataflow.md (slim-channel, DISCUSSION ONLY)

Usage:
    kgx_chain.py <file.trig>                 # human-readable summary
    kgx_chain.py --json <file.trig>          # spec as JSON
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
    from rdflib.collection import Collection
    from rdflib.namespace import RDF, DCTERMS
except ImportError:
    sys.exit("kgx-chain needs rdflib. Install with: pip install rdflib")

KGX = Namespace("urn:kgx:vocab:")
# W3C SPARQL Service Description — the generic way to describe any
# SPARQL endpoint. The kgx vocab deliberately does NOT define per-KG
# classes (no kgx:WikidataSource etc.); a target is just an sd:Service
# with an sd:endpoint URL, whatever its origin.
SD = Namespace("http://www.w3.org/ns/sparql-service-description#")

BUNDLE_KIND_NAMES = ("SourceBundle", "FilterBundle", "PivotBundle", "AugmentBundle")

# Grounding predicates a bead MAY carry (Phase 2D candidate vocabulary,
# currently DISCUSSION ONLY in the manifest-review doc). The tool
# reports which are present per bead and which are absent — silent
# omission would be exactly the dishonesty rule 11 warns against.
GROUNDING_PREDS_OPTIONAL = (
    "gloss",            # natural-language description
    "sparql",           # the whole SPARQL query (for source / augment steps)
    "sparqlFragment",   # a triple-pattern fragment fusable into a sibling query
    "queryAgainst",     # an sd:Service node (resolves to sd:endpoint IRI)
    "activeVariant",    # integer index into kgx:variants
    "variants",         # rdf:List of alternative groundings
    "executedBy",       # the kgx:Execution this bead participated in
)


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
        if str(cid).startswith("urn:x-rdflib:default"):
            continue
        if (cid, DCTERMS.title, None) in ctx:
            return cid, ctx
    raise ValueError(
        "no chain graph found — expected a named graph asserting its own dct:title"
    )


def _local(uri):
    s = str(uri)
    if s.startswith(str(KGX)):
        return s[len(str(KGX)):]
    return None


def _resolve_endpoint(graph, node):
    """If `node` is an sd:Service blank node, return its sd:endpoint URL.

    If `node` is itself a URIRef pointing at an endpoint (some
    manifests may inline the URL directly), return that. Otherwise
    None — we don't guess.
    """
    if node is None:
        return None
    ep = graph.value(node, SD.endpoint)
    if ep:
        return str(ep)
    if isinstance(node, URIRef):
        s = str(node)
        if s.startswith(("http://", "https://")):
            return s
    return None


def _read_variants(graph, list_node):
    """Walk an rdf:List of variant blank nodes; collect each variant's
    label + sparqlFragment + any other kgx predicates set on it."""
    if list_node is None:
        return []
    try:
        coll = Collection(graph, list_node)
    except Exception:
        return []
    out = []
    for v in coll:
        entry = {}
        for p, o in graph.predicate_objects(v):
            local = _local(p)
            if local is None:
                continue
            entry[local] = str(o)
        out.append(entry)
    return out


def step_grounding(graph, subject):
    """Pull out the grounding properties for a bundle subject. Only
    present fields are returned — absences are surfaced by what's
    *missing* from the dict, not by null sentinels.
    """
    g = {}
    gloss = graph.value(subject, KGX.gloss)
    if gloss is not None:
        g["gloss"] = str(gloss)

    sparql = graph.value(subject, KGX.sparql)
    if sparql is not None:
        g["sparql"] = str(sparql)

    fragment = graph.value(subject, KGX.sparqlFragment)
    if fragment is not None:
        g["sparqlFragment"] = str(fragment)

    qa = graph.value(subject, KGX.queryAgainst)
    if qa is not None:
        ep = _resolve_endpoint(graph, qa)
        if ep:
            g["endpoint"] = ep

    eb = graph.value(subject, KGX.executedBy)
    if eb is not None:
        g["executedBy"] = str(eb)

    av = graph.value(subject, KGX.activeVariant)
    if av is not None:
        try:
            g["activeVariant"] = int(av)
        except (TypeError, ValueError):
            g["activeVariant"] = str(av)

    vs = graph.value(subject, KGX.variants)
    if vs is not None:
        g["variants"] = _read_variants(graph, vs)

    return g


def grounding_status(g):
    """Classify a step's grounding into one of:
        'grounded'   — has at least one of sparql / sparqlFragment / endpoint
        'partial'    — has a gloss or starterId but no concrete query info
        'ungrounded' — has nothing
    Honest about what's missing rather than silently passing absence as 'fine'.
    """
    concrete = any(k in g for k in ("sparql", "sparqlFragment", "endpoint"))
    if concrete:
        return "grounded"
    if "gloss" in g:
        return "partial"
    return "ungrounded"


def find_executions(graph):
    """Every subject with `rdf:type kgx:Execution` and its declared fields.

    A kgx:Execution is the runtime's record of one engine call. When
    fusion happened, an Execution `kgx:fuses` an rdf:List of two or
    more bead IRIs and carries the fused SPARQL that actually ran.
    Beads point back via `kgx:executedBy`.
    """
    out = []
    for s in graph.subjects(RDF.type, KGX.Execution):
        ep = None
        against = graph.value(s, KGX.against)
        if against is not None:
            ep = _resolve_endpoint(graph, against)

        fused_sparql = graph.value(s, KGX.fusedSparql)
        fuses_list = graph.value(s, KGX.fuses)
        fuses = []
        if fuses_list is not None:
            try:
                fuses = [str(b) for b in Collection(graph, fuses_list)]
            except Exception:
                fuses = []

        rows = graph.value(s, KGX.rowsReturned)
        dur = graph.value(s, KGX.durationMs)

        entry = {"iri": str(s)}
        if ep:                       entry["endpoint"]    = ep
        if fused_sparql is not None: entry["fusedSparql"] = str(fused_sparql)
        if fuses:                    entry["fuses"]       = fuses
        if rows is not None:
            try:    entry["rowsReturned"] = int(rows)
            except (TypeError, ValueError): entry["rowsReturned"] = str(rows)
        if dur is not None:
            try:    entry["durationMs"] = int(dur)
            except (TypeError, ValueError): entry["durationMs"] = str(dur)
        out.append(entry)
    return out


def collect_bundle(graph, subject):
    """Read every kgx: predicate on a bundle subject into a string-valued dict.

    Excludes the grounding predicates — those are surfaced via
    `step_grounding()` separately so the spec's `grounding` field is
    structured rather than flat. Branch / lineage predicates stay
    here because they shape the chain topology, not its grounding.
    """
    out = {}
    skip = set(GROUNDING_PREDS_OPTIONAL)
    for p, o in graph.predicate_objects(subject):
        local = _local(p)
        if local is None or local in skip:
            continue
        if local in out:
            existing = out[local]
            out[local] = (existing if isinstance(existing, list) else [existing]) + [str(o)]
        else:
            out[local] = str(o)
    return out


def all_bundles(graph):
    """Every rdf:type kgx:*Bundle subject in the graph with its props and grounding."""
    bundles = []
    for kind_name in BUNDLE_KIND_NAMES:
        for s in graph.subjects(RDF.type, KGX[kind_name]):
            bundles.append({
                "uri":       str(s),
                "kind":      kind_name,
                "props":     collect_bundle(graph, s),
                "grounding": step_grounding(graph, s),
            })
    return bundles


def bundle_to_step(b):
    kind, props = b["kind"], b["props"]
    if kind == "SourceBundle":
        step = {"kind": "starter", "id": props.get("starterId")}
    elif kind == "PivotBundle":
        step = {"kind": "op", "op": "rel-pivot", "template": props.get("relTemplate")}
        if "relVariant" in props:
            step["variant"] = props["relVariant"]
    else:
        step = {"kind": "op", "op": props.get("op")}
        if "opValue" in props:
            step["value"] = props["opValue"]

    g = b.get("grounding") or {}
    if g:
        step["grounding"] = g
    step["grounded"] = grounding_status(g)
    return step


def walk_branch(bundles, branch_uris):
    """Topo-sort one branch's bundles by walking kgx:derivedFrom forward."""
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
    """Reconstruct a {title, sub, id, steps|branches, executions, …} spec."""
    title  = graph.value(chain_iri, DCTERMS.title)
    sub    = graph.value(chain_iri, DCTERMS.description)
    cid    = graph.value(chain_iri, DCTERMS.identifier)
    active = graph.value(chain_iri, KGX.activeBranch)

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
    else:
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

    execs = find_executions(graph)
    if execs:
        spec["executions"] = execs

    return spec


# ----- pretty-printer -------------------------------------------------------

_STATUS_GLYPH = {"grounded": "✓", "partial": "◐", "ungrounded": "⚠"}


def _format_step_head(s):
    """First-line summary of a step, e.g. `party = 'Conservative'`."""
    if s["kind"] == "starter":
        return f"source = {s.get('id') or '(missing kgx:starterId)'}"
    if s["op"] == "rel-pivot":
        head = f"pivot {s.get('template') or '(missing kgx:relTemplate)'}"
        if "variant" in s:
            head += f" / {s['variant']}"
        return head
    if "value" in s:
        return f"{s['op']} = {s['value']!r}"
    return s["op"] or "(missing kgx:op)"


def _print_grounding(g, indent="     "):
    """Multi-line per-bead grounding block. Prints only the fields
    that are present; the calling status line communicates the rest."""
    if "gloss" in g:          print(f"{indent}gloss:     {g['gloss']}")
    if "endpoint" in g:       print(f"{indent}endpoint:  {g['endpoint']}")
    if "sparql" in g:
        sparql = g["sparql"].strip()
        first = sparql.split("\n")[0]
        more  = len(sparql.split("\n")) - 1
        suffix = f"  (+{more} line{'s' if more != 1 else ''})" if more else ""
        print(f"{indent}sparql:    {first}{suffix}")
    if "sparqlFragment" in g:
        print(f"{indent}fragment:  {g['sparqlFragment']}")
    if "executedBy" in g:
        print(f"{indent}executedBy: {g['executedBy']}")
    if "variants" in g:
        active = g.get("activeVariant")
        print(f"{indent}variants ({len(g['variants'])}):")
        for i, v in enumerate(g["variants"]):
            marker = "✓" if i == active else "○"
            label  = v.get("label") or v.get("gloss") or f"variant {i}"
            print(f"{indent}  {marker} {label}")
            if "sparqlFragment" in v:
                print(f"{indent}      fragment: {v['sparqlFragment']}")


def _print_step(i, step, indent="  "):
    status = step.get("grounded", "ungrounded")
    glyph  = _STATUS_GLYPH.get(status, "?")
    print(f"{indent}{i}. {glyph} {_format_step_head(step)}")
    g = step.get("grounding") or {}
    if g:
        _print_grounding(g, indent=indent + "     ")
    if status == "ungrounded":
        print(f"{indent}     ⚠ ungrounded — no gloss, no SPARQL fragment, no endpoint")
        print(f"{indent}       to execute this step a consumer needs the FPKG runtime's")
        print(f"{indent}       interpretation of the bare op label.")
    elif status == "partial":
        print(f"{indent}     ◐ partial — gloss present but no executable grounding")


def print_summary(spec):
    print(f"title:   {spec.get('title', '(untitled)')}")
    if spec.get("sub"): print(f"sub:     {spec['sub']}")
    if spec.get("id"):  print(f"id:      {spec['id']}")

    if "branches" in spec:
        active = spec.get("activeBranch")
        print(f"branches ({len(spec['branches'])}, active = {active!r}):")
        for branch in spec["branches"]:
            print(f"  - {branch['id']}")
            if "forkedFrom" in branch:
                ff = branch["forkedFrom"]
                print(f"    forked from {ff['branch']!r} at bead {ff['beadIdx']}")
            for i, step in enumerate(branch["steps"], 1):
                _print_step(i, step, indent="    ")
    else:
        print(f"steps ({len(spec['steps'])}):")
        for i, step in enumerate(spec["steps"], 1):
            _print_step(i, step)

    execs = spec.get("executions") or []
    if execs:
        print()
        print(f"executions ({len(execs)}):")
        for i, e in enumerate(execs):
            print(f"  {i}. {e['iri']}")
            if "endpoint" in e:    print(f"     against:      {e['endpoint']}")
            if "fuses" in e:       print(f"     fuses:        {len(e['fuses'])} beads — {', '.join(e['fuses'])}")
            if "rowsReturned" in e:print(f"     rowsReturned: {e['rowsReturned']}")
            if "durationMs"   in e:print(f"     durationMs:   {e['durationMs']}")
            if "fusedSparql"  in e:
                sparql = e["fusedSparql"].strip()
                print(f"     fusedSparql:")
                for line in sparql.split("\n"):
                    print(f"       {line}")
    else:
        # Honest: no execution plan recorded. This is the current state
        # of every manifest emitted by chainToTrig today.
        print()
        print("executions: none recorded — the chain has no kgx:Execution plan,")
        print("            so a third-party tool can't tell what actually ran.")


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
