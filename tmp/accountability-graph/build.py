#!/usr/bin/env python3
"""
Graph: Peer → Question → Answer → AnsweringBody → arm's-length body / regulator
Plus follow-up question chains and answer transfers.
"""
import json, os, re, glob, datetime

OUT = "third_party/data/accountability-graph"
os.makedirs(OUT, exist_ok=True)

NS = {
    "acc":  "https://forgetmenot.example/accountability#",
    "mnis": "https://data.parliament.uk/membersdataplatform/services/mnis/members/",
    "wq":   "https://questions-statements-api.parliament.uk/api/writtenquestions/questions/",
    "rdf":  "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
    "xsd":  "http://www.w3.org/2001/XMLSchema#",
    "foaf": "http://xmlns.com/foaf/0.1/",
}
GRAPHS = {
    "qa":      f"{NS['acc']}graph/questions-answers",
    "bodies":  f"{NS['acc']}graph/answering-bodies",
    "alb":     f"{NS['acc']}graph/arms-length-bodies",
    "members": f"{NS['acc']}graph/members",
    "links":   f"{NS['acc']}graph/cross-links",
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

# Arms-length / regulator detection patterns (representative not exhaustive)
ALB_PATTERNS = [
    ("Ofcom", r"\bOfcom\b"),
    ("Ofwat", r"\bOfwat\b"),
    ("Ofgem", r"\bOfgem\b"),
    ("Ofsted", r"\bOfsted\b"),
    ("FCA", r"\bFCA\b|\bFinancial Conduct Authority\b"),
    ("PRA", r"\bPRA\b|\bPrudential Regulation Authority\b"),
    ("CMA", r"\bCMA\b|\bCompetition and Markets Authority\b"),
    ("CQC", r"\bCQC\b|\bCare Quality Commission\b"),
    ("NHS England", r"\bNHS England\b"),
    ("HMRC", r"\bHMRC\b"),
    ("Bank of England", r"\bBank of England\b"),
    ("MHRA", r"\bMHRA\b|\bMedicines and Healthcare products Regulatory Agency\b"),
    ("Environment Agency", r"\bEnvironment Agency\b"),
    ("HSE", r"\bHealth and Safety Executive\b|\bHSE\b"),
    ("UKRI", r"\bUKRI\b|\bUK Research and Innovation\b"),
    ("ICO", r"\bICO\b|\bInformation Commissioner\b"),
    ("EHRC", r"\bEHRC\b|\bEquality and Human Rights Commission\b"),
    ("Charity Commission", r"\bCharity Commission\b"),
    ("ORR", r"\bORR\b|\bOffice of Rail and Road\b"),
    ("CAA", r"\bCAA\b|\bCivil Aviation Authority\b"),
    ("Highways England", r"\bHighways England\b|\bNational Highways\b"),
    ("Natural England", r"\bNatural England\b"),
    ("Historic England", r"\bHistoric England\b"),
    ("Arts Council England", r"\bArts Council England\b"),
    ("Sport England", r"\bSport England\b"),
    ("Crown Prosecution Service", r"\bCPS\b|\bCrown Prosecution Service\b"),
    ("Met Office", r"\bMet Office\b"),
    ("DVLA", r"\bDVLA\b"),
    ("DBT", r"\bDBT\b"),
    ("Companies House", r"\bCompanies House\b"),
    ("HM Treasury", r"\bHM Treasury\b"),
    ("Crown Estate", r"\bCrown Estate\b"),
    ("HM Land Registry", r"\bHM Land Registry\b|\bLand Registry\b"),
    ("Ofqual", r"\bOfqual\b"),
    ("Border Force", r"\bBorder Force\b"),
    ("UKVI", r"\bUK Visas and Immigration\b|\bUKVI\b"),
    ("HMPPS", r"\bHMPPS\b|\bHM Prison and Probation Service\b"),
    ("DBS", r"\bDisclosure and Barring Service\b|\bDBS\b"),
    ("NICE", r"\bNICE\b|\bNational Institute for Health and Care Excellence\b"),
    ("UKHSA", r"\bUKHSA\b|\bUK Health Security Agency\b"),
    ("MOD", r"\bMinistry of Defence\b|\bMOD\b"),
    ("National Crime Agency", r"\bNCA\b|\bNational Crime Agency\b"),
]

UIN_REF = re.compile(r"\b(HL|H[LCl])\s?(\d{3,7})\b")

# ---- Load data ----
with open("tmp/accountability-graph/raw/lords-wq.json") as f:
    qs = [item.get("value", item) for item in json.load(f)]
print(f"Questions: {len(qs)}")

# Member meta — reuse from graph 1's cache
member_meta = {}
for f in glob.glob("tmp/scrutiny-graph/raw/member-info/*.json"):
    try:
        with open(f) as fp: d = json.load(fp)
    except: continue
    mid = int(os.path.basename(f).split(".")[0])
    v = d.get("value", {})
    member_meta[mid] = {
        "name": v.get("nameDisplayAs"),
        "party": (v.get("latestParty") or {}).get("name"),
    }

# Bodies (collect distinct)
bodies = {}
alb_count = {}             # alb_name -> #answers mentioning
alb_by_body = {}           # body_name -> {alb_name: count}
member_by_topic = {}       # heading prefix -> set of askers
peer_followups = []        # (askerId, current_uin, refs_uin)

def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-")[:80]

for q in qs:
    qid = q.get("id")
    if not qid: continue
    qu = iri(f"{NS['wq']}{qid}")
    askerId = q.get("askingMemberId")
    body_id = q.get("answeringBodyId")
    body_name = q.get("answeringBodyName") or "?"
    heading = q.get("heading") or ""
    text = q.get("questionText") or ""
    answer = q.get("answerText") or ""

    # Question node
    E(GRAPHS["qa"], qu, NS["rdf"]+"type", iri(NS["acc"]+"WrittenQuestion"))
    E(GRAPHS["qa"], qu, NS["acc"]+"uin", lit(q.get("uin")))
    E(GRAPHS["qa"], qu, NS["acc"]+"dateTabled", lit(q.get("dateTabled"), NS["xsd"]+"date") if q.get("dateTabled") else None)
    E(GRAPHS["qa"], qu, NS["acc"]+"dateAnswered", lit(q.get("dateAnswered"), NS["xsd"]+"date") if q.get("dateAnswered") else None)
    E(GRAPHS["qa"], qu, NS["acc"]+"heading", lit(heading))
    E(GRAPHS["qa"], qu, NS["acc"]+"questionText", lit(text))
    E(GRAPHS["qa"], qu, NS["acc"]+"answerText", lit(answer))
    E(GRAPHS["qa"], qu, NS["acc"]+"answerLength", lit(len(answer), NS["xsd"]+"integer"))
    # Asker
    if askerId:
        E(GRAPHS["links"], iri(f"{NS['mnis']}{askerId}"), NS["acc"]+"askedQuestion", qu)
    # Body
    if body_id is not None:
        b_uri = iri(f"{NS['acc']}body/{body_id}")
        bodies[body_id] = body_name
        E(GRAPHS["qa"], qu, NS["acc"]+"answeringBody", b_uri)
    # Headings → topic (use first colon-prefix as topic)
    topic = heading.split(":")[0].strip() if heading else "?"
    if topic:
        E(GRAPHS["qa"], qu, NS["acc"]+"topic", lit(topic))
        member_by_topic.setdefault(topic, set()).add(askerId)
    # Detect references to prior questions (HLxxxxx)
    for m in UIN_REF.finditer(text):
        ref_uin = (m.group(1).upper() + m.group(2))
        E(GRAPHS["links"], qu, NS["acc"]+"refersToQuestion", lit(ref_uin))
        peer_followups.append((askerId, q.get("uin"), ref_uin))
    # Arm's-length body detection in answerText
    for alb_name, pat in ALB_PATTERNS:
        if re.search(pat, answer):
            alb_uri = iri(f"{NS['acc']}alb/{slug(alb_name)}")
            E(GRAPHS["alb"], alb_uri, NS["rdf"]+"type", iri(NS["acc"]+"PublicBody"))
            E(GRAPHS["alb"], alb_uri, NS["acc"]+"name", lit(alb_name))
            E(GRAPHS["links"], qu, NS["acc"]+"answerMentionsBody", alb_uri)
            if body_id is not None:
                E(GRAPHS["links"], iri(f"{NS['acc']}body/{body_id}"), NS["acc"]+"delegatesTo", alb_uri)
            alb_count[alb_name] = alb_count.get(alb_name, 0) + 1
            alb_by_body.setdefault(body_name, {}).setdefault(alb_name, 0)
            alb_by_body[body_name][alb_name] += 1

# Bodies
for bid, bname in bodies.items():
    b_uri = iri(f"{NS['acc']}body/{bid}")
    E(GRAPHS["bodies"], b_uri, NS["rdf"]+"type", iri(NS["acc"]+"AnsweringBody"))
    E(GRAPHS["bodies"], b_uri, NS["acc"]+"name", lit(bname))
    E(GRAPHS["bodies"], b_uri, NS["acc"]+"id", lit(bid, NS["xsd"]+"integer"))

# Members
askers = {q.get("askingMemberId") for q in qs if q.get("askingMemberId")}
for mid in askers:
    if mid not in member_meta: continue
    muri = iri(f"{NS['mnis']}{mid}")
    E(GRAPHS["members"], muri, NS["foaf"]+"name", lit(member_meta[mid]["name"]))
    if member_meta[mid].get("party"):
        E(GRAPHS["members"], muri, NS["acc"]+"party", lit(member_meta[mid]["party"]))

# Write
OUT_FILE = f"{OUT}/accountability.nq"
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
        "questions": len(qs),
        "answering_bodies": len(bodies),
        "distinct_alb_mentions": len(alb_count),
        "distinct_askers": len(askers),
        "followup_edges": len(peer_followups),
    },
    "top_albs": dict(sorted(alb_count.items(), key=lambda x: -x[1])[:20]),
}
with open(f"{OUT}/manifest.json", "w") as f:
    json.dump(manifest, f, indent=2)

print(json.dumps(manifest, indent=2, default=str)[:3000])
