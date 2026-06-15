#!/usr/bin/env python3
"""
Dump legacy UK Parliament Linked Data API /terms (the Thesaurus) to
gzipped N-Quads suitable for loading into Oxigraph or any other
SPARQL 1.1 store.

Source:
  https://lda.data.parliament.uk/terms

Default outputs (relative to repo root):
  third_party/data/parliament-lda-terms/parliament-lda-terms.nq.gz
  third_party/data/parliament-lda-terms/parliament-lda-terms-summary.json

Cache (gitignored, transient):
  cache-parliament-lda-terms/*.ttl

Examples:

  # Smoke test — first page only
  python3 skills/parliament-thesaurus/dump_terms.py --max-pages 1

  # Specific known item
  python3 skills/parliament-thesaurus/dump_terms.py --ids 8193,478018

  # Full crawl, polite (~10–15 min)
  python3 skills/parliament-thesaurus/dump_terms.py --all --sleep 0.25

  # Force the 'all' Elda view (slower/larger but more complete)
  python3 skills/parliament-thesaurus/dump_terms.py --all --view all --sleep 0.25
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Iterable

try:
    from rdflib import BNode, Dataset, Graph, Literal, Namespace, URIRef
    from rdflib.namespace import RDF, RDFS, SKOS
except ImportError:
    print("Missing dependency: rdflib", file=sys.stderr)
    print("Install with: python3 -m pip install rdflib", file=sys.stderr)
    raise


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

TERM_PREFIX = "http://data.parliament.uk/terms/"
LDA_TERMS_TTL = "https://lda.data.parliament.uk/terms.ttl"
LDA_TERM_ITEM_BASE = "https://lda.data.parliament.uk/terms"

PARL = Namespace("http://data.parliament.uk/schema/parl#")

GRAPH_CORE          = URIRef("https://lda.data.parliament.uk/graph/legacy-terms/core")
GRAPH_HIERARCHY     = URIRef("https://lda.data.parliament.uk/graph/legacy-terms/hierarchy")
GRAPH_RELATED       = URIRef("https://lda.data.parliament.uk/graph/legacy-terms/related")
GRAPH_MAPPINGS      = URIRef("https://lda.data.parliament.uk/graph/legacy-terms/mappings")
GRAPH_LABEL_SIDECAR = URIRef("https://lda.data.parliament.uk/graph/legacy-terms/label-sidecar")
GRAPH_OTHER         = URIRef("https://lda.data.parliament.uk/graph/legacy-terms/other")

LABEL_PREDICATES = {
    SKOS.prefLabel,
    SKOS.altLabel,
    SKOS.hiddenLabel,
    RDFS.label,
}

# --- Vocabulary normalisation (applied once here, propagates downstream) ---
# The LDA source emits neither rdf:type on its concepts nor language tags
# on labels. We bake both into the .nq.gz at harvest time so every
# consumer of that file — the fpkg Oxigraph SPARQL store AND the Turtle
# export — gets typed, language-tagged data from this single point.
DEFAULT_LABEL_LANG = "en"
# Per-term language overrides for inherently-foreign labels, keyed by the
# bare term id. Extend as more surface in a fuller crawl.
LANG_OVERRIDE = {
    "436521": "fr",  # 'Aciéries réunies de Burbach-Eich-Dudelange'
}

CORE_PREDICATES = {
    RDF.type,
    SKOS.prefLabel,
    SKOS.altLabel,
    SKOS.hiddenLabel,
    SKOS.notation,
    PARL.isPreferred,
    PARL.skosAttribute,
    PARL.isThesaurusTerm,
}

HIERARCHY_PREDICATES = {
    SKOS.broader,
    SKOS.narrower,
    SKOS.broaderTransitive,
    SKOS.narrowerTransitive,
    SKOS.inScheme,
    SKOS.topConceptOf,
    SKOS.hasTopConcept,
}

RELATED_PREDICATES = {
    SKOS.related,
}

MAPPING_PREDICATES = {
    SKOS.exactMatch,
    SKOS.closeMatch,
    SKOS.broadMatch,
    SKOS.narrowMatch,
    SKOS.relatedMatch,
    PARL.mappedTopic,
    PARL.member,
}

DEFAULT_OUT     = Path("third_party/data/parliament-lda-terms/parliament-lda-terms.nq.gz")
DEFAULT_SUMMARY = Path("third_party/data/parliament-lda-terms/parliament-lda-terms-summary.json")
DEFAULT_CACHE   = Path("cache-parliament-lda-terms")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def eprint(*xs):
    print(*xs, file=sys.stderr, flush=True)


def is_term_uri(x) -> bool:
    return isinstance(x, URIRef) and str(x).startswith(TERM_PREFIX)


def is_blank_in_triple(t) -> bool:
    return any(isinstance(x, BNode) for x in t)


def term_id(x: str) -> str:
    x = x.strip().rstrip("/")
    if x.startswith("http://") or x.startswith("https://"):
        return x.rsplit("/", 1)[-1]
    return x


def build_page_url(page: int, page_size: int, view: str | None) -> str:
    params = {
        "_page": str(page),
        "_pageSize": str(page_size),
    }
    if view:
        params["_view"] = view
    return LDA_TERMS_TTL + "?" + urllib.parse.urlencode(params)


def build_item_url(item_id: str, view: str | None) -> str:
    url = f"{LDA_TERM_ITEM_BASE}/{term_id(item_id)}.ttl"
    if view:
        url += "?" + urllib.parse.urlencode({"_view": view})
    return url


def safe_cache_name(url: str) -> str:
    h = hashlib.sha256(url.encode("utf-8")).hexdigest()[:24]
    return h + ".ttl"


def fetch_url(url: str, cache_dir: Path, retries: int, timeout: int, sleep: float) -> str | None:
    """
    Fetch one URL, cache the response, return the text. On failure
    (after all retries exhausted) returns None instead of raising, so
    one slow page can't kill a long crawl. The caller decides what to
    do with a None — for page-walks we skip and move on; for explicit
    --ids we should stop because the user named a specific term.
    """
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_path = cache_dir / safe_cache_name(url)

    if cache_path.exists() and cache_path.stat().st_size > 0:
        return cache_path.read_text(encoding="utf-8", errors="replace")

    headers = {
        "User-Agent": "forgetmenot/parliament-thesaurus-dumper (https://github.com/danbri/forgetmenot)",
        "Accept": "text/turtle, application/rdf+xml;q=0.5, */*;q=0.1",
    }

    last_error = None
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                data = r.read()
            text = data.decode("utf-8", errors="replace")
            cache_path.write_text(text, encoding="utf-8")
            return text
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last_error = exc
            delay = min(30.0, sleep + (2 ** attempt))
            eprint(f"Fetch failed attempt {attempt}/{retries}: {url}")
            eprint(f"  {exc}")
            eprint(f"  sleeping {delay:.1f}s")
            time.sleep(delay)

    eprint(f"Giving up on {url} after {retries} attempts: {last_error}")
    return None


def parse_turtle(text: str, public_id: str) -> Graph:
    g = Graph()
    g.parse(data=text, publicID=public_id, format="turtle")
    return g


def select_data_triples(g: Graph) -> set[tuple]:
    """
    Keep vocabulary-quality data and discard LDA page / list metadata.

    Primary rule:
      keep triples whose subject is http://data.parliament.uk/terms/...

    Secondary rule:
      keep labels for resources referenced by those primary triples,
      so broader / related / exactMatch targets carry their human-readable
      names when the LDA emits them.
    """
    primary = set()
    referenced = set()

    for s, p, o in g:
        if is_term_uri(s):
            primary.add((s, p, o))
            if isinstance(o, URIRef):
                referenced.add(o)

    side_labels = set()
    for s, p, o in g:
        if s in referenced and p in LABEL_PREDICATES:
            side_labels.add((s, p, o))

    return primary | side_labels


def normalize_triples(triples: set[tuple]) -> set[tuple]:
    """
    Bake the vocabulary hygiene the LDA source omits, so it lands in the
    .nq.gz and propagates to every downstream consumer (the Oxigraph
    SPARQL store and the Turtle export) from this single point:

      - type every term node as skos:Concept (the source has no rdf:type);
      - language-tag lexical labels — @en by default, with per-term
        overrides from LANG_OVERRIDE (e.g. term 436521 -> @fr).

    skos:notation and the parl: attribute literals are left untouched:
    they are not lexical labels.
    """
    out: set[tuple] = set()
    concept_terms: set = set()
    for s, p, o in triples:
        if is_term_uri(s):
            concept_terms.add(s)
        if (p in LABEL_PREDICATES
                and isinstance(o, Literal)
                and o.language is None
                and o.datatype is None):
            lang = LANG_OVERRIDE.get(term_id(str(s)), DEFAULT_LABEL_LANG) \
                if is_term_uri(s) else DEFAULT_LABEL_LANG
            o = Literal(str(o), lang=lang)
        out.add((s, p, o))
    for s in concept_terms:
        out.add((s, RDF.type, SKOS.Concept))
    return out


def graph_for_triple(s, p, o) -> URIRef:
    if p in HIERARCHY_PREDICATES:
        return GRAPH_HIERARCHY
    if p in RELATED_PREDICATES:
        return GRAPH_RELATED
    if p in MAPPING_PREDICATES:
        return GRAPH_MAPPINGS
    if p in LABEL_PREDICATES and not is_term_uri(s):
        return GRAPH_LABEL_SIDECAR
    if p in CORE_PREDICATES:
        return GRAPH_CORE
    return GRAPH_OTHER


def quad_line(s, p, o, g) -> str:
    # rdflib's n3() handles URI / literal escaping correctly.
    return f"{s.n3()} {p.n3()} {o.n3()} {g.n3()} .\n"


def line_hash(line: str) -> bytes:
    return hashlib.blake2b(line.encode("utf-8"), digest_size=16).digest()


class GzipWriter:
    """
    Streaming gzipped N-Quads writer. Opens the file lazily on first
    write, so we don't create an empty .gz when --max-pages is used to
    smoke-test without producing output.
    """

    def __init__(self, path: Path):
        self.path = path
        self._fh = None

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()

    def write(self, line: str):
        if self._fh is None:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            # Truncate any prior output. gzip mode 'wt' yields a text-mode
            # gzip stream so we can write str directly.
            self._fh = gzip.open(self.path, "wt", encoding="utf-8", compresslevel=9)
        self._fh.write(line)

    def close(self):
        if self._fh is not None:
            self._fh.close()
            self._fh = None


def write_quads_incremental(
    writer: GzipWriter,
    triples: Iterable[tuple],
    seen: set[bytes],
    stats: dict,
) -> None:
    for s, p, o in triples:
        if is_blank_in_triple((s, p, o)):
            stats["blank_node_triples_skipped"] += 1
            continue

        graph = graph_for_triple(s, p, o)
        line = quad_line(s, p, o, graph)
        h = line_hash(line)

        if h in seen:
            stats["duplicate_quads_skipped"] += 1
            continue

        seen.add(h)
        writer.write(line)

        stats["quads_written"] += 1
        stats["graphs"][str(graph)] = stats["graphs"].get(str(graph), 0) + 1
        stats["predicates"][str(p)] = stats["predicates"].get(str(p), 0) + 1

        if is_term_uri(s):
            stats["term_subjects"].add(str(s))


def renormalize(src: Path, out_path: Path) -> int:
    """
    Re-apply normalize_triples() to an existing .nq.gz without touching the
    network. Drops the named-graph layer, re-derives it deterministically
    via graph_for_triple (predicate -> graph is stable), so the only
    difference from the input is the added/normalised hygiene. The summary
    JSON is left untouched (it records the original crawl, incl. any
    pages_failed the Turtle export reports as PARTIAL).
    """
    eprint(f"Renormalising {src} -> {out_path} (offline, no fetch)")
    with gzip.open(src, "rt", encoding="utf-8") as fh:
        text = fh.read()
    ds = Dataset()
    ds.parse(data=text, format="nquads")
    triples = {(s, p, o) for s, p, o, _g in ds.quads((None, None, None, None))}
    eprint(f"  read {len(triples)} distinct triples")
    triples = normalize_triples(triples)

    seen: set[bytes] = set()
    stats = {"quads_written": 0, "duplicate_quads_skipped": 0,
             "blank_node_triples_skipped": 0, "graphs": {}, "predicates": {},
             "term_subjects": set()}
    tmp = out_path.with_suffix(out_path.suffix + ".tmp")
    with GzipWriter(tmp) as writer:
        write_quads_incremental(writer, triples, seen, stats)
    tmp.replace(out_path)
    eprint(f"  wrote {stats['quads_written']} quads; "
           f"{len(stats['term_subjects'])} term subjects")
    return 0


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.strip().split("\n")[0])
    ap.add_argument("--out", default=str(DEFAULT_OUT),
                    help=f"Gzipped N-Quads output path (default: {DEFAULT_OUT})")
    ap.add_argument("--summary", default=str(DEFAULT_SUMMARY),
                    help=f"Summary JSON path (default: {DEFAULT_SUMMARY})")
    ap.add_argument("--cache-dir", default=str(DEFAULT_CACHE),
                    help=f"Per-URL Turtle cache (default: {DEFAULT_CACHE})")

    ap.add_argument("--renormalize", action="store_true",
                    help="Offline: re-apply normalize_triples() to an existing "
                         ".nq.gz (no network). Use when the LDA endpoint is "
                         "unreachable but the dump needs the latest hygiene.")
    ap.add_argument("--renormalize-from",
                    help="Source .nq.gz for --renormalize (default: --out path).")
    ap.add_argument("--ids", help="Comma-separated term IDs or term IRIs, e.g. 8193,478018")
    ap.add_argument("--all", action="store_true", help="Crawl until an empty page is reached.")
    ap.add_argument("--max-pages", type=int, default=2, help="Used unless --all or --ids is set.")
    ap.add_argument("--page-size", type=int, default=50)
    ap.add_argument("--view", default=None, help="Optional Elda _view value, e.g. all or Thesaurus.")

    ap.add_argument("--sleep", type=float, default=0.25)
    ap.add_argument("--timeout", type=int, default=120)
    ap.add_argument("--retries", type=int, default=4)
    args = ap.parse_args()

    out_path = Path(args.out)
    summary_path = Path(args.summary)
    cache_dir = Path(args.cache_dir)

    if args.renormalize:
        return renormalize(Path(args.renormalize_from or args.out), out_path)

    # Always remove any prior output before starting — we stream into a new
    # gzip in append-protected mode, so a stale file would fail to open.
    if out_path.exists():
        eprint(f"Removing existing output: {out_path}")
        out_path.unlink()

    seen: set[bytes] = set()
    stats = {
        "source": "https://lda.data.parliament.uk/terms",
        "output": str(out_path),
        "view": args.view,
        "page_size": args.page_size,
        "pages_fetched": 0,
        "items_fetched": 0,
        "rdf_triples_seen": 0,
        "data_triples_selected": 0,
        "quads_written": 0,
        "duplicate_quads_skipped": 0,
        "blank_node_triples_skipped": 0,
        "graphs": {},
        "predicates": {},
        "term_subjects": set(),
    }

    with GzipWriter(out_path) as writer:
        if args.ids:
            ids = [x.strip() for x in args.ids.split(",") if x.strip()]
            for raw_id in ids:
                url = build_item_url(raw_id, args.view)
                eprint(f"Fetching item {raw_id}: {url}")
                text = fetch_url(url, cache_dir, args.retries, args.timeout, args.sleep)
                if text is None:
                    # The user named a specific term; if we can't fetch it
                    # the right thing to do is fail loudly, not pretend.
                    raise RuntimeError(f"Failed to fetch requested item {raw_id}")
                g = parse_turtle(text, url)
                selected = normalize_triples(select_data_triples(g))

                stats["items_fetched"] += 1
                stats["rdf_triples_seen"] += len(g)
                stats["data_triples_selected"] += len(selected)

                eprint(f"  parsed {len(g)} RDF triples; selected {len(selected)} data triples")
                write_quads_incremental(writer, selected, seen, stats)
                time.sleep(args.sleep)

        else:
            page = 0
            failed_pages = 0
            MAX_FAILED_PAGES = 10  # absolute backstop — bail out if half a dozen pages all die
            while True:
                if not args.all and page >= args.max_pages:
                    break

                url = build_page_url(page, args.page_size, args.view)
                eprint(f"Fetching page {page}: {url}")

                text = fetch_url(url, cache_dir, args.retries, args.timeout, args.sleep)
                if text is None:
                    failed_pages += 1
                    stats.setdefault("pages_failed", []).append(page)
                    eprint(f"Skipping page {page}; failed_pages={failed_pages}/{MAX_FAILED_PAGES}")
                    if failed_pages >= MAX_FAILED_PAGES:
                        eprint(f"Too many failures ({failed_pages}); aborting crawl")
                        break
                    page += 1
                    time.sleep(args.sleep)
                    continue
                g = parse_turtle(text, url)
                selected = normalize_triples(select_data_triples(g))

                term_subjects_on_page = {
                    str(s) for s, _, _ in selected if is_term_uri(s)
                }

                stats["pages_fetched"] += 1
                stats["rdf_triples_seen"] += len(g)
                stats["data_triples_selected"] += len(selected)

                eprint(
                    f"  parsed {len(g)} RDF triples; "
                    f"selected {len(selected)} data triples; "
                    f"{len(term_subjects_on_page)} term subjects"
                )

                if not selected or not term_subjects_on_page:
                    eprint("No selected term data on this page; stopping.")
                    break

                write_quads_incremental(writer, selected, seen, stats)

                page += 1
                time.sleep(args.sleep)

    # Convert set to stable JSON for the summary file. Keep the first 100
    # subjects as a smoke-test sample; full count separately.
    stats["term_subject_count"] = len(stats["term_subjects"])
    stats["term_subjects"] = sorted(stats["term_subjects"])[:100]
    stats["note"] = (
        "term_subjects contains only the first 100 subjects (sorted) for "
        "compactness; term_subject_count is the full count."
    )

    summary_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.write_text(json.dumps(stats, indent=2, sort_keys=True), encoding="utf-8")

    eprint("")
    eprint(f"Wrote:   {out_path} ({out_path.stat().st_size if out_path.exists() else 0} bytes)")
    eprint(f"Summary: {summary_path}")
    eprint(f"Quads:   {stats['quads_written']}")
    eprint(f"Terms:   {stats['term_subject_count']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
