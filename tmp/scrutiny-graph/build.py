#!/usr/bin/env python3
"""
Build N-Quads RDF graph of the Lords scrutiny chain:

  Act → enabling power → SI → laying department → Lords committees
                                                ↘ Lords division → peers
                                                                 ↘ interests

One named graph per source. Run after the fetcher scripts have populated
tmp/scrutiny-graph/raw/.
"""
import json, glob, os, re, sys, datetime, hashlib

OUT = "third_party/data/scrutiny-graph"
os.makedirs(OUT, exist_ok=True)

# Namespaces
NS = {
    "scr":    "https://forgetmenot.example/scrutiny#",       # local graph schema
    "parl":   "https://id.parliament.uk/schema/",
    "id":     "https://id.parliament.uk/",
    "mnis":   "https://data.parliament.uk/membersdataplatform/services/mnis/members/",
    "leg":    "https://www.legislation.gov.uk/",
    "sid":    "https://statutoryinstruments-api.parliament.uk/api/v2/StatutoryInstrument/",
    "div":    "https://lordsvotes-api.parliament.uk/data/Divisions/",
    "ctte":   "https://committees-api.parliament.uk/api/Committees/",
    "rdfs":   "http://www.w3.org/2000/01/rdf-schema#",
    "rdf":    "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "xsd":    "http://www.w3.org/2001/XMLSchema#",
    "dcterms":"http://purl.org/dc/terms/",
    "foaf":   "http://xmlns.com/foaf/0.1/",
    "skos":   "http://www.w3.org/2004/02/skos/core#",
}

# Named-graph IRIs — one per source
GRAPH = {
    "si":         f"{NS['scr']}graph/parliament-si",
    "div":        f"{NS['scr']}graph/lords-votes",
    "interests":  f"{NS['scr']}graph/lords-rmfi",
    "ctte":       f"{NS['scr']}graph/committees",
    "member":     f"{NS['scr']}graph/members",
    "links":      f"{NS['scr']}graph/cross-links",
}

# ---- helpers ----
def lit(s, dt=None):
    if s is None: return None
    s2 = str(s).replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t")
    if dt:
        return f'"{s2}"^^<{dt}>'
    return f'"{s2}"'

def iri(s):
    return f"<{s}>"

def quad(s, p, o, g):
    return f"{s} <{p}> {o} <{g}> ."

def date_lit(iso):
    if not iso: return None
    # accept '2026-04-28T00:00:00' or '2026-04-28'
    d = iso.split("T")[0]
    return lit(d, NS['xsd'] + "date")

OUT_FILE = f"{OUT}/scrutiny.nq"
quads = []

def E(g, s, p, o):
    if o is None: return
    quads.append(quad(s, p, o, g))

# ---- 1. Members ----
member_party = {}
member_name = {}
member_house = {}
for f in glob.glob("tmp/scrutiny-graph/raw/member-info/*.json"):
    mid = int(os.path.basename(f).split(".")[0])
    try:
        with open(f) as fp: d = json.load(fp)
    except: continue
    v = d.get("value", {})
    member_uri = iri(f"{NS['mnis']}{mid}")
    member_name[mid] = v.get("nameDisplayAs") or "?"
    member_party[mid] = (v.get("latestParty") or {}).get("name")
    member_house[mid] = (v.get("latestHouseMembership") or {}).get("house")
    E(GRAPH["member"], member_uri, NS["rdf"]+"type", iri(NS["scr"]+"Member"))
    E(GRAPH["member"], member_uri, NS["scr"]+"mnisId", lit(mid, NS["xsd"]+"integer"))
    E(GRAPH["member"], member_uri, NS["foaf"]+"name", lit(member_name[mid]))
    if member_party[mid]: E(GRAPH["member"], member_uri, NS["scr"]+"party", lit(member_party[mid]))
    if member_house[mid]: E(GRAPH["member"], member_uri, NS["scr"]+"house", lit(member_house[mid]))

# ---- 2. Statutory Instruments + Acts + Departments ----
si_to_dept = {}; si_to_acts = {}; si_records = {}
dept_seen = {}; act_seen = {}
for f in glob.glob("tmp/scrutiny-graph/raw/si-detail/*.json"):
    try:
        with open(f) as fp: d = json.load(fp)
    except: continue
    v = d.get("value", {})
    sid = v.get("id")
    si_records[sid] = v
    si_uri = iri(f"{NS['sid']}{sid}")
    E(GRAPH["si"], si_uri, NS["rdf"]+"type", iri(NS["scr"]+"StatutoryInstrument"))
    E(GRAPH["si"], si_uri, NS["scr"]+"name", lit(v.get("name")))
    E(GRAPH["si"], si_uri, NS["scr"]+"siNumber", lit(v.get("paperNumber")) if v.get("paperNumber") else None)
    E(GRAPH["si"], si_uri, NS["scr"]+"siYear", lit(v.get("paperYear")))
    E(GRAPH["si"], si_uri, NS["scr"]+"siPrefix", lit(v.get("paperPrefix")))
    if v.get("link"):
        E(GRAPH["si"], si_uri, NS["scr"]+"legislationGovUkUri", iri(v["link"]))
    if v.get("commonsLayingDate"):
        E(GRAPH["si"], si_uri, NS["scr"]+"commonsLayingDate", date_lit(v["commonsLayingDate"]))
    if v.get("lordsLayingDate"):
        E(GRAPH["si"], si_uri, NS["scr"]+"lordsLayingDate", date_lit(v["lordsLayingDate"]))
    proc = v.get("procedure") or {}
    if proc.get("name"):
        E(GRAPH["si"], si_uri, NS["scr"]+"procedure", lit(proc["name"]))
    # Department
    lb = v.get("layingBody") or {}
    if lb.get("id"):
        dept_uri = iri(f"{NS['scr']}dept/{lb['id']}")
        si_to_dept[sid] = (lb["id"], lb.get("name"))
        E(GRAPH["si"], si_uri, NS["scr"]+"laidBy", dept_uri)
        if lb["id"] not in dept_seen:
            E(GRAPH["si"], dept_uri, NS["rdf"]+"type", iri(NS["scr"]+"LayingBody"))
            E(GRAPH["si"], dept_uri, NS["scr"]+"name", lit(lb.get("name")))
            E(GRAPH["si"], dept_uri, NS["scr"]+"departmentId", lit(lb.get("departmentId"), NS["xsd"]+"integer") if lb.get("departmentId") else None)
            dept_seen[lb["id"]] = True
    # Enabling acts
    for act in v.get("enablingActs") or []:
        if not act.get("id"): continue
        act_uri = iri(f"{NS['scr']}act/{act['id']}")
        si_to_acts.setdefault(sid, []).append(act["id"])
        E(GRAPH["si"], si_uri, NS["scr"]+"madeUnder", act_uri)
        if act["id"] not in act_seen:
            E(GRAPH["si"], act_uri, NS["rdf"]+"type", iri(NS["scr"]+"ActOfParliament"))
            E(GRAPH["si"], act_uri, NS["scr"]+"name", lit(act.get("name")))
            act_seen[act["id"]] = True

# ---- 3. Lords divisions & votes ----
div_to_si = {}
with open("tmp/scrutiny-graph/divisions-with-si.json") as f:
    div_si_map = json.load(f)
for r in div_si_map:
    if r.get("si"):
        div_to_si[r["divisionId"]] = r["si"]["id"]

for f in glob.glob("tmp/scrutiny-graph/raw/div-detail/*.json"):
    try:
        with open(f) as fp: d = json.load(fp)
    except: continue
    did = d.get("divisionId")
    div_uri = iri(f"{NS['div']}{did}")
    E(GRAPH["div"], div_uri, NS["rdf"]+"type", iri(NS["scr"]+"LordsDivision"))
    E(GRAPH["div"], div_uri, NS["scr"]+"name", lit(d.get("title")))
    E(GRAPH["div"], div_uri, NS["scr"]+"divisionNumber", lit(d.get("number"), NS["xsd"]+"integer") if d.get("number") else None)
    E(GRAPH["div"], div_uri, NS["scr"]+"date", date_lit(d.get("date")))
    E(GRAPH["div"], div_uri, NS["scr"]+"contentCount", lit(d.get("memberContentCount"), NS["xsd"]+"integer"))
    E(GRAPH["div"], div_uri, NS["scr"]+"notContentCount", lit(d.get("memberNotContentCount"), NS["xsd"]+"integer"))
    E(GRAPH["div"], div_uri, NS["scr"]+"isGovernmentWin", lit(str(bool(d.get("isGovernmentWin"))).lower(), NS["xsd"]+"boolean"))
    E(GRAPH["div"], div_uri, NS["scr"]+"isWhipped", lit(str(bool(d.get("isWhipped"))).lower(), NS["xsd"]+"boolean"))
    # link to SI
    si = div_to_si.get(did)
    if si:
        E(GRAPH["links"], div_uri, NS["scr"]+"divisionOnSI", iri(f"{NS['sid']}{si}"))
        E(GRAPH["links"], iri(f"{NS['sid']}{si}"), NS["scr"]+"scrutinisedInDivision", div_uri)
    # voters
    for v in d.get("contents") or []:
        if isinstance(v, dict) and "memberId" in v:
            E(GRAPH["div"], iri(f"{NS['mnis']}{v['memberId']}"), NS["scr"]+"votedContent", div_uri)
    for v in d.get("notContents") or []:
        if isinstance(v, dict) and "memberId" in v:
            E(GRAPH["div"], iri(f"{NS['mnis']}{v['memberId']}"), NS["scr"]+"votedNotContent", div_uri)

# ---- 4. Lords scrutiny committees and current members ----
COMMITTEES = {
    148: "Statutory Instruments (Joint Committee)",
    149: "Statutory Instruments (Select Committee)",
    173: "Delegated Powers and Regulatory Reform Committee",
    255: "Secondary Legislation Scrutiny Committee",
}
for cid, cname in COMMITTEES.items():
    curi = iri(f"{NS['ctte']}{cid}")
    E(GRAPH["ctte"], curi, NS["rdf"]+"type", iri(NS["scr"]+"ScrutinyCommittee"))
    E(GRAPH["ctte"], curi, NS["scr"]+"name", lit(cname))
    with open(f"tmp/scrutiny-graph/raw/committee/members-{cid}.json") as fp:
        d = json.load(fp)
    for m in d.get("items", []):
        if not isinstance(m, dict): continue
        info = m.get("memberInfo") or {}
        mid = info.get("mnisId") or m.get("id")
        if not mid: continue
        # Only emit current members (no end date or end date > today)
        current = info.get("isCurrent", False) or any(
            not r.get("endDate") for r in (m.get("roles") or [])
        )
        if not current: continue
        muri = iri(f"{NS['mnis']}{mid}")
        E(GRAPH["ctte"], muri, NS["scr"]+"memberOfCommittee", curi)
        if any(r.get("role", {}).get("isChair") for r in m.get("roles") or []):
            E(GRAPH["ctte"], muri, NS["scr"]+"chairOfCommittee", curi)

# ---- 5. Lords RMFI — flatten the paid-role text and tag with light keywords ----
SECTOR_KEYWORDS = {
    "ai":       ["artificial intelligence", "machine learning", "\\bAI\\b", "algorithm", "data centre", "generative"],
    "banking":  ["bank", "fintech", "insurance", "investment", "asset", "capital markets", "finance"],
    "health":   ["NHS", "health", "medicine", "pharma", "hospital", "clinical", "patient"],
    "defence":  ["defence", "military", "armed forces", "weapon", "security industry"],
    "energy":   ["energy", "oil", "gas", "nuclear", "renewable", "solar", "wind", "grid", "ESG", "sustainability", "net zero", "climate"],
    "housing":  ["housing", "property", "construction", "real estate", "land", "developer"],
    "telecoms": ["telecom", "broadband", "5G", "spectrum", "internet"],
    "transport":["transport", "rail", "aviation", "automotive", "road"],
    "tech":     ["technology", "digital", "software", "tech ", "platform"],
    "legal":    ["law firm", "LLP", "barrister", "solicitor", "QC ", "KC ", "chambers"],
    "crypto":   ["blockchain", "crypto", "web3", "digital asset", "stablecoin"],
}
SECTOR_PATTERNS = {k: re.compile("|".join(v), re.I) for k, v in SECTOR_KEYWORDS.items()}

member_sectors = {}
for f in glob.glob("tmp/scrutiny-graph/raw/lords-interests/*.json"):
    mid = int(os.path.basename(f).split(".")[0])
    try:
        with open(f) as fp: d = json.load(fp)
    except: continue
    muri = iri(f"{NS['mnis']}{mid}")
    sectors = set()
    for cat in d.get("value", []) or []:
        cat_name = cat.get("name", "")
        for ent in cat.get("interests", []):
            txt = ent.get("interest") or ""
            ent_id = ent.get("id")
            int_uri = iri(f"{NS['scr']}interest/{mid}/{ent_id}")
            E(GRAPH["interests"], int_uri, NS["rdf"]+"type", iri(NS["scr"]+"DeclaredInterest"))
            E(GRAPH["interests"], int_uri, NS["scr"]+"interestText", lit(txt))
            E(GRAPH["interests"], int_uri, NS["scr"]+"interestCategory", lit(cat_name))
            E(GRAPH["interests"], muri, NS["scr"]+"hasInterest", int_uri)
            for sector, pat in SECTOR_PATTERNS.items():
                if pat.search(txt):
                    sectors.add(sector)
                    E(GRAPH["interests"], int_uri, NS["scr"]+"sector", lit(sector))
    for sec in sectors:
        E(GRAPH["interests"], muri, NS["scr"]+"sectorTag", lit(sec))
    member_sectors[mid] = sectors

# ---- write ----
with open(OUT_FILE, "w") as f:
    f.write("\n".join(q for q in quads if q) + "\n")
size = os.path.getsize(OUT_FILE)
nq_count = sum(1 for q in quads if q)

# Manifest
manifest = {
    "generated": datetime.datetime.utcnow().isoformat() + "Z",
    "quads": nq_count,
    "size_bytes": size,
    "named_graphs": GRAPH,
    "namespaces": NS,
    "source_counts": {
        "members": len(list(glob.glob("tmp/scrutiny-graph/raw/member-info/*.json"))),
        "lords_interests": len(list(glob.glob("tmp/scrutiny-graph/raw/lords-interests/*.json"))),
        "si_details": len(list(glob.glob("tmp/scrutiny-graph/raw/si-detail/*.json"))),
        "division_details": len(list(glob.glob("tmp/scrutiny-graph/raw/div-detail/*.json"))),
        "departments": len(dept_seen),
        "acts": len(act_seen),
        "committees": len(COMMITTEES),
        "members_with_sector_tag": sum(1 for s in member_sectors.values() if s),
    },
}
with open(f"{OUT}/manifest.json", "w") as f:
    json.dump(manifest, f, indent=2)

print(json.dumps(manifest, indent=2))
