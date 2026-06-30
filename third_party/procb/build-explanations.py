#!/usr/bin/env python3
"""Merge the headless indicative-query results (example-sets.json) with
hand-written, data-grounded descriptions into explanations.json — the pre-baked
"what does a situation covered by this shape amount to" payload the static graph
page shows (it can't call an LLM itself).

Each entry: {kind, title, query, vars, rows, n, description, touches}.
Run build-examples.py first to refresh the bindings.
"""
import json, pathlib
HERE = pathlib.Path(__file__).parent
ex = json.loads((HERE / "example-sets.json").read_text())
hl = json.loads((HERE / "highlights.json").read_text())

TITLE = {
 "procedure": "Procedure — the named processes",
 "procedures": "Procedures — the full catalogue (SIs + treaties)",
 "procedure_routes": "Procedure routes — the state-machine transitions",
 "procedure_step_type": "Step types used within one procedure",
 "procedure_step_collections": "Step collections (procedure stages)",
 "step_types": "The step-type vocabulary",
 "calculation_styles": "Clock calculation styles",
 "clocks": "Scrutiny clocks (objection periods)",
 "enabling_legislations": "Enabling legislation (the parent Acts)",
 "houses": "Houses",
 "house_steps": "Steps belonging to a House",
 "legislatures": "Legislatures (incl. devolved)",
 "legislature_steps": "Steps within a legislature",
 "organisations_accountable_to_parliament": "Organisations accountable to Parliament",
 "step_business_items": "Business items (real, dated occurrences)",
 "treaty_work_packages": "Treaty papers and their work packages",
 "work_package": "Work package — an instrument's scrutiny bundle",
 "step_procedures": "Which procedures a step belongs to",
}

DESCR = {
 "procedure":
  "Each :Procedure is a named parliamentary process with a human description. The live rows are "
  "the statutory-instrument procedures — Made negative, Draft affirmative, Draft negative, Made "
  "affirmative and Proposed negative statutory instrument — each described by the scrutiny rule it "
  "encodes (e.g. Made negative covers “instruments subject to the made negative procedure”). "
  "A Procedure sits at the top of the model: it owns the steps, routes, step-collections and clocks "
  "that the other shapes elaborate.",
 "procedures":
  "The same :Procedure class across its full range — not only SI procedures (Draft/Made affirmative, "
  "Draft/Made negative) but treaty scrutiny too: “Treaties subject to the Constitutional Reform and "
  "Governance Act”, whose description begins “A treaty may be ratified if the Commons do not resolve "
  "against it…”. So one shape spans both secondary-legislation and treaty-ratification processes; "
  "procedureDisplayOrder gives the catalogue ordering.",
 "procedure_routes":
  "A :ProcedureRoute is a directed edge between two steps of a procedure "
  "(procedureRouteIsFromProcedureStep → procedureRouteIsToProcedureStep). The rows show the "
  "“Legislative Consent Motion – Northern Ireland” and “UK Public Bills” procedures wiring real "
  "milestones (“10 working days expired”, “5 working days clock ends” — all Business steps) into "
  "gateway steps typed OR, NOT and Summation. The route set is the procedure’s flowchart: business "
  "steps are the events, the gateway-typed target steps are the boolean logic deciding what becomes "
  "reachable next.",
 "procedure_step_type":
  "For a single procedure (Made negative), the distinct :ProcedureStepTypes its steps use: Business "
  "step (a real milestone) plus the logic/gateway types AND, OR, NOT and Decision. This is the key to "
  "reading the graph — most nodes in a procedure are not events but boolean gates that compose the "
  "events into a scrutiny flow.",
 "procedure_step_collections":
  "A :ProcedureStepCollection is a named bundle of steps inside a procedure — here “Proposed negative "
  "statutory instruments…” under the procedure of the same name, and “Commons first reading” under "
  "UK Public Bills. Collections group the steps of one stage so a procedure can be presented "
  "stage-by-stage.",
 "step_types":
  "The global vocabulary of :ProcedureStepTypes across all procedures. Beyond Business step and "
  "Decision, the rows reveal arithmetic/logic gate types — AND, EQUALS, INCREMENT — confirming the "
  "procedure model is a little computational graph: gates combine and count conditions (INCREMENT a "
  "counter, test EQUALS) to drive the flow, not merely record events.",
 "calculation_styles":
  "A :CalculationStyle says how a scrutiny clock counts. The rows distinguish “Bicameral instruments "
  "(clock stops if both / either House…)”, “Commons only instruments”, “Commons only sitting days” and "
  "“Proposed negative statutory instruments” — i.e. whether the objection-period countdown pauses on "
  "one or both Houses and whether it counts calendar or sitting days. It is the rulebook attached to "
  "the clocks.",
 "clocks":
  "A :Clock is the statutory countdown attached to a procedure. Real rows: the Draft negative "
  "objection period of 40 days; the Enhanced affirmative under IPA16 clocks of 60 / 40 / 30 days for "
  "the Investigatory Powers Act procedure; and the Legislative Reform Order 40-day pre-approval "
  "period. dayCount is the length; the calculation style decides how those days are counted.",
 "enabling_legislations":
  "An :EnablingThing is the primary Act of Parliament granting the power a statutory instrument is "
  "made under. The rows are real Acts — Academies Act 2010 (c.32), Acquisition of Land Act 1981 "
  "(c.67), Administration of Estates Act 1925 — each with its chapter number, year and royal-assent "
  "date. This is the link from secondary legislation back up to its enabling statute.",
 "houses":
  "Closed-class: :House has exactly two instances, House of Commons and House of Lords. Steps and "
  "clocks reference a House to say which chamber a milestone or countdown belongs to.",
 "house_steps":
  "The steps pinned to a given :House. For the House of Lords the rows are committee-allocation steps "
  "— “Allocated to the EU Energy and Environment Sub-Committee”, “…EU External Affairs Sub-Committee”, "
  "etc. So procedureStepHasHouse lets the same procedural machinery carry chamber-specific committee "
  "routing.",
 "legislatures":
  ":Legislature spans more than Westminster: the rows are the Northern Ireland Assembly, Scottish "
  "Parliament, Senedd Cymru and UK Parliament. Steps reference a legislature so devolved-consent "
  "procedures can be modelled alongside UK ones.",
 "legislature_steps":
  "Steps attached to each devolved :Legislature: the Northern Ireland Assembly’s “10 working days "
  "expired” / “5 working days clock ends”, the Scottish Parliament’s “Bill provides relevant "
  "delegated powers”, and the Senedd’s Business-Committee deadline steps. These are the building "
  "blocks of legislative-consent procedures.",
 "organisations_accountable_to_parliament":
  "A government organisation (laying body / department) with the date it became accountable. Rows: "
  "Attorney General’s Office (from 2008-12-03), Cabinet Office (1916-12-11), Department for Business "
  "and Trade (2023-02-07) and its predecessor departments — capturing machinery-of-government "
  "history. These are the bodies that lay instruments and treaties before the House.",
 "step_business_items":
  "A :BusinessItem is where the abstract procedure meets a real date — an actual occurrence of a step "
  "in a work package. The rows tie the Draft affirmative and Made negative procedures to concrete "
  "dated items (2027-05-19, 2027-03-31, …). Business items are how a template procedure becomes a "
  "specific instrument’s timeline.",
 "treaty_work_packages":
  "For the treaty side of the model, a laid :Paper and its :WorkPackage. Rows are real treaties laid "
  "for scrutiny — “Treaty, done at London on 26 May 2026…”, “Agreement, done at Chișinău on 20 "
  "November…”, a Council of Europe Convention, a UK-EU partnership-council decision — each with the "
  "date it entered business. The same work-package machinery as SIs, applied to CRaG treaty scrutiny.",
 "work_package":
  "A :WorkPackage bundles everything about one instrument’s passage: the laid :Paper, the "
  ":WorkPackagedThing it concerns (with a legislation.gov.uk web link), the :Laying event and its "
  "business items. Rows are real SIs — Client Money Protection Schemes…, Fire and Rescue Authorities "
  "(National Framework)…, Town and Country Planning (Pre-commencement…) — each linking out to its "
  "text on legislation.gov.uk.",
 "step_procedures":
  "The inverse view: given a :ProcedureStep, which :Procedures use it. The rows show steps (ALM AG, "
  "EVEL CERT AD, DARO AF) all belonging to the Draft affirmative remedial order procedure (“A remedial "
  "order is an order made by a minister…”). Steps are reused across procedures, so this mapping is "
  "many-to-many.",
}

out = {}
for name, descr in DESCR.items():
    rec = ex.get(name, {})
    if not rec.get("n"):
        print(f"WARN: {name} has no rows in example-sets.json — skipping")
        continue
    touch = hl["queries"].get(name, {})
    out[name] = {
        "kind": "query",
        "title": TITLE.get(name, name),
        "query": rec["query"],
        "vars": rec.get("vars", []),
        "rows": rec.get("rows", []),
        "n": rec.get("n", 0),
        "description": descr,
        "touches": {"classes": touch.get("classes", []), "preds": touch.get("preds", [])},
        "endpoint": "https://api.parliament.uk/sparql",
    }

(HERE / "explanations.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
print(f"wrote explanations.json — {len(out)} example sets")
