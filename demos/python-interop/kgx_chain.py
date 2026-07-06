#!/usr/bin/env python3
"""kgx-chain — read a kgx daisychain TriG manifest and report what's in it.

A lightweight interop demo. Any tool that speaks TriG + SPARQL can load
a chain manifest saved from FPKG's writable Oxigraph and reconstruct
the chain — title, branches, steps in execution order — without any
FPKG client code.

The tool is honest about today's gaps. Manifests describe a chain's
*structural shape* (lineage, branch tree, op names) but rarely the
*grounding* that would let a third-party tool actually execute the
chain. When a bead carries grounding (`kgx:gloss`, `kgx:queryAgainst`,
`kgx:sparqlFragment`, `kgx:executedBy`, `kgx:variants` /
`kgx:activeVariant`), this tool surfaces it. When a bead doesn't, the
tool says so — explicitly marking the bead "ungrounded" rather than
silently glossing the absence as a normal chain.

The chain model is a DAG over six primitive operators:

    Source / Filter / Pivot / Augment / Union / Intersect / Difference

Filter / Pivot / Augment have one main input (`kgx:input`); Union /
Intersect take an rdf:List of inputs (`kgx:inputs`); Difference takes
a `kgx:main` plus an rdf:List of `kgx:auxiliary` streams to subtract.
`kgx:derivedFrom` is still accepted as a back-compat single-input
predicate. See `docs/kgx/chain-algebra.md` for the full design
(DISCUSSION ONLY).

The grounding vocabulary is endpoint-agnostic: every target is just an
`sd:Service` (W3C SPARQL Service Description). The tool privileges no
specific KG; pointing at Wikidata, Parliament DDP, GeoNames, or an
in-house Stardog is the same shape.

Vocabulary references:
    - docs/kgx/chain-algebra.md         (the algebra + grounding model — DISCUSSION ONLY)
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
SD  = Namespace("http://www.w3.org/ns/sparql-service-description#")

# The six primitive bundle kinds (see docs/kgx/chain-algebra.md §2).
# These are STRUCTURAL roles — Source/Filter/Pivot/Augment for the
# single-input ops, Union/Intersect/Difference for the multi-input
# set ops. Anything else (party-filter, sitting-filter, …) is a
# saved chip — a Filter with a specific grounding under a human label.
BUNDLE_KIND_NAMES = (
    "SourceBundle",
    "FilterBundle",
    "PivotBundle",
    "AugmentBundle",
    "UnionBundle",
    "IntersectBundle",
    "DifferenceBundle",
)

# Which bundle kinds take which input shape. This shapes the topo
# walker's predecessor lookup and the summary renderer.
SINGLE_INPUT_KINDS = ("FilterBundle", "PivotBundle", "AugmentBundle")
SET_OP_SYMMETRIC   = ("UnionBundle", "IntersectBundle")
SET_OP_ASYMMETRIC  = ("DifferenceBundle",)

# Grounding predicates a bead MAY carry. The tool reports which are
# present per bead and which are absent — silent omission would be
# exactly the dishonesty rule 11 warns against.
GROUNDING_PREDS_OPTIONAL = (
    "gloss",
    "sparql",
    "sparqlFragment",
    "queryAgainst",
    "activeVariant",
    "variants",
    "executedBy",
    "produces",              # IRI — what kind of item this bead outputs
    "propertyIri",
    "valueIri",
    "valueLiteral",
)


# ---------------------------------------------------------------------------
# Loading + graph extraction
# ---------------------------------------------------------------------------


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
    graph carrying a dct:title.
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


# ---------------------------------------------------------------------------
# Grounding extraction
# ---------------------------------------------------------------------------


def _resolve_endpoint(graph, node):
    """If `node` is an sd:Service blank node, return its sd:endpoint URL.

    If `node` is itself a URIRef pointing at an endpoint, return that.
    Otherwise None — we don't guess.
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
    kgx: predicates into a dict."""
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

    # What kind of item the bead outputs. The kgx vocab doesn't
    # enumerate types — this is just an IRI. The consumer's UI maps
    # known IRIs (wd:Q5, schema:Person, etc.) to render conventions;
    # unknown types fall through to a generic card.
    produces = graph.value(subject, KGX.produces)
    if produces is not None:
        g["produces"] = str(produces)

    # Typed predicate-and-value form (alternative to sparqlFragment).
    p_iri = graph.value(subject, KGX.propertyIri)
    if p_iri is not None:
        g["propertyIri"] = str(p_iri)
    v_iri = graph.value(subject, KGX.valueIri)
    if v_iri is not None:
        g["valueIri"] = str(v_iri)
    v_lit = graph.value(subject, KGX.valueLiteral)
    if v_lit is not None:
        g["valueLiteral"] = str(v_lit)

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
    """Three-valued status:
        'grounded'   — has at least one concrete grounding
                       (sparql / sparqlFragment / endpoint / propertyIri)
        'partial'    — has a gloss but no executable info
        'ungrounded' — has neither
    """
    concrete = any(k in g for k in ("sparql", "sparqlFragment", "endpoint", "propertyIri"))
    if concrete:
        return "grounded"
    if "gloss" in g:
        return "partial"
    return "ungrounded"


# ---------------------------------------------------------------------------
# Execution records
# ---------------------------------------------------------------------------


def find_executions(graph):
    """Every subject with `rdf:type kgx:Execution` and its declared fields."""
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


# ---------------------------------------------------------------------------
# Bundle collection
# ---------------------------------------------------------------------------


# Edge-shape predicates that connect a bundle to its predecessors. The
# tool reads them all into a flat `inputs` list per bundle; the
# downstream renderer interprets the shape by bundle kind.
EDGE_PREDS = ("input", "main", "derivedFrom")
EDGE_LIST_PREDS = ("inputs", "auxiliary")


def _collect_edges(graph, subject):
    """Walk the input-shaped predicates on a bundle and return a flat
    list of `{role, beadIri}` entries.

    - `kgx:input`        → role='input'
    - `kgx:main`         → role='main'
    - `kgx:derivedFrom`  → role='derivedFrom' (back-compat / unary)
    - `kgx:inputs`       → role='inputs', expanded from rdf:List
    - `kgx:auxiliary`    → role='auxiliary', expanded from rdf:List
    """
    edges = []
    for pred in EDGE_PREDS:
        for o in graph.objects(subject, KGX[pred]):
            edges.append({"role": pred, "iri": str(o)})
    for pred in EDGE_LIST_PREDS:
        list_head = graph.value(subject, KGX[pred])
        if list_head is None:
            continue
        try:
            for o in Collection(graph, list_head):
                edges.append({"role": pred, "iri": str(o)})
        except Exception:
            # Fallback: treat as a single value
            edges.append({"role": pred, "iri": str(list_head)})
    return edges


def collect_bundle(graph, subject):
    """Read every kgx: predicate on a bundle subject into a string-valued
    dict, excluding grounding + edge predicates (surfaced separately)."""
    skip = set(GROUNDING_PREDS_OPTIONAL) | set(EDGE_PREDS) | set(EDGE_LIST_PREDS)
    out = {}
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
    """Every rdf:type kgx:*Bundle subject in the graph, with its props,
    grounding and edges."""
    bundles = []
    for kind_name in BUNDLE_KIND_NAMES:
        for s in graph.subjects(RDF.type, KGX[kind_name]):
            bundles.append({
                "uri":       str(s),
                "kind":      kind_name,
                "props":     collect_bundle(graph, s),
                "grounding": step_grounding(graph, s),
                "edges":     _collect_edges(graph, s),
            })
    return bundles


# ---------------------------------------------------------------------------
# Topology — DAG topo-sort (single-input, fork, full set-op DAG all handled)
# ---------------------------------------------------------------------------


def _predecessor_iris(b):
    """All bead IRIs that flow INTO this bundle, regardless of role."""
    return [e["iri"] for e in b["edges"]]


def topo_sort_dag(bundles):
    """Kahn's algorithm over the input edges. Refuses cycles."""
    by_uri = {b["uri"]: b for b in bundles}
    indeg = {}
    # For every bead, count incoming edges from beads we KNOW about.
    # Unknown predecessors (forwarders, external references) are skipped
    # rather than crashing — the manifest may reference beads that aren't
    # in this graph (forks-from-other-chains case).
    children = {b["uri"]: [] for b in bundles}
    for b in bundles:
        deg = 0
        for pred_iri in _predecessor_iris(b):
            if pred_iri in by_uri:
                deg += 1
                children[pred_iri].append(b["uri"])
        indeg[b["uri"]] = deg

    ready = [b for b in bundles if indeg[b["uri"]] == 0]
    ordered = []
    visited = set()
    while ready:
        # Stable sort: prefer bundles whose URI sorts earliest among ready
        # nodes. Keeps the output deterministic when several nodes are
        # ready simultaneously (the usual case at the start of a DAG).
        ready.sort(key=lambda b: b["uri"])
        cur = ready.pop(0)
        if cur["uri"] in visited:
            continue
        visited.add(cur["uri"])
        ordered.append(cur)
        for child_uri in children[cur["uri"]]:
            indeg[child_uri] -= 1
            if indeg[child_uri] == 0:
                ready.append(by_uri[child_uri])
    if len(ordered) != len(bundles):
        unseen = [b["uri"] for b in bundles if b["uri"] not in visited]
        raise ValueError(
            f"chain DAG has a cycle or unresolvable references; unseen: {unseen}"
        )
    return ordered


def is_dag_shape(bundles):
    """Returns True if the manifest uses any multi-input bead — that's
    the DAG case. Single-input + branches stays in the tree walker so
    the existing fork-shape output is unchanged."""
    for b in bundles:
        if b["kind"] in SET_OP_SYMMETRIC + SET_OP_ASYMMETRIC:
            return True
        edges = [e for e in b["edges"] if e["role"] != "derivedFrom"]
        if any(e["role"] in ("inputs", "auxiliary") for e in edges):
            return True
    return False


# ---------------------------------------------------------------------------
# Tree walker (back-compat single-input + branches)
# ---------------------------------------------------------------------------


def walk_branch(bundles, branch_uris):
    """Topo-sort one branch's bundles by walking single-input edges."""
    def _parent(b):
        for e in b["edges"]:
            if e["role"] in ("input", "derivedFrom", "main") and e["iri"] in branch_uris:
                return e["iri"]
        return None

    roots = [b for b in bundles if _parent(b) is None]
    if len(roots) != 1:
        raise ValueError(f"branch needs exactly 1 root, got {len(roots)}")
    ordered = [roots[0]]
    while len(ordered) < len(bundles):
        cur_uri = ordered[-1]["uri"]
        nxt = next(
            (b for b in bundles if any(
                e["iri"] == cur_uri and e["role"] in ("input", "derivedFrom", "main")
                for e in b["edges"])),
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


# ---------------------------------------------------------------------------
# Spec construction
# ---------------------------------------------------------------------------


def bundle_to_step(b):
    kind, props = b["kind"], b["props"]
    if kind == "SourceBundle":
        step = {"kind": "starter", "id": props.get("starterId")}
    elif kind == "PivotBundle":
        step = {"kind": "op", "op": "rel-pivot", "template": props.get("relTemplate")}
        if "relVariant" in props:
            step["variant"] = props["relVariant"]
    elif kind in SET_OP_SYMMETRIC:
        # Union / Intersect — symmetric, all inputs equal.
        step = {"kind": "op", "op": kind[: -len("Bundle")].lower()}  # 'union'/'intersect'
    elif kind == "DifferenceBundle":
        step = {"kind": "op", "op": "difference"}
    else:
        # FilterBundle / AugmentBundle: kgx:op string label + optional value
        step = {"kind": "op", "op": props.get("op")}
        if "opValue" in props:
            step["value"] = props["opValue"]

    step["uri"]   = b["uri"]
    step["kind_kgx"] = kind
    if b["edges"]:
        step["inputs"] = b["edges"]

    g = b.get("grounding") or {}
    if g:
        step["grounding"] = g
    step["grounded"] = grounding_status(g)
    return step


def chain_to_spec(chain_iri, graph):
    """Reconstruct a spec — {title, sub, id, executions, …} plus either
    `steps` (linear) or `branches` (forks) or `dag` (full multi-input)."""
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

    # Decide layout: full DAG > branched tree > linear.
    if is_dag_shape(bundles):
        ordered = topo_sort_dag(bundles)
        spec["shape"] = "dag"
        spec["dag"]   = [bundle_to_step(b) for b in ordered]
    else:
        is_multi = bool(active) or any("branch" in b["props"] for b in bundles)
        if not is_multi:
            ordered = walk_branch(bundles, {b["uri"] for b in bundles})
            spec["shape"] = "linear"
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
                # Recover forkedFrom from the root's single-input edge
                root_df = next(
                    (e["iri"] for e in ordered[0]["edges"]
                     if e["role"] in ("input", "derivedFrom", "main")),
                    None,
                )
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
                spec_branches.append(branch)

            spec["shape"]    = "branched"
            spec["branches"] = spec_branches
            if active:
                spec["activeBranch"] = str(active)

    execs = find_executions(graph)
    if execs:
        spec["executions"] = execs

    return spec


# ---------------------------------------------------------------------------
# Pretty-printer
# ---------------------------------------------------------------------------


_STATUS_GLYPH = {"grounded": "✓", "partial": "◐", "ungrounded": "⚠"}


def _short_iri(iri, chain_iri_str=None):
    """Trim the chain-IRI prefix for compactness in display."""
    if chain_iri_str and iri.startswith(chain_iri_str + ":"):
        return iri[len(chain_iri_str) + 1:]
    return iri


def _format_step_head(s):
    kind_kgx = s.get("kind_kgx", "")
    if s["kind"] == "starter":
        return f"Source — starterId = {s.get('id') or '(missing kgx:starterId)'}"
    if s["op"] == "rel-pivot":
        head = f"Pivot — template = {s.get('template') or '(missing kgx:relTemplate)'}"
        if "variant" in s:
            head += f" / {s['variant']}"
        return head
    if s["op"] == "union":
        return "Union — items in any input"
    if s["op"] == "intersect":
        return "Intersect — items in every input"
    if s["op"] == "difference":
        return "Difference — items in main, not in auxiliary"
    if kind_kgx == "AugmentBundle":
        return f"Augment — op = {s['op'] or '(missing kgx:op)'}"
    # FilterBundle (the default)
    if "value" in s:
        return f"Filter — op = {s['op']!r}, value = {s['value']!r}"
    return f"Filter — op = {s['op'] or '(missing kgx:op)'}"


def _print_inputs(edges, indent, chain_iri_str=None):
    if not edges:
        return
    by_role = {}
    for e in edges:
        by_role.setdefault(e["role"], []).append(e["iri"])
    role_order = ["input", "main", "inputs", "auxiliary", "derivedFrom"]
    for role in role_order:
        if role not in by_role:
            continue
        iris = [_short_iri(i, chain_iri_str) for i in by_role[role]]
        if len(iris) == 1:
            print(f"{indent}{role}:    {iris[0]}")
        else:
            print(f"{indent}{role}:    [{', '.join(iris)}]")


def _print_grounding(g, indent):
    if "gloss" in g:          print(f"{indent}gloss:     {g['gloss']}")
    if "produces" in g:       print(f"{indent}produces:  {g['produces']}")
    if "endpoint" in g:       print(f"{indent}endpoint:  {g['endpoint']}")
    if "propertyIri" in g:    print(f"{indent}propIri:   {g['propertyIri']}")
    if "valueIri" in g:       print(f"{indent}valueIri:  {g['valueIri']}")
    if "valueLiteral" in g:   print(f"{indent}valueLit:  {g['valueLiteral']!r}")
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


def _print_step(i, step, indent, chain_iri_str=None):
    status = step.get("grounded", "ungrounded")
    glyph  = _STATUS_GLYPH.get(status, "?")
    print(f"{indent}{i}. {glyph} {_format_step_head(step)}")
    inner = indent + "     "
    edges = step.get("inputs") or []
    if edges:
        _print_inputs(edges, inner, chain_iri_str)
    g = step.get("grounding") or {}
    if g:
        _print_grounding(g, inner)
    if status == "ungrounded":
        print(f"{inner}⚠ ungrounded — no gloss, no SPARQL fragment, no endpoint")
        print(f"{inner}  to execute this step a consumer needs the FPKG runtime's")
        print(f"{inner}  interpretation of the bare op label.")
    elif status == "partial":
        print(f"{inner}◐ partial — gloss present but no executable grounding")


def _chain_iri_for_display(spec):
    """Best-effort guess at the chain's IRI prefix, for trimming bead IRIs
    in display. Reads the first bead's URI."""
    nodes = spec.get("dag") or spec.get("steps")
    if not nodes:
        for b in spec.get("branches") or []:
            if b.get("steps"):
                nodes = b["steps"]
                break
    if not nodes:
        return None
    first_uri = nodes[0].get("uri", "")
    # The chain IRI is the prefix before ":bead:"
    if ":bead:" in first_uri:
        return first_uri.split(":bead:")[0]
    return None


def print_summary(spec):
    print(f"title:   {spec.get('title', '(untitled)')}")
    if spec.get("sub"): print(f"sub:     {spec['sub']}")
    if spec.get("id"):  print(f"id:      {spec['id']}")
    shape = spec.get("shape", "linear")
    chain_iri_str = _chain_iri_for_display(spec)

    if shape == "branched":
        active = spec.get("activeBranch")
        print(f"shape:   branched ({len(spec['branches'])} branches, active = {active!r})")
        for branch in spec["branches"]:
            print(f"  - branch {branch['id']}")
            if "forkedFrom" in branch:
                ff = branch["forkedFrom"]
                print(f"    forked from {ff['branch']!r} at bead {ff['beadIdx']}")
            for i, step in enumerate(branch["steps"], 1):
                _print_step(i, step, indent="    ", chain_iri_str=chain_iri_str)
    elif shape == "dag":
        nodes = spec["dag"]
        # Brief summary of the DAG shape
        n_sources = sum(1 for n in nodes if n["kind_kgx"] == "SourceBundle")
        set_ops   = sum(1 for n in nodes if n["kind_kgx"] in SET_OP_SYMMETRIC + SET_OP_ASYMMETRIC)
        print(f"shape:   DAG — {len(nodes)} beads, {n_sources} source(s), {set_ops} set-op(s)")
        for i, step in enumerate(nodes, 1):
            _print_step(i, step, indent="  ", chain_iri_str=chain_iri_str)
    else:
        nodes = spec["steps"]
        print(f"shape:   linear ({len(nodes)} steps)")
        for i, step in enumerate(nodes, 1):
            _print_step(i, step, indent="  ", chain_iri_str=chain_iri_str)

    execs = spec.get("executions") or []
    if execs:
        print()
        print(f"executions ({len(execs)}):")
        for i, e in enumerate(execs):
            print(f"  {i}. {_short_iri(e['iri'], chain_iri_str)}")
            if "endpoint" in e:    print(f"     against:      {e['endpoint']}")
            if "fuses" in e:
                trimmed = [_short_iri(b, chain_iri_str) for b in e["fuses"]]
                print(f"     fuses:        {len(e['fuses'])} beads — {', '.join(trimmed)}")
            if "rowsReturned" in e:print(f"     rowsReturned: {e['rowsReturned']}")
            if "durationMs"   in e:print(f"     durationMs:   {e['durationMs']}")
            if "fusedSparql"  in e:
                sparql = e["fusedSparql"].strip()
                print(f"     fusedSparql:")
                for line in sparql.split("\n"):
                    print(f"       {line}")
    else:
        print()
        print("executions: none recorded — the chain has no kgx:Execution plan,")
        print("            so a third-party tool can't tell what actually ran.")


# ---------------------------------------------------------------------------
# Daisychain 1.0 DAL — plan / run / validate / emit
#
# These verbs mirror demos/python-interop/kgx_core.mjs exactly. The two
# implementations MUST produce byte-identical plans for the same
# (spec, bead) input — tests/test_kgx_conformance.sh enforces this over
# every chain in demos/python-interop/examples/. If you change plan
# output here, change kgx_core.mjs the same way (and vice versa).
# Spec: docs/kgx/daisychain-1.0.md
# ---------------------------------------------------------------------------

# INSERTION ORDER MATTERS — kgx_core.mjs iterates the same order so
# plans compare byte-identical.
KNOWN_PREFIXES = {
    "wd":     "http://www.wikidata.org/entity/",
    "wdt":    "http://www.wikidata.org/prop/direct/",
    "p":      "http://www.wikidata.org/prop/",
    "ps":     "http://www.wikidata.org/prop/statement/",
    "pq":     "http://www.wikidata.org/prop/qualifier/",
    "pqv":    "http://www.wikidata.org/prop/qualifier/value/",
    "psv":    "http://www.wikidata.org/prop/statement/value/",
    "rdf":    "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "rdfs":   "http://www.w3.org/2000/01/rdf-schema#",
    "owl":    "http://www.w3.org/2002/07/owl#",
    "xsd":    "http://www.w3.org/2001/XMLSchema#",
    "schema": "https://id.parliament.uk/schema/",     # Parliament DDP
    "schemaorg": "http://schema.org/",
    "geo":    "http://www.w3.org/2003/01/geo/wgs84_pos#",
    "dct":    "http://purl.org/dc/terms/",
    "foaf":   "http://xmlns.com/foaf/0.1/",
}

# Bead kinds whose kgx:sparqlFragment composes into one SPARQL body.
FUSABLE_KINDS = ("SourceBundle", "FilterBundle", "PivotBundle")


def prepend_prefixes(sparql):
    """Prepend PREFIX declarations for known prefixes the body uses."""
    import re as _re
    declared = {m.lower() for m in _re.findall(r"PREFIX\s+(\w+):", sparql, _re.I)}
    stripped = _re.sub(r"<[^>]*>", " ", sparql)
    stripped = _re.sub(r'"[^"]*"', " ", stripped)
    to_add = []
    for px in KNOWN_PREFIXES:
        if _re.search(rf"\b{px}:", stripped) and px.lower() not in declared:
            to_add.append(px)
    if not to_add:
        return sparql
    header = "\n".join(f"PREFIX {px}: <{KNOWN_PREFIXES[px]}>" for px in to_add)
    return header + "\n" + sparql


def all_nodes(spec):
    if "dag" in spec:
        return spec["dag"]
    if "steps" in spec:
        return spec["steps"]
    if "branches" in spec:
        return [s for b in spec["branches"] for s in b["steps"]]
    return []


def resolve_bead(spec, ref):
    """Full URI, ':<suffix>' / '<suffix>' tail match, or 'last'."""
    nodes = all_nodes(spec)
    if not nodes:
        return None
    if ref in (None, "last"):
        return nodes[-1]
    for n in nodes:
        if n.get("uri") == ref:
            return n
    tail = ref if ref.startswith(":") else ":" + ref
    for n in nodes:
        if (n.get("uri") or "").endswith(tail):
            return n
    return None


def cumulative_beads(spec, bead):
    """Transitively upstream fusable beads on the same endpoint,
    upstream-first. Mirrors kgx_core.mjs cumulativeBeads."""
    endpoint = (bead.get("grounding") or {}).get("endpoint")
    if not endpoint:
        return [bead]
    by_uri = {n["uri"]: n for n in all_nodes(spec)}
    visited, collected = set(), []

    def walk(n):
        if n["uri"] in visited:
            return
        visited.add(n["uri"])
        if n.get("kind_kgx") not in FUSABLE_KINDS:
            return
        g = n.get("grounding") or {}
        if g.get("endpoint") != endpoint or not g.get("sparqlFragment"):
            return
        for e in n.get("inputs") or []:
            parent = by_uri.get(e["iri"])
            if parent:
                walk(parent)
        collected.append(n)

    walk(bead)
    return collected


def plan_bead(spec, bead_ref, limit=50):
    """plan(spec, bead) → {endpoint, sparql, beads}. Mirrors
    kgx_core.mjs planBead — keep byte-identical."""
    bead = resolve_bead(spec, bead_ref)
    if bead is None:
        raise ValueError(f"bead not found: {bead_ref}")
    g = bead.get("grounding") or {}
    if not g.get("endpoint"):
        raise ValueError(f"bead has no endpoint: {bead['uri']}")

    # Augment beads carry a full kgx:sparql — the plan IS that query.
    if g.get("sparql") and not g.get("sparqlFragment"):
        return {
            "endpoint": g["endpoint"],
            "sparql": prepend_prefixes(g["sparql"]),
            "beads": [bead["uri"]],
        }
    if not g.get("sparqlFragment"):
        raise ValueError(f"bead has no sparqlFragment: {bead['uri']}")

    chain = cumulative_beads(spec, bead)
    fused = (
        "SELECT DISTINCT * WHERE {\n"
        + "\n".join("  " + b["grounding"]["sparqlFragment"] for b in chain)
        + f"\n}} LIMIT {limit}"
    )
    return {
        "endpoint": g["endpoint"],
        "sparql": prepend_prefixes(fused),
        "beads": [b["uri"] for b in chain],
    }


def run_plan(plan, timeout=60):
    """Execute a plan against its endpoint; return SPARQL results JSON."""
    import urllib.parse
    import urllib.request
    sep = "&" if "?" in plan["endpoint"] else "?"
    url = plan["endpoint"] + sep + "query=" + urllib.parse.quote(plan["sparql"])
    req = urllib.request.Request(
        url, headers={"Accept": "application/sparql-results+json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def validate_spec(spec):
    """Structural checks. Mirrors kgx_core.mjs validateSpec."""
    issues = []
    nodes = all_nodes(spec)
    if not nodes:
        issues.append({"level": "error", "msg": "spec has no beads"})
    uris = {n["uri"] for n in nodes}
    for n in nodes:
        for e in n.get("inputs") or []:
            if e["iri"] not in uris:
                issues.append({"level": "error",
                               "msg": f"unresolved input {e['iri']} on {n['uri']}"})
        if n.get("grounded") == "ungrounded":
            issues.append({"level": "warn", "msg": f"ungrounded bead {n['uri']}"})
    return {"ok": not any(i["level"] == "error" for i in issues),
            "issues": issues}


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main(argv=None):
    p = argparse.ArgumentParser(
        description=__doc__.strip().split("\n")[0],
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="See docs/kgx/daisychain-1.0.md for the DAL contract.",
    )
    p.add_argument("file", help="path to a kgx daisychain TriG file ('-' for stdin)")
    g = p.add_mutually_exclusive_group()
    g.add_argument("--json", action="store_true", help="emit chain spec as JSON")
    g.add_argument("--query", metavar="SPARQL",
                   help="run an arbitrary SPARQL query against the manifest")
    g.add_argument("--validate", action="store_true",
                   help="structural checks; JSON {ok, issues} to stdout")
    g.add_argument("--plan", metavar="BEAD",
                   help="fused SPARQL plan through BEAD (URI, ':suffix', or 'last'); "
                        "JSON {endpoint, sparql, beads}")
    g.add_argument("--run", metavar="BEAD",
                   help="plan then execute against the endpoint; "
                        "SPARQL results JSON to stdout")
    g.add_argument("--emit", action="store_true",
                   help="re-serialize the manifest graph as normalized TriG")
    p.add_argument("--limit", type=int, default=50,
                   help="row limit for --plan / --run (default 50)")
    p.add_argument("--sparql-only", action="store_true",
                   help="with --plan: print just the SPARQL text, not JSON")
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

    if args.emit:
        # Round-trip: re-serialize the manifest graph as TriG. This is a
        # graph-level normalization (rdflib ordering), not spec→TriG.
        sys.stdout.write(graph.serialize(format="trig"))
        return

    spec = chain_to_spec(chain_iri, graph)

    if args.validate:
        result = validate_spec(spec)
        print(json.dumps(result, indent=2, ensure_ascii=False))
        sys.exit(0 if result["ok"] else 1)

    if args.plan:
        plan = plan_bead(spec, args.plan, limit=args.limit)
        if args.sparql_only:
            print(plan["sparql"])
        else:
            print(json.dumps(plan, indent=2, ensure_ascii=False))
        return

    if args.run:
        plan = plan_bead(spec, args.run, limit=args.limit)
        print(json.dumps(run_plan(plan), indent=2, ensure_ascii=False))
        return

    if args.json:
        print(json.dumps(spec, indent=2, ensure_ascii=False))
    else:
        print_summary(spec)


if __name__ == "__main__":
    main()
