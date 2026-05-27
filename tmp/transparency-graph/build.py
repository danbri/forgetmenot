#!/usr/bin/env python3
"""
Lords interests × APPG officers/secretariats/funders graph.

Builds an RDF (N-Quads) graph for the entity-resolution overlap question.
NO claim of wrongdoing is asserted — only that named entities appear in
multiple registers.
"""
import json, glob, os, re, datetime, hashlib

OUT = "third_party/data/transparency-graph"
os.makedirs(OUT, exist_ok=True)

NS = {
    "trn":  "https://forgetmenot.example/transparency#",
    "mnis": "https://data.parliament.uk/membersdataplatform/services/mnis/members/",
    "appg": "https://publications.parliament.uk/pa/cm/cmallparty/260413/",
    "rdf":  "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
    "xsd":  "http://www.w3.org/2001/XMLSchema#",
    "foaf": "http://xmlns.com/foaf/0.1/",
}
GRAPHS = {
    "appg":      f"{NS['trn']}graph/appg-register",
    "interests": f"{NS['trn']}graph/lords-rmfi",
    "members":   f"{NS['trn']}graph/members",
    "entity":    f"{NS['trn']}graph/entities-resolved",
    "overlaps":  f"{NS['trn']}graph/overlaps",
}

def lit(s, dt=None):
    if s is None: return None
    s2 = str(s).replace("\\","\\\\").replace('"','\\"').replace("\n","\\n").replace("\r","\\r").replace("\t","\\t")
    return f'"{s2}"^^<{dt}>' if dt else f'"{s2}"'
def iri(s): return f"<{s}>"
quads = []
def E(g, s, p, o):
    if o is None: return
    quads.append(f"{s} <{p}> {o} <{g}> .")

# Entity normalisation: lowercase + remove suffixes
def norm_entity(name):
    if not name: return None
    s = name.strip().lower()
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"\s*\((middle east|uk|london|england|scotland|wales|northern ireland)\)\s*$", "", s)
    s = re.sub(r"\s+(ltd|limited|llp|inc|plc|gmbh|s\.?a\.?|sa|bv|nv|gmbh|co|company|foundation)\s*\.?$", "", s)
    s = re.sub(r"\s*[.,;:]\s*$", "", s)
    return s

def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:80]

# ---- 1. APPG groups + officers + benefits + secretariats ----
with open("third_party/data/appg/resolved.json") as f:
    appg = json.load(f)

# Map appg-name -> set of officers (mnisIds)
appg_officers = {}
# Map entity_norm -> [appg link records]
appg_entity_links = {}

for g in appg["groups"]:
    gslug = g["slug"]
    guri = iri(f"{NS['appg']}{gslug}.htm")
    E(GRAPHS["appg"], guri, NS["rdf"]+"type", iri(NS["trn"]+"APPG"))
    E(GRAPHS["appg"], guri, NS["trn"]+"title", lit(g.get("title")))
    E(GRAPHS["appg"], guri, NS["trn"]+"subject", lit(g.get("subject")))
    E(GRAPHS["appg"], guri, NS["trn"]+"category", lit(g.get("category")))
    E(GRAPHS["appg"], guri, NS["trn"]+"purpose", lit(g.get("purpose")))

    # Secretariat (free text — extract organisation name if "acts as the group's secretariat")
    sec_text = (g.get("contact") or {}).get("secretariat") or ""
    m = re.match(r"^([^.]+?)\s+acts as the group['’]s secretariat", sec_text)
    if m:
        sec_name = m.group(1).strip()
        sec_norm = norm_entity(sec_name)
        sec_uri = iri(f"{NS['trn']}entity/{slug(sec_norm)}")
        E(GRAPHS["appg"], guri, NS["trn"]+"secretariat", sec_uri)
        E(GRAPHS["entity"], sec_uri, NS["rdf"]+"type", iri(NS["trn"]+"Entity"))
        E(GRAPHS["entity"], sec_uri, NS["trn"]+"canonicalName", lit(sec_name))
        E(GRAPHS["entity"], sec_uri, NS["trn"]+"normalisedName", lit(sec_norm))
        appg_entity_links.setdefault(sec_norm, []).append(("secretariatOf", gslug, g["title"]))

    # Benefits — financial
    for ben in (g.get("benefits") or {}).get("financial", []):
        src = ben.get("source") or ""
        src_norm = norm_entity(src)
        if not src_norm: continue
        b_uri = iri(f"{NS['trn']}benefit/{gslug}/{slug(src + ben.get('received',''))}")
        e_uri = iri(f"{NS['trn']}entity/{slug(src_norm)}")
        E(GRAPHS["appg"], guri, NS["trn"]+"hasFinancialBenefit", b_uri)
        E(GRAPHS["appg"], b_uri, NS["rdf"]+"type", iri(NS["trn"]+"FinancialBenefit"))
        E(GRAPHS["appg"], b_uri, NS["trn"]+"benefitSource", e_uri)
        E(GRAPHS["appg"], b_uri, NS["trn"]+"benefitValueGbp", lit(ben.get("value", "").replace(",", ""), NS["xsd"]+"string"))
        E(GRAPHS["appg"], b_uri, NS["trn"]+"benefitReceivedDate", lit(ben.get("received")))
        E(GRAPHS["entity"], e_uri, NS["rdf"]+"type", iri(NS["trn"]+"Entity"))
        E(GRAPHS["entity"], e_uri, NS["trn"]+"canonicalName", lit(src))
        E(GRAPHS["entity"], e_uri, NS["trn"]+"normalisedName", lit(src_norm))
        appg_entity_links.setdefault(src_norm, []).append(("financialBenefitTo", gslug, g["title"]))

    # Benefits — in kind
    for ben in (g.get("benefits") or {}).get("inKind", []):
        src = ben.get("source") or ""
        src_norm = norm_entity(src)
        if not src_norm: continue
        b_uri = iri(f"{NS['trn']}benefit/{gslug}/{slug(src + ben.get('received',''))}")
        e_uri = iri(f"{NS['trn']}entity/{slug(src_norm)}")
        E(GRAPHS["appg"], guri, NS["trn"]+"hasInKindBenefit", b_uri)
        E(GRAPHS["appg"], b_uri, NS["rdf"]+"type", iri(NS["trn"]+"InKindBenefit"))
        E(GRAPHS["appg"], b_uri, NS["trn"]+"benefitSource", e_uri)
        E(GRAPHS["appg"], b_uri, NS["trn"]+"benefitValueGbp", lit(ben.get("value", "").replace(",", ""), NS["xsd"]+"string"))
        E(GRAPHS["entity"], e_uri, NS["rdf"]+"type", iri(NS["trn"]+"Entity"))
        E(GRAPHS["entity"], e_uri, NS["trn"]+"canonicalName", lit(src))
        E(GRAPHS["entity"], e_uri, NS["trn"]+"normalisedName", lit(src_norm))
        appg_entity_links.setdefault(src_norm, []).append(("inKindBenefitTo", gslug, g["title"]))

    # Officers (only matched)
    for off in g["officers"]:
        if off.get("resolution", {}).get("status") != "matched": continue
        mid = off["resolution"]["member"]["id"]
        muri = iri(f"{NS['mnis']}{mid}")
        E(GRAPHS["appg"], muri, NS["trn"]+"officerOf", guri)
        E(GRAPHS["appg"], muri, NS["trn"]+"officerRoleIn", lit(f"{off.get('role')} of {g['title']}"))
        appg_officers.setdefault(gslug, []).append(mid)
        # Make sure member URI is typed
        E(GRAPHS["members"], muri, NS["rdf"]+"type", iri(NS["trn"]+"Member"))

# ---- 2. Lords RMFI: extract organisation names from Cat 1 (paid roles) ----
# Reuse the lords-interests cache from graph 1
member_interest_orgs = {}  # mid -> set of normalised entity names
member_meta = {}

# We may not have member-info for every interest-bearing peer. Use what's there + the APPG officer set.
for f in glob.glob("tmp/scrutiny-graph/raw/member-info/*.json"):
    mid = int(os.path.basename(f).split(".")[0])
    try:
        with open(f) as fp: d = json.load(fp)
    except: continue
    v = d.get("value", {})
    member_meta[mid] = {
        "name": v.get("nameDisplayAs"),
        "party": (v.get("latestParty") or {}).get("name"),
        "house": (v.get("latestHouseMembership") or {}).get("house"),
    }
    muri = iri(f"{NS['mnis']}{mid}")
    E(GRAPHS["members"], muri, NS["foaf"]+"name", lit(v.get("nameDisplayAs")))
    if (v.get("latestParty") or {}).get("name"):
        E(GRAPHS["members"], muri, NS["trn"]+"party", lit((v.get("latestParty") or {}).get("name")))

# Heuristic org extraction from Lords interest free text
def extract_orgs(txt):
    out = set()
    # "Role, ORG NAME (description)"  primary
    m = re.search(r"^[^,]+,\s*([A-Z][^,()\n]+?)(?:\s*\(|,|;|$)", txt)
    if m: out.add(m.group(1).strip())
    # "paid by ORG" / "met by ORG" (visits)
    for pat in [r"(?:paid|met|funded|sponsored)\s+(?:for\s+)?by\s+(?:the\s+)?([A-Z][^,;.]+)",
                r"^Adviser,?\s+([A-Z][^,()]+)",
                r"^Director,?\s+([A-Z][^,()]+)",
                r"^Consultant,?\s+([A-Z][^,()]+)",
                r"^Chair,?\s+([A-Z][^,()]+)"]:
        for m in re.finditer(pat, txt):
            out.add(m.group(1).strip())
    return out

for f in glob.glob("tmp/scrutiny-graph/raw/lords-interests/*.json"):
    mid = int(os.path.basename(f).split(".")[0])
    try:
        with open(f) as fp: d = json.load(fp)
    except: continue
    muri = iri(f"{NS['mnis']}{mid}")
    for cat in d.get("value", []) or []:
        cat_name = cat.get("name", "")
        for ent in cat.get("interests", []):
            txt = ent.get("interest") or ""
            ent_id = ent.get("id")
            int_uri = iri(f"{NS['trn']}interest/{mid}/{ent_id}")
            E(GRAPHS["interests"], muri, NS["trn"]+"hasInterest", int_uri)
            E(GRAPHS["interests"], int_uri, NS["rdf"]+"type", iri(NS["trn"]+"DeclaredInterest"))
            E(GRAPHS["interests"], int_uri, NS["trn"]+"interestCategory", lit(cat_name))
            E(GRAPHS["interests"], int_uri, NS["trn"]+"interestText", lit(txt))
            for org in extract_orgs(txt):
                org_norm = norm_entity(org)
                if not org_norm or len(org_norm) < 3: continue
                org_uri = iri(f"{NS['trn']}entity/{slug(org_norm)}")
                E(GRAPHS["interests"], int_uri, NS["trn"]+"mentionsEntity", org_uri)
                E(GRAPHS["entity"], org_uri, NS["rdf"]+"type", iri(NS["trn"]+"Entity"))
                E(GRAPHS["entity"], org_uri, NS["trn"]+"canonicalName", lit(org))
                E(GRAPHS["entity"], org_uri, NS["trn"]+"normalisedName", lit(org_norm))
                member_interest_orgs.setdefault(mid, set()).add(org_norm)

# ---- 3. Overlap relations ----
# For each entity that appears both as an APPG secretariat/benefit-provider AND in a Lord's interest, assert overlap
overlaps = []
for entity_norm, appg_records in appg_entity_links.items():
    for mid, mids_orgs in member_interest_orgs.items():
        if entity_norm in mids_orgs:
            for kind, gslug, gtitle in appg_records:
                muri = iri(f"{NS['mnis']}{mid}")
                guri = iri(f"{NS['appg']}{gslug}.htm")
                e_uri = iri(f"{NS['trn']}entity/{slug(entity_norm)}")
                E(GRAPHS["overlaps"], muri, NS["trn"]+"hasOverlapWithAPPG", guri)
                E(GRAPHS["overlaps"], e_uri, NS["trn"]+"connectsAPPG", guri)
                E(GRAPHS["overlaps"], e_uri, NS["trn"]+"connectsMember", muri)
                E(GRAPHS["overlaps"], e_uri, NS["trn"]+"appgRelationType", lit(kind))
                # Special highlight: the member is also an officer of that APPG
                if mid in appg_officers.get(gslug, []):
                    E(GRAPHS["overlaps"], muri, NS["trn"]+"isOfficerOfOverlappedAPPG", guri)
                    overlaps.append({
                        "member_id": mid,
                        "member_name": (member_meta.get(mid) or {}).get("name"),
                        "appg_slug": gslug,
                        "appg_title": gtitle,
                        "entity": entity_norm,
                        "kind": kind,
                    })

# ---- write ----
OUT_FILE = f"{OUT}/transparency.nq"
with open(OUT_FILE, "w") as f:
    f.write("\n".join(quads) + "\n")
size = os.path.getsize(OUT_FILE)

manifest = {
    "generated": datetime.datetime.utcnow().isoformat() + "Z",
    "quads": len(quads),
    "size_bytes": size,
    "named_graphs": GRAPHS,
    "namespaces": NS,
    "source_counts": {
        "appgs": len(appg["groups"]),
        "members": len(member_meta),
        "lords_interests_files": len(list(glob.glob("tmp/scrutiny-graph/raw/lords-interests/*.json"))),
        "distinct_appg_entity_links": len(appg_entity_links),
        "members_with_interest_entity": len(member_interest_orgs),
        "officer_self_overlaps": len(overlaps),
    },
    "officer_self_overlaps_sample": overlaps[:20],
}
with open(f"{OUT}/manifest.json", "w") as f:
    json.dump(manifest, f, indent=2)

print(json.dumps(manifest, indent=2, default=str)[:3000])
