#!/usr/bin/env python3
"""Lift FCDO UKTO catalogue JSON to RDF / N-Quads.

Reads third_party/data/fcdo_treaties/records/*.json and emits one
named graph per treaty whose graph IRI is the UKTO record URL --
same pattern as the gov.uk org-chart corpus.

Per-treaty Turtle goes to extractors/factoids/<id>.ttl; the rolled-up
N-Quads file is extractors/factoids/all.nq.

Reconciliation:

  - **Parties → Wikidata QIDs** via a curated map from FCDO's
    uppercase country labels (UNITED KINGDOM, FRANCE, USSR FORMER,
    etc.) to Wikidata country QIDs. Curated, not fuzzy: any unmapped
    label is logged for review rather than silently dropped.
  - **Treaty → Parliament Treaties API** is left for a follow-up
    extractor (joins by signedDate + title-similarity for the
    post-2010 CRaG subset); this lift focuses on the catalogue + party
    reconciliation.

Provenance qualifiers on every triple: fcdo:source = the UKTO record
URL.

    python3 scripts/fcdo_treaties_extract.py
    python3 scripts/fcdo_treaties_extract.py --refresh
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime
from pathlib import Path
from typing import Iterable

import rdflib
from rdflib import RDF, RDFS, XSD, Literal, Namespace, URIRef

RECORDS_DIR = Path("third_party/data/fcdo_treaties/records")
OUT_DIR     = Path("third_party/data/fcdo_treaties/extractors/factoids")

FCDO   = Namespace("https://forgetmenot.local/fcdo#")
SCHEMA = Namespace("http://schema.org/")
DCT    = Namespace("http://purl.org/dc/terms/")
WD     = Namespace("http://www.wikidata.org/entity/")

# Curated Wikidata QIDs for the most common UKTO country labels.
# Source: looked up by canonical English label on Wikidata. Where FCDO
# uses a historical / non-current name (Federal Republic of Germany,
# USSR Former), we map to the Wikidata item for that historical entity
# rather than the modern successor, since the *treaty* signatory was
# that historical state.
PARTY_TO_QID: dict[str, str] = {
    "UNITED KINGDOM":               "Q145",
    "UNITED STATES OF AMERICA":     "Q30",
    "FRANCE":                       "Q142",
    "GERMANY":                      "Q183",
    "FEDERAL REPUBLIC OF GERMANY":  "Q713750",   # West Germany
    "GERMAN DEMOCRATIC REPUBLIC":   "Q16957",    # East Germany
    "ITALY":                        "Q38",
    "SPAIN":                        "Q29",
    "PORTUGAL":                     "Q45",
    "BELGIUM":                      "Q31",
    "NETHERLANDS":                  "Q55",
    "NETHERLANDS THE":              "Q55",
    "DENMARK":                      "Q35",
    "NORWAY":                       "Q20",
    "SWEDEN":                       "Q34",
    "FINLAND":                      "Q33",
    "ICELAND":                      "Q189",
    "IRELAND":                      "Q27",
    "GREECE":                       "Q41",
    "TURKEY":                       "Q43",
    "RUSSIAN FEDERATION":           "Q159",
    "RUSSIA":                       "Q34266",    # Empire of Russia
    "USSR FORMER":                  "Q15180",
    "USSR":                         "Q15180",
    "SOVIET UNION":                 "Q15180",
    "POLAND":                       "Q36",
    "CZECHOSLOVAKIA":               "Q33946",
    "CZECH REPUBLIC":               "Q213",
    "SLOVAKIA":                     "Q214",
    "HUNGARY":                      "Q28",
    "AUSTRIA":                      "Q40",
    "SWITZERLAND":                  "Q39",
    "LIECHTENSTEIN":                "Q347",
    "PRUSSIA":                      "Q27306",
    "AUSTRIA-HUNGARY":              "Q28513",
    "OTTOMAN EMPIRE":               "Q12560",
    "CHINA":                        "Q148",
    "JAPAN":                        "Q17",
    "INDIA":                        "Q668",
    "PAKISTAN":                     "Q843",
    "BANGLADESH":                   "Q902",
    "AUSTRALIA":                    "Q408",
    "NEW ZEALAND":                  "Q664",
    "CANADA":                       "Q16",
    "SOUTH AFRICA":                 "Q258",
    "ISRAEL":                       "Q801",
    "EGYPT":                        "Q79",
    "MOROCCO":                      "Q1028",
    "ARGENTINA":                    "Q414",
    "BRAZIL":                       "Q155",
    "MEXICO":                       "Q96",
    "CHILE":                        "Q298",
    "EUROPEAN UNION":               "Q458",
    "EUROPEAN COMMUNITY":           "Q458",
    "EUROPEAN ATOMIC ENERGY COMMUNITY": "Q165944",
    "EUROPEAN ECONOMIC COMMUNITY":  "Q165944",   # historic, EEC
    "EUROPEAN COAL AND STEEL COMMUNITY": "Q173135",
    "HOLY SEE":                     "Q159583",
    "VATICAN CITY":                 "Q237",
    "UNITED NATIONS":               "Q1065",
    "WORLD HEALTH ORGANIZATION":    "Q7817",
    "WORLD TRADE ORGANIZATION":     "Q7825",
    "INTERNATIONAL ATOMIC ENERGY AGENCY": "Q124299",

    # historical / Latin / less-common spellings from the FCDO labels
    "ROUMANIA":                     "Q218",      # = Romania
    "ROMANIA":                      "Q218",
    "BULGARIA":                     "Q219",
    "URUGUAY":                      "Q77",
    "LUXEMBOURG":                   "Q32",
    "SIAM":                         "Q869",      # = Thailand
    "THAILAND":                     "Q869",
    "PERSIA":                       "Q794",      # = Iran
    "IRAN":                         "Q794",
    "CUBA":                         "Q241",
    "NICARAGUA":                    "Q811",
    "COLOMBIA":                     "Q739",
    "PERU":                         "Q419",
    "GUATEMALA":                    "Q774",
    "SERBIA":                       "Q403",
    "YUGOSLAVIA":                   "Q36704",
    "CROATIA":                      "Q224",
    "SLOVENIA":                     "Q215",
    "BOSNIA AND HERZEGOVINA":       "Q225",
    "MONTENEGRO":                   "Q236",
    "NORTH MACEDONIA":              "Q221",
    "MACEDONIA":                    "Q221",
    "ALBANIA":                      "Q222",
    "ECUADOR":                      "Q736",
    "VENEZUELA":                    "Q717",
    "PARAGUAY":                     "Q733",
    "BOLIVIA":                      "Q750",
    "EL SALVADOR":                  "Q792",
    "HONDURAS":                     "Q783",
    "COSTA RICA":                   "Q800",
    "PANAMA":                       "Q804",
    "DOMINICAN REPUBLIC":           "Q786",
    "HAITI":                        "Q790",
    "JAMAICA":                      "Q766",
    "TRINIDAD AND TOBAGO":          "Q754",
    "BARBADOS":                     "Q244",
    "INDONESIA":                    "Q252",
    "PHILIPPINES":                  "Q928",
    "MALAYSIA":                     "Q833",
    "SINGAPORE":                    "Q334",
    "VIET-NAM":                     "Q881",
    "VIETNAM":                      "Q881",
    "REPUBLIC OF KOREA":            "Q884",
    "KOREA SOUTH":                  "Q884",
    "KOREA NORTH":                  "Q423",
    "DEMOCRATIC PEOPLE'S REPUBLIC OF KOREA": "Q423",
    "TAIWAN":                       "Q865",
    "MONGOLIA":                     "Q711",
    "NEPAL":                        "Q837",
    "SRI LANKA":                    "Q854",
    "BURMA":                        "Q836",      # historical
    "MYANMAR":                      "Q836",
    "AFGHANISTAN":                  "Q889",
    "IRAQ":                         "Q796",
    "SYRIA":                        "Q858",
    "LEBANON":                      "Q822",
    "JORDAN":                       "Q810",
    "SAUDI ARABIA":                 "Q851",
    "YEMEN":                        "Q805",
    "OMAN":                         "Q842",
    "QATAR":                        "Q846",
    "BAHRAIN":                      "Q398",
    "KUWAIT":                       "Q817",
    "UNITED ARAB EMIRATES":         "Q878",
    "LIBYA":                        "Q1016",
    "TUNISIA":                      "Q948",
    "ALGERIA":                      "Q262",
    "SUDAN":                        "Q1049",
    "ETHIOPIA":                     "Q115",
    "KENYA":                        "Q114",
    "TANZANIA":                     "Q924",
    "UGANDA":                       "Q1036",
    "NIGERIA":                      "Q1033",
    "GHANA":                        "Q117",
    "ZIMBABWE":                     "Q954",
    "ZAMBIA":                       "Q953",
    "MALAWI":                       "Q1020",
    "BOTSWANA":                     "Q963",
    "NAMIBIA":                      "Q1030",
    "ANGOLA":                       "Q916",
    "MOZAMBIQUE":                   "Q1029",
    "CYPRUS":                       "Q229",
    "MALTA":                        "Q233",
    "ESTONIA":                      "Q191",
    "LATVIA":                       "Q211",
    "LITHUANIA":                    "Q37",
    "BELARUS":                      "Q184",
    "UKRAINE":                      "Q212",
    "MOLDOVA":                      "Q217",
    "GEORGIA":                      "Q230",
    "ARMENIA":                      "Q399",
    "AZERBAIJAN":                   "Q227",
    "KAZAKHSTAN":                   "Q232",
    "UZBEKISTAN":                   "Q265",

    # historical entities, alternate spellings, UK overseas territories
    "IRELAND, REPUBLIC OF":         "Q27",
    "IRISH FREE STATE":             "Q31747",
    "FALKLAND ISLANDS":             "Q9648",
    "HONG KONG":                    "Q8646",
    "GIBRALTAR":                    "Q1410",
    "BERMUDA":                      "Q23635",
    "TANGANYIKA":                   "Q186921",
    "BRITISH HONDURAS":             "Q23128",     # = modern Belize
    "BELIZE":                       "Q242",
    "LIBERIA":                      "Q1014",
    "BRITISH GUIANA":               "Q1747689",   # = modern Guyana
    "GUYANA":                       "Q734",
    "FIJI":                         "Q712",
    "ZANZIBAR":                     "Q199825",
    "ALL TERRITORIES UNDER UK SOVEREIGNTY": "Q145",
    "ISLE OF MAN":                  "Q9676",
    "JERSEY":                       "Q785",
    "GUERNSEY":                     "Q25230",
    "CHANNEL ISLANDS":              "Q42314",
    "CAYMAN ISLANDS":               "Q5785",
    "BRITISH VIRGIN ISLANDS":       "Q25305",
    "ANGUILLA":                     "Q25228",
    "MONTSERRAT":                   "Q13353",
    "TURKS AND CAICOS ISLANDS":     "Q18221",
    "SAINT HELENA":                 "Q34497",
    "GIBRALTAR (UK SOVEREIGN BASE AREAS)": "Q1410",
    "ANTIGUA AND BARBUDA":          "Q781",
    "ANTIGUA":                      "Q781",
    "ST KITTS AND NEVIS":           "Q763",
    "ST LUCIA":                     "Q760",
    "ST VINCENT AND THE GRENADINES": "Q757",
    "GRENADA":                      "Q769",
    "DOMINICA":                     "Q784",
    "BAHAMAS":                      "Q778",
    "MALDIVES":                     "Q826",
    "MAURITIUS":                    "Q1027",
    "SEYCHELLES":                   "Q1042",
    "KIRIBATI":                     "Q710",
    "TUVALU":                       "Q672",
    "TONGA":                        "Q678",
    "SAMOA":                        "Q683",
    "FEDERATED STATES OF MICRONESIA": "Q702",
    "MARSHALL ISLANDS":             "Q709",
    "PALAU":                        "Q695",
    "SOLOMON ISLANDS":              "Q685",
    "VANUATU":                      "Q686",
    "PAPUA NEW GUINEA":             "Q691",
    "BHUTAN":                       "Q917",
    "BRUNEI":                       "Q921",
    "CAMBODIA":                     "Q424",
    "LAOS":                         "Q819",
    "EAST TIMOR":                   "Q574",
    "GAMBIA":                       "Q1005",
    "SENEGAL":                      "Q1041",
    "SIERRA LEONE":                 "Q1044",
    "IVORY COAST":                  "Q1008",
    "BURKINA FASO":                 "Q965",
    "MALI":                         "Q912",
    "MAURITANIA":                   "Q1025",
    "NIGER":                        "Q1032",
    "BENIN":                        "Q962",
    "TOGO":                         "Q945",
    "CAMEROON":                     "Q1009",
    "CHAD":                         "Q657",
    "CENTRAL AFRICAN REPUBLIC":     "Q929",
    "CONGO":                        "Q971",       # = Republic of the Congo
    "DEMOCRATIC REPUBLIC OF THE CONGO": "Q974",
    "ZAIRE":                        "Q974",       # historical = DRC
    "GABON":                        "Q1000",
    "RWANDA":                       "Q1037",
    "BURUNDI":                      "Q967",
    "ERITREA":                      "Q986",
    "SOMALIA":                      "Q1045",
    "DJIBOUTI":                     "Q977",
    "LESOTHO":                      "Q1013",
    "ESWATINI":                     "Q1050",
    "SWAZILAND":                    "Q1050",
    "MADAGASCAR":                   "Q1019",
    "COMOROS":                      "Q970",
    "CAPE VERDE":                   "Q1011",
    "EQUATORIAL GUINEA":            "Q983",
    "SAO TOME AND PRINCIPE":        "Q1039",
    "GUINEA":                       "Q1006",
    "GUINEA-BISSAU":                "Q1007",
    "INTERNATIONAL CIVIL AVIATION ORGANIZATION": "Q371399",
    "INTERNATIONAL LABOUR ORGANIZATION": "Q170427",
    "INTERNATIONAL MARITIME ORGANIZATION": "Q170301",
    "INTERNATIONAL TELECOMMUNICATION UNION": "Q175225",
    "UNIVERSAL POSTAL UNION":       "Q165974",
    "NORTH ATLANTIC TREATY ORGANIZATION": "Q7184",
    "COUNCIL OF EUROPE":            "Q41284",
    "INTERNATIONAL CRIMINAL COURT": "Q63419",
    "INTERNATIONAL COURT OF JUSTICE": "Q1148",
    "WORLD METEOROLOGICAL ORGANIZATION": "Q170196",
    "ORGANIZATION FOR ECONOMIC CO-OPERATION AND DEVELOPMENT": "Q7159",
}


def parse_dmy(s: str | None) -> str | None:
    """UKTO uses DD/MM/YYYY; lift to ISO if possible."""
    if not s:
        return None
    try:
        return datetime.strptime(s, "%d/%m/%Y").date().isoformat()
    except ValueError:
        return None


def bind_prefixes(g: rdflib.Graph) -> None:
    g.bind("fcdo",   FCDO)
    g.bind("schema", SCHEMA)
    g.bind("dct",    DCT)
    g.bind("wd",     WD)
    g.bind("xsd",    XSD)
    g.bind("rdfs",   RDFS)


def lift_one(record: dict) -> tuple[rdflib.URIRef, rdflib.Graph, dict]:
    rid = record["id"]
    uri = URIRef(f"https://treaties.fcdo.gov.uk/awweb/awfp/recno/{rid}")
    g = rdflib.Graph()
    bind_prefixes(g)

    g.add((uri, RDF.type, FCDO.Treaty))
    g.add((uri, RDF.type, SCHEMA.CreativeWork))
    g.add((uri, FCDO.uktoId, Literal(rid)))
    if record.get("uuid"):
        g.add((uri, FCDO.uktoUuid, Literal(record["uuid"])))
    if record.get("title"):
        g.add((uri, DCT.title, Literal(record["title"], lang="en")))
        g.add((uri, SCHEMA.name, Literal(record["title"], lang="en")))
    if record.get("subject"):
        g.add((uri, FCDO.subject, Literal(record["subject"])))
    if record.get("bilateral_or_multilateral"):
        kind = {"BI": "bilateral", "MU": "multilateral"}.get(
            record["bilateral_or_multilateral"],
            record["bilateral_or_multilateral"],
        )
        g.add((uri, FCDO.kind, Literal(kind)))

    signed_iso = parse_dmy(record.get("signed_date"))
    if signed_iso:
        g.add((uri, FCDO.signedDate, Literal(signed_iso, datatype=XSD.date)))
    elif record.get("signed_date"):
        # keep the raw string when we can't parse (some entries are
        # "00/00/YYYY" placeholders)
        g.add((uri, FCDO.signedDateText, Literal(record["signed_date"])))
    if record.get("signed_place"):
        g.add((uri, FCDO.signedPlace, Literal(record["signed_place"])))

    eif_iso = parse_dmy(record.get("definitive_eif_date"))
    if eif_iso:
        g.add((uri, FCDO.entryIntoForceDate,
               Literal(eif_iso, datatype=XSD.date)))

    for ref in (record.get("references") or []):
        if ref:
            g.add((uri, FCDO.reference, Literal(ref)))

    # Parties: cite the FCDO label always; add owl:sameAs to Wikidata
    # when a curated mapping exists. unmapped labels are surfaced in
    # the per-run stats.
    unmapped: list[str] = []
    for label in (record.get("parties") or []):
        norm = label.strip().upper()
        party_node = rdflib.BNode()
        g.add((uri, FCDO.party, party_node))
        g.add((party_node, RDFS.label, Literal(label, lang="en")))
        qid = PARTY_TO_QID.get(norm)
        if qid:
            wd = WD[qid]
            g.add((party_node, SCHEMA.sameAs, wd))
            g.add((party_node, FCDO.partyOf, wd))
        else:
            unmapped.append(label)

    # Per-country actions from the detail HTML (Signature / Ratification etc.)
    for pd in (record.get("parties_detail") or []):
        country = pd.get("country")
        action  = pd.get("action")
        if not country or not action:
            continue
        node = rdflib.BNode()
        g.add((uri, FCDO.partyAction, node))
        g.add((node, FCDO.country, Literal(country, lang="en")))
        g.add((node, FCDO.action,  Literal(action)))
        ad = parse_dmy(pd.get("action_date"))
        if ad:
            g.add((node, FCDO.actionDate,
                   Literal(ad, datatype=XSD.date)))
        ed = parse_dmy(pd.get("effective_date"))
        if ed:
            g.add((node, FCDO.effectiveDate,
                   Literal(ed, datatype=XSD.date)))
        qid = PARTY_TO_QID.get(country.strip().upper())
        if qid:
            g.add((node, FCDO.countryQid, WD[qid]))

    # Provenance qualifier: the upstream record URL.
    g.add((uri, DCT.source,
           URIRef(record.get("document_url") or str(uri))))
    g.add((uri, FCDO.capturedAt,
           Literal(record.get("captured_at") or
                   date.today().isoformat(),
                   datatype=XSD.dateTime)))

    return uri, g, {"unmapped_parties": unmapped, "triples": len(g)}


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--refresh", action="store_true",
                        help="re-lift every record even if .ttl exists")
    args = parser.parse_args(list(argv) if argv is not None else None)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    records = sorted(RECORDS_DIR.glob("*.json"))
    if not records:
        sys.exit("no records to lift; run scripts/fcdo_treaties_crawl.py first")

    ds = rdflib.Dataset()
    bind_prefixes(ds)
    unmapped: dict[str, int] = {}
    total_triples = 0
    lifted = 0
    for path in records:
        ttl_path = OUT_DIR / f"{path.stem}.ttl"
        if not args.refresh and ttl_path.exists():
            g = rdflib.Graph()
            g.parse(str(ttl_path), format="turtle")
            # subject is the deterministic URI
            uri = URIRef(
                f"https://treaties.fcdo.gov.uk/awweb/awfp/recno/{path.stem}"
            )
        else:
            try:
                rec = json.loads(path.read_text())
            except json.JSONDecodeError:
                continue
            uri, g, stat = lift_one(rec)
            g.serialize(destination=str(ttl_path), format="turtle")
            for label in stat["unmapped_parties"]:
                unmapped[label] = unmapped.get(label, 0) + 1
            total_triples += stat["triples"]
        # add to dataset as a named graph
        named = ds.graph(uri)
        for t in g:
            named.add(t)
        lifted += 1

    nq_path = OUT_DIR / "all.nq"
    ds.serialize(destination=str(nq_path), format="nquads")

    # Summary + unmapped party report
    summary = {
        "generated_at": date.today().isoformat(),
        "records_lifted": lifted,
        "approximate_triples": total_triples or
                                sum(1 for _ in ds.quads()),
        "nquads_path": str(nq_path),
        "unmapped_party_labels": sorted(
            unmapped.items(), key=lambda kv: -kv[1]
        )[:50],
        "party_qid_map_size": len(PARTY_TO_QID),
    }
    (OUT_DIR / "_index.json").write_text(json.dumps(summary, indent=2))
    print(f"lifted {lifted} records to N-Quads at {nq_path}")
    if unmapped:
        print(f"top unmapped party labels (extend PARTY_TO_QID in this "
              f"script to reconcile them):")
        for label, n in sorted(unmapped.items(),
                               key=lambda kv: -kv[1])[:12]:
            print(f"  {n:5d}  {label}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
