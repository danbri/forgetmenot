#!/usr/bin/env python3
"""Lift FCDO UKTO catalogue JSON to Turtle + streamed N-Quads under `fm:`.

Reads `third_party/data/fcdo_treaties/records/*.json` and emits one
named graph per treaty whose graph IRI is the UKTO record URL --
same pattern as the gov.uk org-chart corpus.

Per-treaty Turtle goes to `extractors/factoids/<id>.ttl`; the rolled-up
N-Quads file is `extractors/factoids/all.nq`. The rollup is written
**incrementally**, so peak memory stays at one record at a time -- the
full corpus is ~22k records and a one-shot serialisation of every quad
in a single rdflib Dataset blows past 1 GB.

Namespace discipline: every project-invented class and predicate sits
in the forgetmenot vocabulary `fm: <https://forgetmenot.local/vocab#>`,
as codified in `docs/vocab.md`. We do NOT invent under `fcdo:` (FCDO
publishes no such namespace) or any other third-party prefix. The
formal declaration of every term we emit lives in
`extractors/factoids/fm-vocab.ttl`; the conformance check at
`scripts/fcdo_treaties_vocab_check.py` verifies the script and the
vocab file stay in sync.

What the script knows about the data, having read it end-to-end:

  * `parties` are uppercase for sovereign states ("UNITED KINGDOM",
    "DENMARK") and mixed-case for UK overseas territories and Crown
    Dependencies ("Bermuda", "Falkland Islands", "Isle of Man"). The
    casing is signal; we use case-insensitive lookup but preserve the
    raw label as `rdfs:label`.
  * `parties_detail[]` is the rich part: per-party event sequence with
    `action` in {"Signature", "Ratification", "Accession", "Extension",
    "Acceptance", "Declaration", "Succession", "Reservation", ...} (59
    distinct values across the corpus, all preserved). `action` is
    sometimes null on older bilateral treaties; we still emit the party
    relationship in that case.
  * `signed_date`, `definitive_eif_date`, `parties_detail[].action_date`,
    `parties_detail[].effective_date` are DD/MM/YYYY strings; some are
    null; some are stubs like "00/00/1962" we can't lift to xsd:date.
  * `references[]` carries citations like
      "Treaty Series 105/1970: Cmnd 4536"
      "PRO (now TNA) FO 949/998/0: 0"
      "Country Series 001/2026: CP 1547"
      "Miscellaneous Series 029/1999: Cm 4427"
      "Treaty Series 042/2011: Cm 8202||https://treaties.fcdo.gov.uk/..."
    ~29% of refs include a `||URL` PDF suffix. We split that off as
    `dct:hasFormat`. Command-paper numbers (Cm/Cmd/Cmnd/CP) are
    extracted as `fm:commandPaper` so the Parliament-bridge join can
    use them.
  * `subject` is an uppercase taxonomic category from a fixed FCDO
    vocabulary ("POLLUTION", "TRADE", "AVIATION", ...). We mint one
    `skos:Concept` URI per distinct subject (e.g.
    `fm:subject/POLLUTION`) so SPARQL queries can navigate the
    vocabulary.
  * `bilateral_or_multilateral` is "BI", "MULTI", or null. About 45% are
    null -- these are thin / catalogue-only records.
  * `document_url` doubles as the canonical UKTO resource URL and the
    named-graph IRI for that record's quads.
  * `captured_at` is the crawl timestamp, used as prov-o metadata on
    the named graph (not on the treaty).

Provenance:
  * The named graph IRI is the UKTO record URL.
  * `<graph> prov:wasDerivedFrom <document_url>` and
    `<graph> prov:generatedAtTime <captured_at>^^xsd:dateTime` go into a
    side `_provenance.nq` so the rolled-up `all.nq` stays
    treaty-content-only.

Reconciliation:

  * **Parties → Wikidata QIDs** via a curated map loaded from
    `third_party/data/fcdo_treaties/country-qids.tsv`. Curated, not
    fuzzy: any unmapped label is logged for review rather than silently
    dropped.

Determinism: blank-node identifiers are derived from the record id +
the predicate kind + an integer index, so the same input produces the
same `.nq` output byte-for-byte. This keeps `all.nq.gz` diffs minimal.

Usage:

    python3 scripts/fcdo_treaties_extract.py
    python3 scripts/fcdo_treaties_extract.py --refresh
    python3 scripts/fcdo_treaties_extract.py --workers 8 --gzip
    python3 scripts/fcdo_treaties_extract.py --only 72835 72991
"""
from __future__ import annotations

import argparse
import concurrent.futures as futures
import gzip
import json
import re
import sys
import urllib.parse
from datetime import date, datetime
from pathlib import Path
from typing import Iterable

import rdflib
from rdflib import RDF, RDFS, XSD, Literal, Namespace, URIRef

REPO_ROOT   = Path(__file__).resolve().parents[1]
RECORDS_DIR = REPO_ROOT / "third_party/data/fcdo_treaties/records"
OUT_DIR     = REPO_ROOT / "third_party/data/fcdo_treaties/extractors/factoids"
QID_TSV     = REPO_ROOT / "third_party/data/fcdo_treaties/country-qids.tsv"

FM           = Namespace("https://forgetmenot.local/vocab#")
FM_SUBJECT   = Namespace("https://forgetmenot.local/vocab/subject/")
FM_ACTION    = Namespace("https://forgetmenot.local/vocab/action/")
FM_COUNTRY   = Namespace("https://forgetmenot.local/vocab/country/")
FM_COVERAGE  = Namespace("https://forgetmenot.local/vocab/coverage/")
SCHEMA       = Namespace("http://schema.org/")
DCT          = Namespace("http://purl.org/dc/terms/")
WD           = Namespace("http://www.wikidata.org/entity/")
SKOS         = Namespace("http://www.w3.org/2004/02/skos/core#")
PROV         = Namespace("http://www.w3.org/ns/prov#")
OWL          = Namespace("http://www.w3.org/2002/07/owl#")
VOID         = Namespace("http://rdfs.org/ns/void#")


# ---- helpers --------------------------------------------------------

_DATE_RE   = re.compile(r"^\d{2}/\d{2}/\d{4}$")
_CMD_PAPER = re.compile(r"\b(Cmnd|Cmd|Cm|CP)\s+(\d+)\b")
_SERIES_RE = re.compile(
    r"^(Treaty Series|Country Series|Miscellaneous Series|European Community Series|"
    r"European Communities Series|Command Paper|UN Registration|"
    r"League of Nations Treaty Series|United Nations Treaty Series|"
    r"United States Treaty Series|Canadian Treaty Series|"
    r"South African Treaty Series|League of Nations Registration|"
    r"British State Papers \(BSP\)|FCO|PRO \(now TNA\) FO|"
    r"Hertslet's Commercial Treaties|Treaties Laid before Parliament)"
    r"\s+([\d/]+)?",
    re.IGNORECASE,
)
_BAD_URI_CHARS = re.compile(r"[\s<>\"{}|\\^`]")
_TITLE_ALT_RE  = re.compile(r"\s*\[([^\[\]]{1,80})\]\s*$")


def pct(n: int, d: int) -> float | None:
    return round(n / d * 100, 2) if d else None


def load_qid_map(path: Path) -> dict[str, str]:
    """Read the curated TSV. Comments (# ...) and blank lines ignored.
    Keys are upper-cased on load so the runtime lookup matches FCDO's
    canonical sovereign-state casing."""
    out: dict[str, str] = {}
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.rstrip("\n")
            if not line or line.startswith("#"):
                continue
            parts = line.split("\t")
            if len(parts) < 2:
                continue
            label, qid = parts[0].strip(), parts[1].strip()
            if not label or not qid:
                continue
            out[label.upper()] = qid
    return out


PARTY_TO_QID: dict[str, str] = load_qid_map(QID_TSV)


def parse_dmy(s: str | None) -> str | None:
    """UKTO uses DD/MM/YYYY; lift to ISO, drop placeholders."""
    if not s or not _DATE_RE.match(s):
        return None
    if s.startswith("00/") or "/00/" in s or s.endswith("/0000"):
        return None
    try:
        return datetime.strptime(s, "%d/%m/%Y").date().isoformat()
    except ValueError:
        return None


def safe_uri(s: str) -> str:
    """Percent-encode any characters rdflib will refuse in a URI."""
    if not _BAD_URI_CHARS.search(s):
        return s
    sp = urllib.parse.urlsplit(s.replace("\\", "/"))
    return urllib.parse.urlunsplit((
        sp.scheme, sp.netloc,
        urllib.parse.quote(sp.path, safe="/"),
        urllib.parse.quote(sp.query, safe="=&"),
        sp.fragment,
    ))


def slug_country(label: str) -> str:
    """Turn a country label into a stable URI local-name."""
    s = re.sub(r"[^A-Za-z0-9]+", "_", label).strip("_")
    return s.upper() if s.isascii() else urllib.parse.quote(label, safe="")


def country_uri(label: str) -> URIRef:
    return FM_COUNTRY[slug_country(label)]


def subject_uri(subject: str) -> URIRef:
    return FM_SUBJECT[re.sub(r"[^A-Za-z0-9]+", "_", subject).strip("_")]


# Action vocabulary observed in the corpus (59 distinct values), with
# a tidy local-name for the SKOS concept URI. Unobserved actions fall
# back to a slugged literal.
ACTION_SLUG = {
    "Signature":               "signature",
    "Signed":                  "signature",
    "Ratification":            "ratification",
    "Ratification Dated":      "ratification",
    "Accession":               "accession",
    "Re-Accession":            "accession",
    "Acc. by letter":          "accession",
    "Acceptance":              "acceptance",
    "Prov Acceptance":         "acceptance-provisional",
    "Non-acceptance":          "non-acceptance",
    "Approval":                "approval",
    "Approved":                "approval",
    "Adoption":                "adoption",
    "Adherence":               "adherence",
    "Re-Adherence":            "adherence",
    "Application":             "application",
    "Re-Application":          "application",
    "App without mod":         "application-unmodified",
    "App. with mods.":         "application-modified",
    "Provisional application": "application-provisional",
    "Provisional application (partial)": "application-provisional-partial",
    "Extension":               "extension",
    "Extension (partial)":     "extension-partial",
    "Exte (check it)":         "extension-tentative",
    "Succession":              "succession",
    "Succession to Signature": "succession-to-signature",
    "Definitive Signature":    "definitive-signature",
    "Def EIF":                 "definitive-entry-into-force",
    "Reservation":             "reservation",
    "Declaration":             "declaration",
    "Notification":            "notification",
    "Statement":               "statement",
    "Observation":             "observation",
    "Communication":           "communication",
    "Objection":               "objection",
    "Confirmation":            "confirmation",
    "Letter":                  "letter",
    "Decision Resvd.":         "decision-reserved",
    "Understanding":           "understanding",
    "Bound":                   "bound",
    "Participation":           "participation",
    "Membership":              "membership",
    "Associate Member":        "associate-member",
    "Contract. Party":         "contracting-party",
    "Corrigendum":             "corrigendum",
    "Undertaking":             "undertaking",
    "Not Applicable":          "not-applicable",
    "Termination":             "termination",
    "Suspension":              "suspension",
    "Denunciation":            "denunciation",
    "Derogation":              "derogation",
    "Withdrawal":              "withdrawal",
    "Withdrawal Comm.":        "withdrawal-communication",
    "Withdrawal Res.":         "withdrawal-reservation",
    "Withdrawal Dec.":         "withdrawal-declaration",
    "Withdrawal Obj.":         "withdrawal-objection",
    "Withdrawal Derogation":   "withdrawal-derogation",
    "Withdrawn":               "withdrawn",
}


def action_uri(action: str) -> URIRef:
    slug = ACTION_SLUG.get(action) or re.sub(
        r"[^a-z0-9]+", "-",
        action.lower(),
    ).strip("-")
    return FM_ACTION[slug or "other"]


def split_alternate_name(title: str) -> tuple[str, str | None]:
    """Trailing "[short name]" on a title is FCDO's alt-name convention."""
    m = _TITLE_ALT_RE.search(title)
    if not m:
        return title, None
    alt = m.group(1).strip()
    base = title[:m.start()].strip()
    return base, alt or None


def parse_reference(raw: str) -> dict:
    """Pull what structure we can out of a free-text reference."""
    out: dict = {"raw": raw}
    text = raw
    if "||" in text:
        text, _, url = text.partition("||")
        url = url.strip()
        text = text.strip()
        if url:
            out["pdf_url"] = url
    out["text"] = text
    m = _SERIES_RE.match(text)
    if m:
        out["series"] = m.group(1)
    for paper, num in _CMD_PAPER.findall(text):
        out["command_paper"] = f"{paper} {num}"
        break
    return out


def bind_prefixes(g: rdflib.Graph) -> None:
    g.bind("fm",      FM)
    g.bind("fm-s",    FM_SUBJECT)
    g.bind("fm-a",    FM_ACTION)
    g.bind("fm-c",    FM_COUNTRY)
    g.bind("schema",  SCHEMA)
    g.bind("dct",     DCT)
    g.bind("wd",      WD)
    g.bind("skos",    SKOS)
    g.bind("prov",    PROV)
    g.bind("owl",     OWL)
    g.bind("xsd",     XSD)
    g.bind("rdfs",    RDFS)


def bnode_for(rid: str, kind: str, index: int) -> rdflib.BNode:
    """Deterministic blank-node id: derived from the record id, the
    kind of node (partyAction / reference), and a 1-based index. Means
    re-running the lift produces byte-identical output -- so `all.nq.gz`
    diffs stay minimal between refreshes."""
    return rdflib.BNode(f"r{rid}_{kind}_{index}")


def lift_one(record: dict) -> tuple[URIRef, rdflib.Graph, dict]:
    rid = str(record["id"])
    treaty = URIRef(f"https://treaties.fcdo.gov.uk/awweb/awfp/recno/{rid}")
    graph_uri = treaty  # named graph IRI == treaty IRI
    g = rdflib.Graph(identifier=graph_uri)
    bind_prefixes(g)

    # Treaty core ------------------------------------------------------
    g.add((treaty, RDF.type, FM.Treaty))
    g.add((treaty, RDF.type, SCHEMA.CreativeWork))
    g.add((treaty, FM.uktoId, Literal(rid)))
    if record.get("uuid"):
        g.add((treaty, FM.uktoUuid, Literal(record["uuid"])))

    title = record.get("title")
    if title:
        base_title, alt = split_alternate_name(title)
        g.add((treaty, DCT.title, Literal(base_title, lang="en")))
        g.add((treaty, SCHEMA.name, Literal(base_title, lang="en")))
        if alt:
            g.add((treaty, SCHEMA.alternateName, Literal(alt, lang="en")))

    subj = record.get("subject")
    if subj:
        s_uri = subject_uri(subj)
        g.add((treaty, FM.subject, s_uri))
        g.add((treaty, DCT.subject, s_uri))
        g.add((s_uri, RDF.type, SKOS.Concept))
        g.add((s_uri, SKOS.prefLabel, Literal(subj, lang="en")))
        g.add((s_uri, SKOS.inScheme, URIRef(str(FM_SUBJECT))))

    biorm = record.get("bilateral_or_multilateral")
    if biorm == "BI":
        g.add((treaty, FM.kind, Literal("bilateral")))
        g.add((treaty, FM.isBilateral, Literal(True)))
    elif biorm == "MULTI":
        g.add((treaty, FM.kind, Literal("multilateral")))
        g.add((treaty, FM.isBilateral, Literal(False)))

    # Dates ------------------------------------------------------------
    signed_iso = parse_dmy(record.get("signed_date"))
    if signed_iso:
        g.add((treaty, FM.signedDate, Literal(signed_iso, datatype=XSD.date)))
    elif record.get("signed_date"):
        g.add((treaty, FM.signedDateText, Literal(record["signed_date"])))
    if record.get("signed_place"):
        g.add((treaty, FM.signedPlace,
               Literal(record["signed_place"], lang="en")))

    eif_iso = parse_dmy(record.get("definitive_eif_date"))
    if eif_iso:
        g.add((treaty, FM.entryIntoForceDate,
               Literal(eif_iso, datatype=XSD.date)))

    # References -------------------------------------------------------
    ref_stats = {"total": 0, "with_url": 0, "with_cmd": 0, "with_series": 0}
    for i, raw in enumerate(record.get("references") or [], start=1):
        if not raw:
            continue
        ref_stats["total"] += 1
        parsed = parse_reference(raw)
        ref_node = bnode_for(rid, "ref", i)
        g.add((treaty, FM.reference, ref_node))
        g.add((ref_node, RDF.type, FM.Reference))
        g.add((ref_node, RDFS.label, Literal(parsed["text"])))
        # raw form for round-trip compatibility with bridge files
        g.add((treaty, FM.referenceText, Literal(raw)))
        if "series" in parsed:
            g.add((ref_node, FM.series, Literal(parsed["series"])))
            ref_stats["with_series"] += 1
        if "command_paper" in parsed:
            cp = parsed["command_paper"]
            g.add((ref_node, FM.commandPaper, Literal(cp)))
            g.add((treaty, FM.commandPaper, Literal(cp)))
            ref_stats["with_cmd"] += 1
        if "pdf_url" in parsed:
            url = safe_uri(parsed["pdf_url"])
            try:
                g.add((ref_node, DCT.hasFormat, URIRef(url)))
                g.add((ref_node, SCHEMA.url, URIRef(url)))
                ref_stats["with_url"] += 1
            except Exception:  # noqa: BLE001
                pass

    # Parties (the simple label list, used as a fast index) ------------
    unmapped: list[str] = []
    party_stats = {"total": 0, "resolved": 0}
    seen_parties: set[str] = set()
    for label in (record.get("parties") or []):
        if not label:
            continue
        party_stats["total"] += 1
        key = label.strip().upper()
        c_uri = country_uri(label)
        qid = PARTY_TO_QID.get(key)
        if qid:
            party_stats["resolved"] += 1
        if key in seen_parties:
            continue
        seen_parties.add(key)
        g.add((treaty, FM.party, c_uri))
        g.add((c_uri, RDF.type, FM.Country))
        g.add((c_uri, RDFS.label, Literal(label, lang="en")))
        if qid:
            g.add((c_uri, OWL.sameAs, WD[qid]))
            g.add((c_uri, SCHEMA.sameAs, WD[qid]))
        else:
            unmapped.append(label)

    # Per-party event sequence ----------------------------------------
    # Each entry in parties_detail is one signature / ratification /
    # accession / etc. event. Action can be null on older treaties; we
    # still surface the country relationship in that case (with a
    # qualified action node) so SPARQL can find the party.
    action_stats = {"total": 0, "null": 0}
    for i, pd in enumerate(record.get("parties_detail") or [], start=1):
        country_label = pd.get("country")
        if not country_label:
            continue
        action_stats["total"] += 1
        c_uri = country_uri(country_label)
        if country_label.strip().upper() not in seen_parties:
            g.add((treaty, FM.party, c_uri))
            g.add((c_uri, RDF.type, FM.Country))
            g.add((c_uri, RDFS.label, Literal(country_label, lang="en")))
            qid = PARTY_TO_QID.get(country_label.strip().upper())
            if qid:
                g.add((c_uri, OWL.sameAs, WD[qid]))
                g.add((c_uri, SCHEMA.sameAs, WD[qid]))
            seen_parties.add(country_label.strip().upper())

        ev = bnode_for(rid, "pa", i)
        g.add((treaty, FM.partyAction, ev))
        g.add((ev, RDF.type, FM.TreatyAction))
        g.add((ev, FM.country, c_uri))
        g.add((ev, FM.countryLabel, Literal(country_label, lang="en")))

        action = pd.get("action")
        if action:
            a_uri = action_uri(action)
            g.add((ev, FM.action, a_uri))
            g.add((a_uri, RDF.type, SKOS.Concept))
            g.add((a_uri, SKOS.prefLabel, Literal(action)))
            g.add((a_uri, SKOS.inScheme, URIRef(str(FM_ACTION))))
        else:
            action_stats["null"] += 1

        ad = parse_dmy(pd.get("action_date"))
        if ad:
            g.add((ev, FM.actionDate, Literal(ad, datatype=XSD.date)))
        ed = parse_dmy(pd.get("effective_date"))
        if ed:
            g.add((ev, FM.effectiveDate, Literal(ed, datatype=XSD.date)))

    # Provenance: document_url is the canonical UKTO HTML/PDF; some
    # have spaces / unsafe chars and need percent-encoding.
    src = record.get("document_url")
    if src:
        g.add((treaty, DCT.source, URIRef(safe_uri(src))))
        g.add((treaty, SCHEMA.url, URIRef(safe_uri(src))))

    # Capture timestamp on the treaty as well as on the graph (in
    # _provenance.nq) so triple-flattening consumers don't lose it.
    if record.get("captured_at"):
        g.add((treaty, FM.capturedAt,
               Literal(record["captured_at"], datatype=XSD.dateTime)))

    # Date parse rates --------------------------------------------------
    date_stats = {
        "signed_present": 1 if record.get("signed_date") else 0,
        "signed_parsed":  1 if signed_iso else 0,
        "eif_present":    1 if record.get("definitive_eif_date") else 0,
        "eif_parsed":     1 if eif_iso else 0,
    }

    return treaty, g, {
        "unmapped_parties": unmapped,
        "triples": len(g),
        "thin": (
            not record.get("parties")
            and not record.get("parties_detail")
            and not record.get("subject")
        ),
        "ref_stats":    ref_stats,
        "party_stats":  party_stats,
        "action_stats": action_stats,
        "date_stats":   date_stats,
        "has_subject":  bool(record.get("subject")),
        "has_biorm":    bool(record.get("bilateral_or_multilateral")),
    }


# ---- per-record file IO ---------------------------------------------

def compute_stats(record: dict) -> dict:
    """Stat-only accounting; no rdflib. Same counting logic as lift_one
    so the reuse path can update the rollup summary without re-doing
    the RDF emission. Keep in sync if lift_one's stat shape changes."""
    unmapped: list[str] = []
    party_stats = {"total": 0, "resolved": 0}
    seen_parties: set[str] = set()
    for label in (record.get("parties") or []):
        if not label:
            continue
        party_stats["total"] += 1
        key = label.strip().upper()
        qid = PARTY_TO_QID.get(key)
        if qid:
            party_stats["resolved"] += 1
        if key in seen_parties:
            continue
        seen_parties.add(key)
        if not qid:
            unmapped.append(label)

    action_stats = {"total": 0, "null": 0}
    for pd in (record.get("parties_detail") or []):
        if not pd.get("country"):
            continue
        action_stats["total"] += 1
        if not pd.get("action"):
            action_stats["null"] += 1

    ref_stats = {"total": 0, "with_url": 0, "with_cmd": 0, "with_series": 0}
    for raw in (record.get("references") or []):
        if not raw:
            continue
        ref_stats["total"] += 1
        parsed = parse_reference(raw)
        if "series" in parsed:
            ref_stats["with_series"] += 1
        if "command_paper" in parsed:
            ref_stats["with_cmd"] += 1
        if "pdf_url" in parsed:
            ref_stats["with_url"] += 1

    signed_iso = parse_dmy(record.get("signed_date"))
    eif_iso    = parse_dmy(record.get("definitive_eif_date"))

    return {
        "unmapped_parties": unmapped,
        "thin": (
            not record.get("parties")
            and not record.get("parties_detail")
            and not record.get("subject")
        ),
        "ref_stats":    ref_stats,
        "party_stats":  party_stats,
        "action_stats": action_stats,
        "date_stats":   {
            "signed_present": 1 if record.get("signed_date") else 0,
            "signed_parsed":  1 if signed_iso else 0,
            "eif_present":    1 if record.get("definitive_eif_date") else 0,
            "eif_parsed":     1 if eif_iso else 0,
        },
        "has_subject":  bool(record.get("subject")),
        "has_biorm":    bool(record.get("bilateral_or_multilateral")),
    }


def lift_to_files(path: Path, refresh: bool) -> dict:
    """Run lift_one for a record, write per-treaty .ttl, return summary.
    On reuse: skip the rdflib work but still read the JSON so the
    rollup summary's coverage stats reflect every record."""
    rid = path.stem
    ttl_path = OUT_DIR / f"{rid}.ttl"

    try:
        rec = json.loads(path.read_text())
    except (json.JSONDecodeError, OSError) as exc:
        return {"id": rid, "error": f"read: {exc}"}

    base = {
        "id": rid,
        "ttl_path": str(ttl_path),
        "captured_at": rec.get("captured_at"),
        "document_url": rec.get("document_url"),
        "graph_uri": f"https://treaties.fcdo.gov.uk/awweb/awfp/recno/{rid}",
    }

    if not refresh and ttl_path.exists():
        stat = compute_stats(rec)
        return {**base, "reused": True, **stat}

    treaty, g, stat = lift_one(rec)
    ttl_path.parent.mkdir(parents=True, exist_ok=True)
    g.serialize(destination=str(ttl_path), format="turtle")
    return {**base, "graph_uri": str(treaty),
            "triples": stat["triples"], **{
                k: stat[k] for k in (
                    "unmapped_parties", "thin", "ref_stats",
                    "party_stats", "action_stats", "date_stats",
                    "has_subject", "has_biorm",
                )
            }}


def _nt_quad(s, p, o, g) -> str:
    return f"{s.n3()} {p.n3()} {o.n3()} {g.n3()} .\n"


def stream_dataset(records: list[Path], summaries: list[dict],
                   nq_path: Path) -> int:
    """Streaming N-Quads writer. One record's triples in memory at a
    time. Returns total quads written."""
    total = 0
    with nq_path.open("w", encoding="utf-8") as nq:
        for path, summary in zip(records, summaries):
            if "error" in summary:
                continue
            ttl = Path(summary["ttl_path"])
            graph_uri = summary["graph_uri"]
            g = rdflib.Graph()
            g.parse(str(ttl), format="turtle")
            graph_term = URIRef(safe_uri(graph_uri))
            for s, p, o in g:
                nq.write(_nt_quad(s, p, o, graph_term))
                total += 1
    return total


def write_provenance(records: list[Path], summaries: list[dict],
                     out_path: Path) -> int:
    """Side prov-o file with one quad per record's graph: capture
    timestamp + source URL."""
    total = 0
    with out_path.open("w", encoding="utf-8") as nq:
        for path, summary in zip(records, summaries):
            if "error" in summary:
                continue
            graph_uri = summary.get("graph_uri")
            captured = summary.get("captured_at")
            doc_url = summary.get("document_url")
            if not graph_uri:
                continue
            g_term = URIRef(safe_uri(graph_uri))
            if captured:
                nq.write(_nt_quad(
                    g_term, PROV.generatedAtTime,
                    Literal(captured, datatype=XSD.dateTime),
                    g_term,
                ))
                total += 1
            if doc_url:
                nq.write(_nt_quad(
                    g_term, PROV.wasDerivedFrom,
                    URIRef(safe_uri(doc_url)),
                    g_term,
                ))
                total += 1
            nq.write(_nt_quad(
                g_term, RDF.type, PROV.Entity, g_term,
            ))
            total += 1
    return total


def write_dataset_descriptor(path: Path, summary: dict,
                              nq_path: Path, prov_path: Path) -> None:
    """Emit a tiny void:Dataset Turtle file describing what's in this
    directory: how many quads, how many records, what the named-graph
    convention is, where to find the vocab and the provenance side
    file. Intended as the first thing a downstream consumer should
    read."""
    g = rdflib.Graph()
    bind_prefixes(g)
    g.bind("void", VOID)
    g.bind("fm-cov", FM_COVERAGE)

    ds = URIRef("https://forgetmenot.local/vocab/dataset/fcdo-factoids")
    g.add((ds, RDF.type, VOID.Dataset))
    g.add((ds, RDFS.label,
           Literal("FCDO UK Treaties Online — factoids", lang="en")))
    g.add((ds, DCT.title,
           Literal("FCDO UK Treaties Online — RDF lift of the public-anonymous catalogue", lang="en")))
    g.add((ds, DCT.description, Literal(
        "RDF lift of the FCDO UK Treaties Online catalogue (treaties.fcdo.gov.uk). "
        "One named graph per treaty record; graph IRI is the upstream UKTO record URL. "
        "Covers catalogue metadata only: title, parties, signed date / place, "
        "definitive entry-into-force, treaty-series + command-paper references, "
        "FCDO subject classification, bilateral / multilateral kind, per-party "
        "action sequence (Signature / Ratification / Accession / etc.). "
        "Does NOT include signatory NAMES -- those are not in FCDO's public-anonymous surface.",
        lang="en")))
    g.add((ds, DCT.creator, Literal("forgetmenot project", lang="en")))
    g.add((ds, DCT.publisher,
           Literal("Foreign, Commonwealth & Development Office (upstream source)", lang="en")))
    g.add((ds, DCT.license,
           URIRef("http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/")))
    g.add((ds, DCT.modified,
           Literal(summary["generated_at"], datatype=XSD.date)))
    DATA_BASE = "https://forgetmenot.local/vocab/dataset/"
    g.add((ds, VOID.dataDump, URIRef(DATA_BASE + nq_path.name)))
    g.add((ds, VOID.dataDump, URIRef(DATA_BASE + prov_path.name)))
    g.add((ds, VOID.triples,
           Literal(summary["approximate_triples"], datatype=XSD.integer)))
    g.add((ds, VOID.entities,
           Literal(summary["records_lifted"], datatype=XSD.integer)))
    g.add((ds, VOID.vocabulary, URIRef("https://forgetmenot.local/vocab#")))
    g.add((ds, VOID.exampleResource,
           URIRef("https://treaties.fcdo.gov.uk/awweb/awfp/recno/72835")))

    # Coverage-as-data so a SPARQL query can answer "how complete?"
    cov = summary["coverage"]
    for k, v in cov.items():
        if v is None:
            continue
        prop = FM_COVERAGE[k]
        dtype = XSD.decimal if isinstance(v, float) else XSD.integer
        g.add((ds, prop, Literal(v, datatype=dtype)))

    # Documented gaps as plain-text statements so a reader sees them
    # before discovering them empirically.
    for note in [
        "Signatory NAMES (the persons who actually signed) are NOT present. FCDO's public-anonymous surface does not expose them; the lift can therefore not answer 'which UK treaties were signed by which Minister'. The 'parties' field is countries, not people.",
        f"Crawl is partial: {summary['records_lifted']} records of FCDO's ~21,957 total. A leisurely crawler is filling in the remainder; re-run scripts/fcdo_treaties_extract.py --refresh after new records land.",
        f"{summary['records_thin']} of {summary['records_lifted']} lifted records ({pct(summary['records_thin'], summary['records_lifted'])}%) are 'thin' -- catalogue stubs with title + uktoId only, no parties / subject / dates. These are emitted as bare fm:Treaty resources.",
        "Each per-treaty named graph independently asserts the rdf:type, rdfs:label, owl:sameAs of every country it mentions. This means e.g. <fm:country/UNITED_KINGDOM rdf:type fm:Country> appears in thousands of graphs. Defensible (per-graph closure) but downstream consumers should account for it when computing distinct-resource counts.",
    ]:
        g.add((ds, RDFS.comment, Literal(note, lang="en")))

    g.serialize(destination=str(path), format="turtle")


# ---- driver --------------------------------------------------------

def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--refresh", action="store_true",
                        help="re-lift every record even if its .ttl exists")
    parser.add_argument("--workers", type=int, default=4,
                        help="parallel lifters (default: 4)")
    parser.add_argument("--only", nargs="+", default=None,
                        help="restrict to these record IDs")
    parser.add_argument("--gzip", action="store_true",
                        help="also write all.nq.gz alongside all.nq")
    args = parser.parse_args(list(argv) if argv is not None else None)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    records = sorted(RECORDS_DIR.glob("*.json"))
    if args.only:
        wanted = set(args.only)
        records = [p for p in records if p.stem in wanted]
    if not records:
        sys.exit("no records to lift; run scripts/fcdo_treaties_crawl.py first")

    summaries: list[dict] = [None] * len(records)  # type: ignore[list-item]
    with futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futs = {
            pool.submit(lift_to_files, p, args.refresh): i
            for i, p in enumerate(records)
        }
        done = 0
        for fut in futures.as_completed(futs):
            i = futs[fut]
            try:
                summaries[i] = fut.result()
            except Exception as exc:  # noqa: BLE001
                summaries[i] = {"id": records[i].stem,
                                "error": f"lift: {exc}"}
            done += 1
            if done % 500 == 0:
                print(f"  lifted {done}/{len(records)}", file=sys.stderr)

    nq_path = OUT_DIR / "all.nq"
    total_quads = stream_dataset(records, summaries, nq_path)
    prov_path = OUT_DIR / "_provenance.nq"
    prov_quads = write_provenance(records, summaries, prov_path)

    if args.gzip:
        # mtime=0 in the gzip header so the output is byte-identical
        # for the same input -- avoids spurious diffs on refresh.
        gz_path = str(nq_path) + ".gz"
        with nq_path.open("rb") as src, \
             open(gz_path, "wb") as raw, \
             gzip.GzipFile(fileobj=raw, mode="wb",
                           filename="", mtime=0) as dst:
            for chunk in iter(lambda: src.read(65536), b""):
                dst.write(chunk)

    # Roll-up summary --------------------------------------------------
    unmapped: dict[str, int] = {}
    errors = 0
    reused = 0
    thin = 0
    has_subject = 0
    has_biorm = 0
    ref_total = ref_url = ref_cmd = ref_series = 0
    party_total = party_resolved = 0
    action_total = action_null = 0
    signed_present = signed_parsed = 0
    eif_present = eif_parsed = 0
    for s in summaries:
        if not s:
            continue
        if "error" in s:
            errors += 1
            continue
        if s.get("reused"):
            reused += 1
        if s.get("thin"):
            thin += 1
        if s.get("has_subject"):
            has_subject += 1
        if s.get("has_biorm"):
            has_biorm += 1
        for label in (s.get("unmapped_parties") or []):
            unmapped[label] = unmapped.get(label, 0) + 1
        rs = s.get("ref_stats") or {}
        ref_total  += rs.get("total", 0)
        ref_url    += rs.get("with_url", 0)
        ref_cmd    += rs.get("with_cmd", 0)
        ref_series += rs.get("with_series", 0)
        ps = s.get("party_stats") or {}
        party_total    += ps.get("total", 0)
        party_resolved += ps.get("resolved", 0)
        as_ = s.get("action_stats") or {}
        action_total += as_.get("total", 0)
        action_null  += as_.get("null", 0)
        ds = s.get("date_stats") or {}
        signed_present += ds.get("signed_present", 0)
        signed_parsed  += ds.get("signed_parsed", 0)
        eif_present    += ds.get("eif_present", 0)
        eif_parsed     += ds.get("eif_parsed", 0)

    lifted = sum(1 for s in summaries if s and "error" not in s)
    coverage = {
        "records_with_subject":  has_subject,
        "records_with_biorm":    has_biorm,
        "signed_date_present":   signed_present,
        "signed_date_parsed":    signed_parsed,
        "signed_date_parse_pct": pct(signed_parsed, signed_present),
        "eif_date_present":      eif_present,
        "eif_date_parsed":       eif_parsed,
        "eif_date_parse_pct":    pct(eif_parsed, eif_present),
        "parties_total":         party_total,
        "parties_resolved":      party_resolved,
        "parties_resolved_pct":  pct(party_resolved, party_total),
        "party_actions_total":   action_total,
        "party_actions_null":    action_null,
        "party_actions_null_pct": pct(action_null, action_total),
        "references_total":      ref_total,
        "references_with_url":   ref_url,
        "references_with_url_pct": pct(ref_url, ref_total),
        "references_with_command_paper": ref_cmd,
        "references_with_command_paper_pct": pct(ref_cmd, ref_total),
        "references_with_series": ref_series,
        "references_with_series_pct": pct(ref_series, ref_total),
    }

    unmapped_path = OUT_DIR / "_unmapped_party_labels.json"
    unmapped_sorted = sorted(unmapped.items(), key=lambda kv: -kv[1])
    unmapped_path.write_text(json.dumps(
        [{"label": k, "count": n} for k, n in unmapped_sorted],
        indent=2,
    ))

    summary = {
        "generated_at": date.today().isoformat(),
        "records_seen": len(records),
        "records_lifted": lifted,
        "records_reused": reused,
        "records_thin": thin,
        "records_failed": errors,
        "approximate_triples": total_quads,
        "provenance_quads": prov_quads,
        "nquads_path": str(nq_path.relative_to(REPO_ROOT)),
        "provenance_path": str(prov_path.relative_to(REPO_ROOT)),
        "dataset_path": str((OUT_DIR / "_dataset.ttl").relative_to(REPO_ROOT)),
        "vocab_path": str((OUT_DIR / "fm-vocab.ttl").relative_to(REPO_ROOT)),
        "qid_map_path": str(QID_TSV.relative_to(REPO_ROOT)),
        "unmapped_party_labels_path": str(unmapped_path.relative_to(REPO_ROOT)),
        "unmapped_party_labels_total": len(unmapped),
        "party_qid_map_size": len(PARTY_TO_QID),
        "unmapped_party_labels": [
            [k, n] for k, n in unmapped_sorted[:50]
        ],
        "coverage": coverage,
    }
    (OUT_DIR / "_index.json").write_text(json.dumps(summary, indent=2))

    write_dataset_descriptor(OUT_DIR / "_dataset.ttl", summary,
                             nq_path, prov_path)

    print(
        f"lifted {lifted}/{len(records)} records "
        f"({reused} reused, {thin} thin); "
        f"{total_quads} content quads + {prov_quads} prov quads -> {nq_path}"
    )
    if unmapped:
        print(f"unmapped party labels: {len(unmapped)} distinct "
              f"(full list in {unmapped_path.name}); top:",
              file=sys.stderr)
        for label, n in unmapped_sorted[:12]:
            print(f"  {n:5d}  {label}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
