#!/usr/bin/env python3
"""Lift FCDO UKTO catalogue JSON to Turtle + streamed N-Quads.

Reads `third_party/data/fcdo_treaties/records/*.json` and emits one
named graph per treaty whose graph IRI is the UKTO record URL --
same pattern as the gov.uk org-chart corpus.

Per-treaty Turtle goes to `extractors/factoids/<id>.ttl`; the rolled-up
N-Quads file is `extractors/factoids/all.nq`. The rollup is written
**incrementally**, so peak memory stays at one record at a time -- the
full corpus is ~22k records and a one-shot serialisation of every quad
in a single rdflib Dataset blows past 1 GB.

What the script knows about the data, having read it as an LLM:

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
    29% of refs include a `||URL` PDF suffix. We split that off as
    `dct:hasFormat`. Command-paper numbers (Cm/Cmd/Cmnd/CP) are
    extracted as `fcdo:commandPaper` so the Parliament-bridge join can
    use them.
  * `subject` is an uppercase taxonomic category from a fixed FCDO
    vocabulary ("POLLUTION", "TRADE", "AVIATION", ...). We mint one
    `skos:Concept` URI per distinct subject (e.g.
    `fcdo:subject/POLLUTION`) so SPARQL queries can navigate the
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

Usage:

    python3 scripts/fcdo_treaties_extract.py
    python3 scripts/fcdo_treaties_extract.py --refresh
    python3 scripts/fcdo_treaties_extract.py --workers 8
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

RECORDS_DIR = Path("third_party/data/fcdo_treaties/records")
OUT_DIR     = Path("third_party/data/fcdo_treaties/extractors/factoids")

FCDO   = Namespace("https://forgetmenot.local/fcdo#")
FCDO_SUBJECT = Namespace("https://forgetmenot.local/fcdo/subject/")
FCDO_ACTION  = Namespace("https://forgetmenot.local/fcdo/action/")
FCDO_COUNTRY = Namespace("https://forgetmenot.local/fcdo/country/")
SCHEMA = Namespace("http://schema.org/")
DCT    = Namespace("http://purl.org/dc/terms/")
WD     = Namespace("http://www.wikidata.org/entity/")
SKOS   = Namespace("http://www.w3.org/2004/02/skos/core#")
PROV   = Namespace("http://www.w3.org/ns/prov#")
OWL    = Namespace("http://www.w3.org/2002/07/owl#")


# Curated Wikidata QIDs for FCDO country labels.
# Lookups are case-insensitive; values here can be in any case. The
# uppercase form is what the FCDO catalogue emits for sovereign states;
# the mixed-case entries handle UK overseas territories / Crown
# Dependencies which the catalogue capitalises differently.
#
# Where FCDO uses a historical or non-current name we map to the
# Wikidata item for that historical entity (the treaty signatory was
# the historical state) rather than the modern successor.
PARTY_TO_QID: dict[str, str] = {
    "UNITED KINGDOM":               "Q145",
    "UNITED STATES OF AMERICA":     "Q30",
    "FRANCE":                       "Q142",
    "GERMANY":                      "Q183",
    "FEDERAL REPUBLIC OF GERMANY":  "Q713750",
    "GERMANY FEDERAL REPUBLIC":     "Q713750",
    "GERMAN DEMOCRATIC REPUBLIC":   "Q16957",
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
    "RUSSIA":                       "Q34266",
    "USSR FORMER":                  "Q15180",
    "USSR":                         "Q15180",
    "SOVIET UNION":                 "Q15180",
    "BYELORUSSIA S S R":            "Q184",
    "POLAND":                       "Q36",
    "CZECHOSLOVAKIA":               "Q33946",
    "CZECH REPUBLIC":               "Q213",
    "SLOVAKIA":                     "Q214",
    "SLOVAK REPUBLIC":              "Q214",
    "HUNGARY":                      "Q28",
    "AUSTRIA":                      "Q40",
    "SWITZERLAND":                  "Q39",
    "LIECHTENSTEIN":                "Q347",
    "PRUSSIA":                      "Q27306",
    "AUSTRIA-HUNGARY":              "Q28513",
    "OTTOMAN EMPIRE":               "Q12560",
    "CHINA":                        "Q148",
    "CHINA P R":                    "Q148",
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
    "EUROPEAN ECONOMIC COMMUNITY":  "Q165944",
    "EUROPEAN COAL AND STEEL COMMUNITY": "Q173135",
    "HOLY SEE":                     "Q159583",
    "VATICAN CITY":                 "Q237",
    "UNITED NATIONS":               "Q1065",
    "WORLD HEALTH ORGANIZATION":    "Q7817",
    "WORLD TRADE ORGANIZATION":     "Q7825",
    "INTERNATIONAL ATOMIC ENERGY AGENCY": "Q124299",
    "ROUMANIA":                     "Q218",
    "ROMANIA":                      "Q218",
    "BULGARIA":                     "Q219",
    "URUGUAY":                      "Q77",
    "LUXEMBOURG":                   "Q32",
    "SIAM":                         "Q869",
    "THAILAND":                     "Q869",
    "PERSIA":                       "Q794",
    "IRAN":                         "Q794",
    "CUBA":                         "Q241",
    "NICARAGUA":                    "Q811",
    "COLOMBIA":                     "Q739",
    "PERU":                         "Q419",
    "GUATEMALA":                    "Q774",
    "SERBIA":                       "Q403",
    "YUGOSLAVIA":                   "Q36704",
    "YUGOSLAVIA, FEDERAL REPUBLIC OF": "Q37024",
    "CROATIA":                      "Q224",
    "SLOVENIA":                     "Q215",
    "BOSNIA AND HERZEGOVINA":       "Q225",
    "MONTENEGRO":                   "Q236",
    "NORTH MACEDONIA":              "Q221",
    "MACEDONIA":                    "Q221",
    "MACEDONIA THE FYR OF":         "Q221",
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
    "MALAYA":                       "Q33396",
    "SINGAPORE":                    "Q334",
    "VIET-NAM":                     "Q881",
    "VIETNAM":                      "Q881",
    "REPUBLIC OF KOREA":            "Q884",
    "KOREA SOUTH":                  "Q884",
    "KOREA REPUBLIC OF":            "Q884",
    "KOREA NORTH":                  "Q423",
    "DEMOCRATIC PEOPLE'S REPUBLIC OF KOREA": "Q423",
    "KOREA DEMOCRATIC PEOPLE'S REPUBLIC OF": "Q423",
    "TAIWAN":                       "Q865",
    "MONGOLIA":                     "Q711",
    "NEPAL":                        "Q837",
    "SRI LANKA":                    "Q854",
    "BURMA":                        "Q836",
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
    "BECHUANALAND":                 "Q554234",
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
    "MOLDOVA REPUBLIC OF":          "Q217",
    "GEORGIA":                      "Q230",
    "ARMENIA":                      "Q399",
    "AZERBAIJAN":                   "Q227",
    "KAZAKHSTAN":                   "Q232",
    "UZBEKISTAN":                   "Q265",
    "KYRGYZSTAN":                   "Q813",
    "TAJIKISTAN":                   "Q863",
    "TURKMENISTAN":                 "Q874",
    "MONACO":                       "Q235",
    "SAN MARINO":                   "Q238",
    "ANDORRA":                      "Q228",
    "FAROE ISLANDS":                "Q4628",

    "IRELAND, REPUBLIC OF":         "Q27",
    "IRISH FREE STATE":             "Q31747",
    "FALKLAND ISLANDS":              "Q9648",
    "FALKLAND ISLAND DEPENDENCIES":  "Q35672",
    "HONG KONG":                    "Q8646",
    "MACAO":                        "Q14773",
    "GIBRALTAR":                    "Q1410",
    "GIBRALTAR (UK SOVEREIGN BASE AREAS)": "Q1410",
    "SOVEREIGN BASE AREAS":         "Q179241",
    "BERMUDA":                      "Q23635",
    "TANGANYIKA":                   "Q186921",
    "BRITISH HONDURAS":             "Q23128",
    "BELIZE":                       "Q242",
    "LIBERIA":                      "Q1014",
    "BRITISH GUIANA":               "Q1747689",
    "GUYANA":                       "Q734",
    "FIJI":                         "Q712",
    "ZANZIBAR":                     "Q199825",
    "ALL TERRITORIES UNDER UK SOVEREIGNTY": "Q145",
    "ISLE OF MAN":                  "Q9676",
    "JERSEY":                       "Q785",
    "JERSEY, BAILIWICK OF":         "Q785",
    "GUERNSEY":                     "Q25230",
    "GUERNSEY, BAILIWICK OF":       "Q25230",
    "CHANNEL ISLANDS":              "Q42314",
    "CAYMAN ISLANDS":               "Q5785",
    "BRITISH VIRGIN ISLANDS":       "Q25305",
    "ANGUILLA":                     "Q25228",
    "MONTSERRAT":                   "Q13353",
    "TURKS AND CAICOS ISLANDS":     "Q18221",
    "SAINT HELENA":                 "Q34497",
    "ST HELENA":                    "Q34497",
    "ST HELENA AND DEPENDENCIES":   "Q34497",
    "PITCAIRN ISLANDS":             "Q35672",
    "BRITISH INDIAN OCEAN TERRITORY": "Q43448",
    "NORTH BORNEO":                 "Q1773662",
    "ANTIGUA AND BARBUDA":          "Q781",
    "ANTIGUA":                      "Q781",
    "ST KITTS AND NEVIS":           "Q763",
    "SAINT KITTS AND NEVIS":        "Q763",
    "ST LUCIA":                     "Q760",
    "SAINT LUCIA":                  "Q760",
    "ST VINCENT AND THE GRENADINES": "Q757",
    "ST VINCENT":                   "Q757",
    "GRENADA":                      "Q769",
    "DOMINICA":                     "Q784",
    "DOMINICA, COMMONWEALTH OF":    "Q784",
    "BAHAMAS":                      "Q778",
    "MALDIVES":                     "Q826",
    "MAURITIUS":                    "Q1027",
    "SEYCHELLES":                   "Q1042",
    "KIRIBATI":                     "Q710",
    "TUVALU":                       "Q672",
    "TONGA":                        "Q678",
    "SAMOA":                        "Q683",
    "FEDERATED STATES OF MICRONESIA": "Q702",
    "MICRONESIA":                   "Q702",
    "MARSHALL ISLANDS":             "Q709",
    "PALAU":                        "Q695",
    "SOLOMON ISLANDS":              "Q685",
    "VANUATU":                      "Q686",
    "PAPUA NEW GUINEA":             "Q691",
    "BHUTAN":                       "Q917",
    "BRUNEI":                       "Q921",
    "BRUNEI DARUSSALAM":            "Q921",
    "CAMBODIA":                     "Q424",
    "LAOS":                         "Q819",
    "EAST TIMOR":                   "Q574",
    "TIMOR-LESTE":                  "Q574",
    "GAMBIA":                       "Q1005",
    "GAMBIA THE":                   "Q1005",
    "SENEGAL":                      "Q1041",
    "SIERRA LEONE":                 "Q1044",
    "IVORY COAST":                  "Q1008",
    "COTE D'IVOIRE":                "Q1008",
    "BURKINA FASO":                 "Q965",
    "UPPER VOLTA":                  "Q965",
    "MALI":                         "Q912",
    "MAURITANIA":                   "Q1025",
    "NIGER":                        "Q1032",
    "BENIN":                        "Q962",
    "TOGO":                         "Q945",
    "CAMEROON":                     "Q1009",
    "CHAD":                         "Q657",
    "CENTRAL AFRICAN REPUBLIC":     "Q929",
    "CONGO":                        "Q971",
    "CONGO, DEMOCRATIC REPUBLIC OF": "Q974",
    "DEMOCRATIC REPUBLIC OF THE CONGO": "Q974",
    "ZAIRE":                        "Q974",
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
    "COMORO ISLANDS":               "Q970",
    "CAPE VERDE":                   "Q1011",
    "EQUATORIAL GUINEA":            "Q983",
    "SAO TOME AND PRINCIPE":        "Q1039",
    "GUINEA":                       "Q1006",
    "GUINEA-BISSAU":                "Q1007",
    "GUINEA BISSAU":                "Q1007",
    "NAURU":                        "Q697",
    "COOK ISLANDS":                 "Q26988",
    "ARUBA":                        "Q21203",
    "ANTILLES":                     "Q25227",
    "NETHERLANDS ANTILLES":         "Q25227",
    "NEW CALEDONIA":                "Q33788",
    "FRENCH POLYNESIA":             "Q30971",
    "ST PIERRE AND MIQUELON":       "Q34617",
    "SURINAME":                     "Q730",
    "SERBIA AND MONTENEGRO":        "Q37024",
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

    # Historical UK colonial territories and protectorates surfaced by
    # the first full corpus run (each label appeared 40+ times). For
    # entities that became modern sovereign states we map to the
    # historical QID where Wikidata has one; otherwise we fall back to
    # the modern successor so treaty graphs still connect.
    "LAND BERLIN":                    "Q64",        # Berlin (incl. former Land West-Berlin)
    "BERLIN WEST":                    "Q56036",     # West Berlin
    "CEYLON":                         "Q854",       # Dominion of Ceylon → Sri Lanka
    "THE GAMBIA":                     "Q1005",
    "SOUTHERN RHODESIA":              "Q217169",    # Self-Governing Colony of Southern Rhodesia
    "SALVADOR":                       "Q792",       # = El Salvador
    "GILBERT AND ELLICE ISLANDS":     "Q1075092",
    "GOLD COAST":                     "Q235011",    # Gold Coast (British colony) → Ghana
    "SARAWAK":                        "Q133816",
    "LEEWARD ISLANDS":                "Q513847",    # British Leeward Islands
    "NORTHERN RHODESIA":              "Q198463",    # → Zambia
    "BRITISH SOLOMON ISLANDS":        "Q1335149",
    "SOLOMON ISLANDS PROTECTORATE":   "Q1335149",
    "MALAY STATES, FEDERATED":        "Q509981",    # Federated Malay States
    "MALAY STATES, UNFEDERATED":      "Q738337",    # Unfederated Malay States
    "MALAGASY REPUBLIC":              "Q1019",      # = modern Madagascar (1958 republic)
    "NYASALAND":                      "Q207464",    # Nyasaland Protectorate → Malawi
    "ARGENTINE REPUBLIC":             "Q414",       # = Argentina
    "SURINAM":                        "Q730",       # = Suriname
    "BASUTOLAND":                     "Q230169",    # → Lesotho
    "NEWFOUNDLAND (UK)":              "Q258293",    # Dominion of Newfoundland
    "WINDWARD ISLANDS":               "Q1413408",   # British Windward Islands
    "PALESTINE":                      "Q23792",     # Mandatory Palestine
    "STRAITS SETTLEMENTS":            "Q1186660",
    "BELGIAN CONGO":                  "Q170471",
    "PAPUA":                          "Q1366298",   # Territory of Papua
    "SOMALILAND PROTECTORATE":        "Q269949",    # British Somaliland
    "SOMALILAND":                     "Q269949",    # treaty-era usage = British Somaliland
    "ADEN COLONY":                    "Q484058",
    "SERB-CROAT-SLOVENE STATE":       "Q151624",    # Kingdom of SCS
    "DAHOMEY":                        "Q962",       # Republic of Dahomey → Benin
    "HAYTI":                          "Q790",       # = Haiti
    "NORFOLK ISLAND":                 "Q31057",
    "DANZIG":                         "Q156199",    # Free City of Danzig
    "RUANDA URUNDI":                  "Q221254",    # Belgian mandate
    "CURACAO":                        "Q25279",
    "UNITED ARAB REPUBLIC":           "Q207401",    # Egypt + Syria, 1958-71
    "YEMEN, PEOPLES'S DEMOCRATIC REPUBLIC OF": "Q26013",  # South Yemen
    "HONG KONG SAR":                  "Q8646",
    "TUNIS":                          "Q948",       # = Tunisia
    "YEMEN ARAB REPUBLIC":            "Q83036",     # North Yemen
    "MUSCAT":                         "Q1147053",   # Muscat and Oman → Oman
    "UKRAINE S S R":                  "Q133356",    # Ukrainian SSR
    "BRITISH EMPIRE":                 "Q8680",
    "ST CHRISTOPHER, NEVIS AND ANGUILLA": "Q1132381",
    "ST KITTS NEVIS ANGUILLA":        "Q1132381",
    "RHODESIA AND NYASALAND":         "Q221050",    # Federation
    "KOREA":                          "Q42286",     # Korean Empire (treaty-era usage)
    "NEW GUINEA":                     "Q40904",     # Territory of New Guinea
}

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
_TITLE_ALT_RE = re.compile(r"\s*\[([^\[\]]{1,80})\]\s*$")


def pct(n: int, d: int) -> float | None:
    return round(n / d * 100, 2) if d else None


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
    return FCDO_COUNTRY[slug_country(label)]


def subject_uri(subject: str) -> URIRef:
    return FCDO_SUBJECT[re.sub(r"[^A-Za-z0-9]+", "_", subject).strip("_")]


def action_uri(action: str) -> URIRef:
    slug = ACTION_SLUG.get(action) or re.sub(
        r"[^a-z0-9]+", "-",
        action.lower(),
    ).strip("-")
    return FCDO_ACTION[slug or "other"]


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
    g.bind("fcdo",   FCDO)
    g.bind("fcdo-s", FCDO_SUBJECT)
    g.bind("fcdo-a", FCDO_ACTION)
    g.bind("fcdo-c", FCDO_COUNTRY)
    g.bind("schema", SCHEMA)
    g.bind("dct",    DCT)
    g.bind("wd",     WD)
    g.bind("skos",   SKOS)
    g.bind("prov",   PROV)
    g.bind("owl",    OWL)
    g.bind("xsd",    XSD)
    g.bind("rdfs",   RDFS)


def lift_one(record: dict) -> tuple[URIRef, rdflib.Graph, dict]:
    rid = str(record["id"])
    treaty = URIRef(f"https://treaties.fcdo.gov.uk/awweb/awfp/recno/{rid}")
    graph_uri = treaty  # named graph IRI == treaty IRI
    g = rdflib.Graph(identifier=graph_uri)
    bind_prefixes(g)

    # Treaty core ------------------------------------------------------
    g.add((treaty, RDF.type, FCDO.Treaty))
    g.add((treaty, RDF.type, SCHEMA.CreativeWork))
    g.add((treaty, FCDO.uktoId, Literal(rid)))
    if record.get("uuid"):
        g.add((treaty, FCDO.uktoUuid, Literal(record["uuid"])))

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
        g.add((treaty, FCDO.subject, s_uri))
        g.add((treaty, DCT.subject, s_uri))
        g.add((s_uri, RDF.type, SKOS.Concept))
        g.add((s_uri, SKOS.prefLabel, Literal(subj, lang="en")))
        g.add((s_uri, SKOS.inScheme,
               URIRef("https://forgetmenot.local/fcdo/subject/")))

    biorm = record.get("bilateral_or_multilateral")
    if biorm == "BI":
        g.add((treaty, FCDO.kind, Literal("bilateral")))
        g.add((treaty, FCDO.isBilateral, Literal(True)))
    elif biorm == "MULTI":
        g.add((treaty, FCDO.kind, Literal("multilateral")))
        g.add((treaty, FCDO.isBilateral, Literal(False)))

    # Dates ------------------------------------------------------------
    signed_iso = parse_dmy(record.get("signed_date"))
    if signed_iso:
        g.add((treaty, FCDO.signedDate, Literal(signed_iso, datatype=XSD.date)))
    elif record.get("signed_date"):
        g.add((treaty, FCDO.signedDateText, Literal(record["signed_date"])))
    if record.get("signed_place"):
        g.add((treaty, FCDO.signedPlace,
               Literal(record["signed_place"], lang="en")))

    eif_iso = parse_dmy(record.get("definitive_eif_date"))
    if eif_iso:
        g.add((treaty, FCDO.entryIntoForceDate,
               Literal(eif_iso, datatype=XSD.date)))

    # References -------------------------------------------------------
    ref_stats = {"total": 0, "with_url": 0, "with_cmd": 0, "with_series": 0}
    for raw in (record.get("references") or []):
        if not raw:
            continue
        ref_stats["total"] += 1
        parsed = parse_reference(raw)
        ref_node = rdflib.BNode()
        g.add((treaty, FCDO.reference, ref_node))
        g.add((ref_node, RDF.type, FCDO.Reference))
        g.add((ref_node, RDFS.label, Literal(parsed["text"])))
        # raw form for round-trip compatibility with bridge files
        g.add((treaty, FCDO.referenceText, Literal(raw)))
        if "series" in parsed:
            g.add((ref_node, FCDO.series, Literal(parsed["series"])))
            ref_stats["with_series"] += 1
        if "command_paper" in parsed:
            cp = parsed["command_paper"]
            g.add((ref_node, FCDO.commandPaper, Literal(cp)))
            g.add((treaty, FCDO.commandPaper, Literal(cp)))
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
        qid = PARTY_TO_QID.get(key)
        if qid:
            party_stats["resolved"] += 1
        if key in seen_parties:
            continue
        seen_parties.add(key)
        c_uri = country_uri(label)
        g.add((treaty, FCDO.party, c_uri))
        # Ensure the country is typed and labelled. We use the raw
        # label so case differences (UPPERCASE sovereign vs Mixed-Case
        # overseas territory) round-trip.
        g.add((c_uri, RDF.type, FCDO.Country))
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
    for pd in (record.get("parties_detail") or []):
        country_label = pd.get("country")
        if not country_label:
            continue
        action_stats["total"] += 1
        c_uri = country_uri(country_label)
        # Make sure the country is typed even if it wasn't in parties.
        if country_label.strip().upper() not in seen_parties:
            g.add((treaty, FCDO.party, c_uri))
            g.add((c_uri, RDF.type, FCDO.Country))
            g.add((c_uri, RDFS.label, Literal(country_label, lang="en")))
            qid = PARTY_TO_QID.get(country_label.strip().upper())
            if qid:
                g.add((c_uri, OWL.sameAs, WD[qid]))
                g.add((c_uri, SCHEMA.sameAs, WD[qid]))
            seen_parties.add(country_label.strip().upper())

        ev = rdflib.BNode()
        g.add((treaty, FCDO.partyAction, ev))
        g.add((ev, RDF.type, FCDO.TreatyAction))
        g.add((ev, FCDO.country, c_uri))
        g.add((ev, FCDO.countryLabel, Literal(country_label, lang="en")))

        action = pd.get("action")
        if action:
            a_uri = action_uri(action)
            g.add((ev, FCDO.action, a_uri))
            g.add((a_uri, RDF.type, SKOS.Concept))
            g.add((a_uri, SKOS.prefLabel, Literal(action)))
            g.add((a_uri, SKOS.inScheme,
                   URIRef("https://forgetmenot.local/fcdo/action/")))
        else:
            action_stats["null"] += 1

        ad = parse_dmy(pd.get("action_date"))
        if ad:
            g.add((ev, FCDO.actionDate,
                   Literal(ad, datatype=XSD.date)))
        ed = parse_dmy(pd.get("effective_date"))
        if ed:
            g.add((ev, FCDO.effectiveDate,
                   Literal(ed, datatype=XSD.date)))

    # Provenance: document_url is the canonical UKTO HTML/PDF; some
    # have spaces / unsafe chars and need percent-encoding.
    src = record.get("document_url")
    if src:
        g.add((treaty, DCT.source, URIRef(safe_uri(src))))
        g.add((treaty, SCHEMA.url, URIRef(safe_uri(src))))

    # Capture timestamp on the treaty as well as on the graph (below)
    # so downstream consumers that flatten quads don't lose it.
    if record.get("captured_at"):
        g.add((treaty, FCDO.capturedAt,
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

def lift_to_files(path: Path, refresh: bool) -> dict:
    """Run lift_one for a record, write per-treaty .ttl, return summary."""
    rid = path.stem
    ttl_path = OUT_DIR / f"{rid}.ttl"
    if not refresh and ttl_path.exists():
        # Treat existing TTL as authoritative.
        return {
            "id": rid,
            "ttl_path": str(ttl_path),
            "reused": True,
        }
    try:
        rec = json.loads(path.read_text())
    except (json.JSONDecodeError, OSError) as exc:
        return {"id": rid, "error": f"read: {exc}"}

    treaty, g, stat = lift_one(rec)
    ttl_path.parent.mkdir(parents=True, exist_ok=True)
    g.serialize(destination=str(ttl_path), format="turtle")
    return {
        "id": rid,
        "ttl_path": str(ttl_path),
        "triples": stat["triples"],
        "unmapped_parties": stat["unmapped_parties"],
        "thin": stat["thin"],
        "captured_at": rec.get("captured_at"),
        "document_url": rec.get("document_url"),
        "graph_uri": str(treaty),
        "ref_stats":    stat["ref_stats"],
        "party_stats":  stat["party_stats"],
        "action_stats": stat["action_stats"],
        "date_stats":   stat["date_stats"],
        "has_subject":  stat["has_subject"],
        "has_biorm":    stat["has_biorm"],
    }


def append_quads(nq_handle, ttl_path: Path, graph_uri: str) -> int:
    """Append a TTL file as N-Quads to nq_handle. Returns quad count."""
    g = rdflib.Graph()
    g.parse(str(ttl_path), format="turtle")
    out = []
    quad_count = 0
    graph_term = URIRef(safe_uri(graph_uri))
    for s, p, o in g:
        # NT format renders s, p, o; we append the graph term ourselves.
        ds = rdflib.Dataset()
        ng = ds.graph(graph_term)
        ng.add((s, p, o))
        # rdflib's "nquads" serialiser on a Dataset is what we want.
        nq = ds.serialize(format="nquads").strip()
        if nq:
            out.append(nq)
            quad_count += 1
    if out:
        nq_handle.write("\n".join(out) + "\n")
    return quad_count


def stream_dataset(records: list[Path], summaries: list[dict],
                   nq_path: Path) -> int:
    """Streaming N-Quads writer.

    Builds the file one record at a time using rdflib to format each
    triple as a single N-Quad line. Returns total quads written.
    """
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


def _nt_quad(s, p, o, g) -> str:
    """Emit one N-Quad line. Hand-built so we don't materialise a
    Dataset per triple."""
    return f"{s.n3()} {p.n3()} {o.n3()} {g.n3()} .\n"


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

    # When a TTL was reused (no .json read), pick up captured_at /
    # document_url from disk so the prov side-file is still complete.
    for i, summ in enumerate(summaries):
        if summ.get("reused"):
            try:
                rec = json.loads(records[i].read_text())
            except (json.JSONDecodeError, OSError):
                continue
            summ["graph_uri"] = (
                f"https://treaties.fcdo.gov.uk/awweb/awfp/recno/{records[i].stem}"
            )
            summ["captured_at"] = rec.get("captured_at")
            summ["document_url"] = rec.get("document_url")

    nq_path = OUT_DIR / "all.nq"
    total_quads = stream_dataset(records, summaries, nq_path)
    prov_path = OUT_DIR / "_provenance.nq"
    prov_quads = write_provenance(records, summaries, prov_path)

    if args.gzip:
        with nq_path.open("rb") as src, gzip.open(
            str(nq_path) + ".gz", "wb"
        ) as dst:
            dst.writelines(src)

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

    # Persist the full unmapped tail to a side file (top 50 still
    # surfaced in _index.json for at-a-glance triage).
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
        "nquads_path": str(nq_path),
        "provenance_path": str(prov_path),
        "dataset_path": str(OUT_DIR / "_dataset.ttl"),
        "vocab_path": str(OUT_DIR / "fcdo-vocab.ttl"),
        "unmapped_party_labels_path": str(unmapped_path),
        "unmapped_party_labels_total": len(unmapped),
        "party_qid_map_size": len(PARTY_TO_QID),
        "unmapped_party_labels": [
            [k, n] for k, n in unmapped_sorted[:50]
        ],
        "coverage": coverage,
    }
    (OUT_DIR / "_index.json").write_text(json.dumps(summary, indent=2))

    # void:Dataset self-description --------------------------------
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


def write_dataset_descriptor(path: Path, summary: dict,
                              nq_path: Path, prov_path: Path) -> None:
    """Emit a tiny void:Dataset Turtle file describing what's in this
    directory: how many quads, how many records, what the named-graph
    convention is, where to find the vocab and the provenance side
    file. Intended as the first thing a downstream consumer should
    read."""
    g = rdflib.Graph()
    bind_prefixes(g)
    VOID = Namespace("http://rdfs.org/ns/void#")
    COV = Namespace("https://forgetmenot.local/fcdo/coverage/")
    g.bind("void", VOID)
    g.bind("fcdo-cov", COV)

    ds = URIRef("https://forgetmenot.local/fcdo/dataset/factoids")
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
    # void:dataDump should point at a repo-relative location; emit the
    # filenames as IRIs against a stable repository-content base so
    # downstream consumers can resolve them however they obtained the
    # corpus (git clone, tarball, etc).
    DATA_BASE = "https://forgetmenot.local/fcdo/dataset/"
    g.add((ds, VOID.dataDump, URIRef(DATA_BASE + nq_path.name)))
    g.add((ds, VOID.dataDump, URIRef(DATA_BASE + prov_path.name)))
    g.add((ds, VOID.triples,
           Literal(summary["approximate_triples"], datatype=XSD.integer)))
    g.add((ds, VOID.entities,
           Literal(summary["records_lifted"], datatype=XSD.integer)))
    g.add((ds, VOID.vocabulary,
           URIRef("https://forgetmenot.local/fcdo")))
    g.add((ds, VOID.exampleResource,
           URIRef("https://treaties.fcdo.gov.uk/awweb/awfp/recno/72835")))

    # Coverage-as-data so a SPARQL query can answer "how complete?"
    cov = summary["coverage"]
    for k, v in cov.items():
        if v is None:
            continue
        prop = URIRef(f"https://forgetmenot.local/fcdo/coverage/{k}")
        dtype = XSD.decimal if isinstance(v, float) else XSD.integer
        g.add((ds, prop, Literal(v, datatype=dtype)))

    # Documented gaps as plain-text statements so a reader sees them
    # before discovering them empirically.
    for note in [
        "Signatory NAMES (the persons who actually signed) are NOT present. FCDO's public-anonymous surface does not expose them; the lift can therefore not answer 'which UK treaties were signed by which Minister'. The 'parties' field is countries, not people.",
        f"Crawl is partial: {summary['records_lifted']} records of FCDO's ~21,957 total. A leisurely crawler is filling in the remainder; re-run scripts/fcdo_treaties_extract.py --refresh after new records land.",
        f"{summary['records_thin']} of {summary['records_lifted']} lifted records ({pct(summary['records_thin'], summary['records_lifted'])}%) are 'thin' -- catalogue stubs with title + uktoId only, no parties / subject / dates. These are emitted as bare fcdo:Treaty resources.",
        f"Each per-treaty named graph independently asserts the rdf:type, rdfs:label, owl:sameAs of every country it mentions. This means e.g. <fcdo-c:UNITED_KINGDOM rdf:type fcdo:Country> appears in thousands of graphs. Defensible (per-graph closure) but downstream consumers should account for it when computing distinct-resource counts.",
    ]:
        g.add((ds, RDFS.comment, Literal(note, lang="en")))

    g.serialize(destination=str(path), format="turtle")


if __name__ == "__main__":
    sys.exit(main())
