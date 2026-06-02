// =============================================================================
// kgx/lib/rel-templates.mjs — the pivot/augment registry
//
// Naming the abstraction that's already implicit in daisychain/index.html
// and pivcab/index.html, lifted to a library so daisychain, pivcab, the
// integrated studio, the CLI, and unit tests all consume the same thing.
//
// Implicit op-node API in the kgx pages (the cowpaths, paved):
//
//   Bundle<T> ─── op ──► { Bundle<U>, Source }
//
//   where `Bundle<T>` (lib/node-flow.mjs) is a typed entity set carrying
//   `items[]`, `type: T`, `label`, plus a lazy bloom for set algebra;
//   and `Source` (makeSource in index.html) is the per-step provenance
//   record (endpoint, engineId, query, ms, named-graphs, ts).
//
// Four op-kinds the pages already use, by their effect on a bundle:
//
//   * SOURCE   () ────────────────────► { Bundle, Source }
//                 (STARTERS[] in index.html — "seed humans / buildings / SIs")
//
//   * PIVOT    Bundle<T> ─────────────► { Bundle<U>, Source }
//     /AUGMENT (REL_TEMPLATES — THIS FILE — typed predicate path with
//               default/tighten/broaden variants, e.g. P19 birthplaces,
//               P40 children + sons/daughters/family, P84 architects/works,
//               P31/P279 class navigation, FPKG appg_officer, DDP
//               si_laying_body)
//
//   * RESTRICT Bundle<T> ─────────────► Bundle<T>
//                 (OPS[bundle.type] chips in index.html — pure-client,
//                  no engine call, no new Source bead)
//
//   * COMBINE  Bundle<T> × Bundle<T> ──► Bundle<T>
//                 (Bundle.union/intersect/difference in node-flow.mjs;
//                  surfaced as A∪B/A∩B/A∖B in pivcab)
//
// The chain that the daisychain spine visualises is a sequence of these
// ops, each minting one bead.
//
// A REL_TEMPLATE shape:
//
//   {
//     id, label, gloss,
//     inputType,  outputType,            // bundle-type contract
//     engineId,                          // which SparqlEngine executes
//     requires(bundle) -> boolean,       // gate on input shape
//     variants: [{
//       id, kind: 'default'|'tighten'|'broaden',
//       label, gloss,
//       namedGraphs: [],                 // for provenance, not query routing
//       build(items) -> string,          // emit SPARQL — PURE
//       parse(rows)  -> items[],         // shape result bindings — PURE
//     }]
//   }
//
// `build()` and `parse()` are pure functions on plain JS values. That's
// what lets us unit-test every variant without network — see
// tests/unit/kgx-rel-templates.test.mjs.
//
// Execution (the impure part, `applyRelation`, still in daisychain/index.html
// today) is one engine.query() + parse() per call, returning a fresh Bundle
// plus the Source bead.
// =============================================================================

import { valuesQids, parsePoint } from './node-flow.mjs';

// Sibling of valuesQids for the FPKG appg-register graph, which keys
// people by MNIS Members API id rather than Wikidata QID.
// The subject URI is <…/services/mnis/members/<id>>; we carry the id
// as bundle item `.mpid`. Throws on empty rather than emit invalid
// SPARQL 1.1 (same contract as valuesQids).
export function valuesMnisPersons(items) {
  const ids = (items || []).map((x) => x.mpid).filter(Boolean);
  const uniq = [...new Set(ids)];
  if (!uniq.length) {
    throw new Error(`valuesMnisPersons: 0 MNIS ids from ${items?.length ?? 0} item(s) — bundle has no .mpid`);
  }
  return uniq
    .map((id) => `<https://data.parliament.uk/membersdataplatform/services/mnis/members/${id}>`)
    .join(' ');
}

export const REL_TEMPLATES = [
  {
    id: 'alma_maters',
    label: 'alma maters',
    gloss: 'institutions these people were educated at (Wikidata P69)',
    inputType: 'human', outputType: 'org',
    engineId: 'qlever-wikidata',
    role: 'primary',
    requires: (b) => b.items.some((x) => /Q\d+$/.test(x.uri)),
    variants: [
      {
        id: 'default', kind: 'default', label: 'P69 — educated at',
        gloss: 'one institution per (person, statement); de-duped + counted',
        namedGraphs: [],
        build: (items) => `
          PREFIX wd:   <http://www.wikidata.org/entity/>
          PREFIX wdt:  <http://www.wikidata.org/prop/direct/>
          PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
          SELECT ?am
            (SAMPLE(?amLbl)   AS ?label)
            (SAMPLE(?img)     AS ?image)
            (SAMPLE(?coord)   AS ?coords)
            (SAMPLE(?ctryLbl) AS ?country)
            (COUNT(DISTINCT ?p) AS ?n)
          WHERE {
            VALUES ?p { ${valuesQids(items)} }
            ?p wdt:P69 ?am .
            OPTIONAL { ?am rdfs:label ?amLbl . FILTER(lang(?amLbl)="en") }
            OPTIONAL { ?am wdt:P18  ?img }
            OPTIONAL { ?am wdt:P625 ?coord }
            OPTIONAL { ?am wdt:P17  ?ctry .
                       OPTIONAL { ?ctry rdfs:label ?ctryLbl . FILTER(lang(?ctryLbl)="en") } }
          } GROUP BY ?am ORDER BY DESC(?n)`,
        parse: (rows) => rows.map((b) => ({
          uri:   b.am.value,
          label: b.label?.value || b.am.value.replace(/^.*\//, ''),
          image: b.image?.value || null,
          country: b.country?.value || null,
          coords: parsePoint(b.coords?.value),
          originCount: +(b.n?.value || 0),
        })),
      },
    ],
  },
  {
    id: 'birthplaces',
    label: 'birthplaces',
    gloss: 'places of birth (Wikidata P19)',
    inputType: 'human', outputType: 'place',
    engineId: 'qlever-wikidata',
    role: 'primary',
    requires: (b) => b.items.some((x) => /Q\d+$/.test(x.uri)),
    variants: [
      {
        id: 'default', kind: 'default', label: 'P19 — place of birth',
        gloss: 'one place per person',
        namedGraphs: [],
        build: (items) => `
          PREFIX wd:   <http://www.wikidata.org/entity/>
          PREFIX wdt:  <http://www.wikidata.org/prop/direct/>
          PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
          SELECT ?bp (SAMPLE(?bpLbl) AS ?label) (SAMPLE(?bpCoord) AS ?coord)
                 (SAMPLE(?img) AS ?image) (SAMPLE(?ctryLbl) AS ?country)
                 (COUNT(DISTINCT ?p) AS ?n)
          WHERE {
            VALUES ?p { ${valuesQids(items)} }
            ?p wdt:P19 ?bp .
            OPTIONAL { ?bp rdfs:label ?bpLbl . FILTER(lang(?bpLbl)="en") }
            OPTIONAL { ?bp wdt:P625 ?bpCoord }
            OPTIONAL { ?bp wdt:P18  ?img }
            OPTIONAL { ?bp wdt:P17  ?ctry .
                       OPTIONAL { ?ctry rdfs:label ?ctryLbl . FILTER(lang(?ctryLbl)="en") } }
          } GROUP BY ?bp ORDER BY DESC(?n)`,
        parse: (rows) => rows.map((b) => ({
          uri: b.bp.value,
          label: b.label?.value || b.bp.value.replace(/^.*\//, ''),
          image: b.image?.value || null,
          country: b.country?.value || null,
          coords: parsePoint(b.coord?.value),
          originCount: +(b.n?.value || 0),
        })),
      },
      {
        id: 'or_residence', kind: 'broaden', label: '+ residence (∪ P551)',
        gloss: 'place of birth OR residence',
        namedGraphs: [],
        build: (items) => `
          PREFIX wd:   <http://www.wikidata.org/entity/>
          PREFIX wdt:  <http://www.wikidata.org/prop/direct/>
          PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
          SELECT ?bp (SAMPLE(?bpLbl) AS ?label) (SAMPLE(?bpCoord) AS ?coord)
                 (SAMPLE(?img) AS ?image) (SAMPLE(?ctryLbl) AS ?country)
                 (COUNT(DISTINCT ?p) AS ?n)
          WHERE {
            VALUES ?p { ${valuesQids(items)} }
            { ?p wdt:P19 ?bp } UNION { ?p wdt:P551 ?bp }
            OPTIONAL { ?bp rdfs:label ?bpLbl . FILTER(lang(?bpLbl)="en") }
            OPTIONAL { ?bp wdt:P625 ?bpCoord }
            OPTIONAL { ?bp wdt:P18  ?img }
            OPTIONAL { ?bp wdt:P17  ?ctry .
                       OPTIONAL { ?ctry rdfs:label ?ctryLbl . FILTER(lang(?ctryLbl)="en") } }
          } GROUP BY ?bp ORDER BY DESC(?n)`,
        parse: (rows) => rows.map((b) => ({
          uri: b.bp.value,
          label: b.label?.value || b.bp.value.replace(/^.*\//, ''),
          image: b.image?.value || null,
          country: b.country?.value || null,
          coords: parsePoint(b.coord?.value),
          originCount: +(b.n?.value || 0),
        })),
      },
    ],
  },
  {
    id: 'children',
    label: 'children',
    gloss: 'design showpiece: Wikidata P40 with tighten/broaden',
    inputType: 'human', outputType: 'human',
    engineId: 'qlever-wikidata',
    role: 'primary',
    requires: (b) => b.items.some((x) => /Q\d+$/.test(x.uri)),
    variants: [
      {
        id: 'default', kind: 'default', label: 'P40 — child',
        gloss: 'one child per parent statement',
        namedGraphs: [],
        build: (items) => `
          PREFIX wd:   <http://www.wikidata.org/entity/>
          PREFIX wdt:  <http://www.wikidata.org/prop/direct/>
          PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
          SELECT ?c (SAMPLE(?lbl) AS ?label) (SAMPLE(?img) AS ?image)
                 (COUNT(DISTINCT ?p) AS ?n)
          WHERE {
            VALUES ?p { ${valuesQids(items)} }
            ?p wdt:P40 ?c .
            OPTIONAL { ?c rdfs:label ?lbl . FILTER(lang(?lbl)="en") }
            OPTIONAL { ?c wdt:P18 ?img }
          } GROUP BY ?c ORDER BY DESC(?n)`,
      },
      {
        id: 'sons', kind: 'tighten', label: 'sons (P40 + P21=male)',
        gloss: 'children filtered to male',
        namedGraphs: [],
        build: (items) => `
          PREFIX wd:   <http://www.wikidata.org/entity/>
          PREFIX wdt:  <http://www.wikidata.org/prop/direct/>
          PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
          SELECT ?c (SAMPLE(?lbl) AS ?label) (SAMPLE(?img) AS ?image)
                 (COUNT(DISTINCT ?p) AS ?n)
          WHERE {
            VALUES ?p { ${valuesQids(items)} }
            ?p wdt:P40 ?c . ?c wdt:P21 wd:Q6581097 .
            OPTIONAL { ?c rdfs:label ?lbl . FILTER(lang(?lbl)="en") }
            OPTIONAL { ?c wdt:P18 ?img }
          } GROUP BY ?c ORDER BY DESC(?n)`,
      },
      {
        id: 'daughters', kind: 'tighten', label: 'daughters (P40 + P21=female)',
        gloss: 'children filtered to female',
        namedGraphs: [],
        build: (items) => `
          PREFIX wd:   <http://www.wikidata.org/entity/>
          PREFIX wdt:  <http://www.wikidata.org/prop/direct/>
          PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
          SELECT ?c (SAMPLE(?lbl) AS ?label) (SAMPLE(?img) AS ?image)
                 (COUNT(DISTINCT ?p) AS ?n)
          WHERE {
            VALUES ?p { ${valuesQids(items)} }
            ?p wdt:P40 ?c . ?c wdt:P21 wd:Q6581072 .
            OPTIONAL { ?c rdfs:label ?lbl . FILTER(lang(?lbl)="en") }
            OPTIONAL { ?c wdt:P18 ?img }
          } GROUP BY ?c ORDER BY DESC(?n)`,
      },
      {
        id: 'family', kind: 'broaden', label: 'family (∪ parents, siblings, spouses)',
        gloss: 'children OR parents OR siblings OR spouses — design example',
        namedGraphs: [],
        build: (items) => `
          PREFIX wd:   <http://www.wikidata.org/entity/>
          PREFIX wdt:  <http://www.wikidata.org/prop/direct/>
          PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
          SELECT ?c (SAMPLE(?lbl) AS ?label) (SAMPLE(?img) AS ?image)
                 (COUNT(DISTINCT ?p) AS ?n)
          WHERE {
            VALUES ?p { ${valuesQids(items)} }
            { ?p wdt:P40 ?c } UNION { ?c wdt:P40 ?p }
            UNION { ?p wdt:P3373 ?c } UNION { ?p wdt:P26 ?c }
            OPTIONAL { ?c rdfs:label ?lbl . FILTER(lang(?lbl)="en") }
            OPTIONAL { ?c wdt:P18 ?img }
          } GROUP BY ?c ORDER BY DESC(?n)`,
      },
    ],
  },
  {
    id: 'current_constituency',
    label: 'current constituency',
    gloss: 'Parliament DDP via rdfs:seeAlso bridge — non-Wikidata source',
    inputType: 'human', outputType: 'constituency',
    engineId: 'parl-sparql',
    role: 'primary',
    requires: (b) => b.items.some((x) => /Q\d+$/.test(x.uri)),
    variants: [
      {
        id: 'default', kind: 'default', label: 'open SeatIncumbency',
        gloss: 'the constituency they currently sit for',
        namedGraphs: [],
        build: (items) => `
          PREFIX wd:     <http://www.wikidata.org/entity/>
          PREFIX schema: <https://id.parliament.uk/schema/>
          PREFIX rdfs:   <http://www.w3.org/2000/01/rdf-schema#>
          SELECT ?cg (SAMPLE(?cgName) AS ?label) (COUNT(DISTINCT ?qid) AS ?n)
          WHERE {
            VALUES ?qid { ${valuesQids(items)} }
            ?person rdfs:seeAlso ?qid ;
                    a schema:Member ;
                    schema:memberHasParliamentaryIncumbency ?in .
            ?in a schema:SeatIncumbency .
            FILTER NOT EXISTS { ?in schema:incumbencyEndDate ?e }
            ?in schema:seatIncumbencyHasHouseSeat/schema:houseSeatHasConstituencyGroup ?cg .
            ?cg schema:constituencyGroupName ?cgName .
          } GROUP BY ?cg ORDER BY DESC(?n)`,
        parse: (rows) => rows.map((b) => ({
          uri: b.cg.value,
          label: b.label?.value || b.cg.value.replace(/^.*\//, ''),
          originCount: +(b.n?.value || 0),
          image: null, country: null, coords: null,
        })),
      },
      {
        id: 'ever_held', kind: 'broaden', label: 'every constituency ever held',
        gloss: 'all SeatIncumbencies, open or closed',
        namedGraphs: [],
        build: (items) => `
          PREFIX wd:     <http://www.wikidata.org/entity/>
          PREFIX schema: <https://id.parliament.uk/schema/>
          PREFIX rdfs:   <http://www.w3.org/2000/01/rdf-schema#>
          SELECT ?cg (SAMPLE(?cgName) AS ?label) (COUNT(DISTINCT ?qid) AS ?n)
          WHERE {
            VALUES ?qid { ${valuesQids(items)} }
            ?person rdfs:seeAlso ?qid ;
                    a schema:Member ;
                    schema:memberHasParliamentaryIncumbency ?in .
            ?in a schema:SeatIncumbency ;
                schema:seatIncumbencyHasHouseSeat/schema:houseSeatHasConstituencyGroup ?cg .
            ?cg schema:constituencyGroupName ?cgName .
          } GROUP BY ?cg ORDER BY DESC(?n)`,
        parse: (rows) => rows.map((b) => ({
          uri: b.cg.value,
          label: b.label?.value || b.cg.value.replace(/^.*\//, ''),
          originCount: +(b.n?.value || 0),
          image: null, country: null, coords: null,
        })),
      },
    ],
  },
  {
    id: 'appg_officer',
    label: 'APPGs they officer',
    gloss: 'FPKG named graph (transparency#graph/appg-register) — bridge via P10428 → MNIS id',
    inputType: 'human', outputType: 'appg',
    engineId: 'fpkg',
    role: 'primary',
    requires: (b) => b.items.some((x) => x.mpid),
    variants: [
      {
        id: 'default', kind: 'default', label: 'officer of (any role)',
        gloss: 'distinct APPGs each input person officers',
        namedGraphs: ['https://forgetmenot.example/transparency#graph/appg-register'],
        build: (items) => `
          SELECT ?appg (SAMPLE(?appgLbl) AS ?label) (COUNT(DISTINCT ?p) AS ?n)
          WHERE {
            VALUES ?p { ${valuesMnisPersons(items)} }
            GRAPH <https://forgetmenot.example/transparency#graph/appg-register> {
              ?p <https://forgetmenot.example/transparency#officerOf> ?appg .
              OPTIONAL { ?appg <https://forgetmenot.example/transparency#title> ?appgLbl }
            }
          } GROUP BY ?appg ORDER BY DESC(?n)`,
        parse: (rows) => rows.map((b) => ({
          uri: b.appg.value,
          label: b.label?.value || b.appg.value.replace(/^.*\//, ''),
          originCount: +(b.n?.value || 0),
          image: null, country: null, coords: null,
        })),
      },
    ],
  },
  // -- Parallax pair: building → architects, and architects → buildings.
  {
    id: 'architects',
    label: 'architects',
    gloss: 'designers of these buildings (Wikidata P84)',
    inputType: 'building', outputType: 'human',
    engineId: 'qlever-wikidata',
    role: 'primary',
    requires: (b) => b.items.some((x) => /Q\d+$/.test(x.uri)),
    variants: [
      {
        id: 'default', kind: 'default', label: 'P84 — architect',
        gloss: 'one architect per building (de-duplicated)',
        namedGraphs: [],
        build: (items) => `
          PREFIX wd:   <http://www.wikidata.org/entity/>
          PREFIX wdt:  <http://www.wikidata.org/prop/direct/>
          PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
          SELECT ?a (SAMPLE(?lbl) AS ?label) (SAMPLE(?img) AS ?image)
                    (COUNT(DISTINCT ?b) AS ?n)
          WHERE {
            VALUES ?b { ${valuesQids(items)} }
            ?b wdt:P84 ?a .
            OPTIONAL { ?a rdfs:label ?lbl . FILTER(lang(?lbl)="en") }
            OPTIONAL { ?a wdt:P18 ?img }
          } GROUP BY ?a ORDER BY DESC(?n)`,
        parse: (rows) => rows.map((b) => ({
          uri: b.a.value,
          label: b.label?.value || b.a.value.replace(/^.*\//, ''),
          image: b.image?.value || null,
          originCount: +(b.n?.value || 0),
          firstYr: null, lastYr: null, latestStart: null, sitting: false,
          parties: [], gender: null, citizenships: [], mpid: null, decade: null,
        })),
      },
    ],
  },
  {
    id: 'works_by',
    label: 'works by',
    gloss: 'buildings these architects designed (Wikidata ^P84)',
    inputType: 'human', outputType: 'building',
    engineId: 'qlever-wikidata',
    role: 'primary',
    requires: (b) => b.items.some((x) => /Q\d+$/.test(x.uri)),
    variants: [
      {
        id: 'default', kind: 'default', label: '^P84 — designed buildings',
        gloss: 'every building Wikidata records as designed by these people',
        namedGraphs: [],
        build: (items) => `
          PREFIX wd:   <http://www.wikidata.org/entity/>
          PREFIX wdt:  <http://www.wikidata.org/prop/direct/>
          PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
          SELECT ?b (SAMPLE(?lbl) AS ?label) (SAMPLE(?img) AS ?image)
                    (SAMPLE(?coord) AS ?coords) (SAMPLE(?ctry) AS ?country)
                    (COUNT(DISTINCT ?a) AS ?n)
          WHERE {
            VALUES ?a { ${valuesQids(items)} }
            ?b wdt:P84 ?a .
            OPTIONAL { ?b rdfs:label ?lbl . FILTER(lang(?lbl)="en") }
            OPTIONAL { ?b wdt:P18  ?img }
            OPTIONAL { ?b wdt:P625 ?coord }
            OPTIONAL { ?b wdt:P17/rdfs:label ?ctry . FILTER(lang(?ctry)="en") }
          } GROUP BY ?b ORDER BY DESC(?n)`,
        parse: (rows) => rows.map((b) => ({
          uri: b.b.value,
          label: b.label?.value || b.b.value.replace(/^.*\//, ''),
          image: b.image?.value || null,
          coords: parsePoint(b.coords?.value),
          country: b.country?.value || null,
          originCount: +(b.n?.value || 0),
        })),
      },
    ],
  },
  // -- DDP relation template: SI → laying body.
  {
    id: 'si_laying_body',
    label: 'laid by',
    gloss: 'government body that laid these SIs (DDP)',
    inputType: 'si', outputType: 'org',
    engineId: 'parl-sparql',
    role: 'primary',
    requires: (b) => b.items.some((x) => x.uri.startsWith('https://id.parliament.uk/')),
    variants: [
      {
        id: 'default', kind: 'default', label: 'via Laying → LayingBody',
        gloss: 'one LayingBody per SI, deduped',
        namedGraphs: [],
        build: (items) => {
          const values = items.map((x) => `<${x.uri}>`).join(' ');
          return `
            PREFIX schema: <https://id.parliament.uk/schema/>
            SELECT ?lb (SAMPLE(?lbName) AS ?label) (COUNT(DISTINCT ?si) AS ?n)
            WHERE {
              VALUES ?si { ${values} }
              ?si schema:laidThingHasLaying/schema:layingHasLayingBody ?lb .
              ?lb schema:name ?lbName .
            } GROUP BY ?lb ORDER BY DESC(?n)`;
        },
        parse: (rows) => rows.map((b) => ({
          uri: b.lb.value,
          label: b.label?.value || b.lb.value.replace(/^.*\//, ''),
          originCount: +(b.n?.value || 0),
          image: null, country: null, coords: null,
        })),
      },
    ],
  },

  // -- Wikidata navigation primitives ----------------------------------------
  // "I have a thing. What is it? What else is like it? Narrow by where."
  // These power the canonical Parallax move:
  //   any thing → P31 → class → ^P31 → siblings → narrow by P17 country.
  // Input/output types are intentionally generic — both wd_thing and
  // wd_class can flow through these chips.
  {
    id: 'wd_class_of',
    label: 'is-a (P31)',
    gloss: 'What type / class is this thing?',
    inputType: 'wd_thing', outputType: 'wd_class',
    engineId: 'qlever-wikidata',
    role: 'primary',
    requires: (b) => b.items.some((x) => /Q\d+$/.test(x.uri)),
    variants: [
      {
        id: 'default', kind: 'default', label: 'P31 — instance of',
        gloss: 'the class(es) Wikidata records this thing as an instance of',
        namedGraphs: [],
        build: (items) => `
          PREFIX wd:   <http://www.wikidata.org/entity/>
          PREFIX wdt:  <http://www.wikidata.org/prop/direct/>
          PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
          SELECT ?cls (SAMPLE(?lbl) AS ?label) (SAMPLE(?img) AS ?image)
                      (COUNT(DISTINCT ?x) AS ?n)
          WHERE {
            VALUES ?x { ${valuesQids(items)} }
            ?x wdt:P31 ?cls .
            OPTIONAL { ?cls rdfs:label ?lbl . FILTER(lang(?lbl)="en") }
            OPTIONAL { ?cls wdt:P18 ?img }
          } GROUP BY ?cls ORDER BY DESC(?n)`,
        parse: (rows) => rows.map((b) => ({
          uri:   b.cls.value,
          label: b.label?.value || b.cls.value.replace(/^.*\//, ''),
          image: b.image?.value || null,
          originCount: +(b.n?.value || 0),
          country: null, coords: null,
        })),
      },
    ],
  },
  {
    id: 'wd_subclasses',
    label: 'subclasses (^P279)',
    gloss: 'narrower classes that are direct subclasses of this one',
    inputType: 'wd_class', outputType: 'wd_class',
    engineId: 'qlever-wikidata',
    role: 'primary',
    requires: (b) => b.items.some((x) => /Q\d+$/.test(x.uri)),
    variants: [
      {
        id: 'default', kind: 'default', label: '^P279 — direct subclass',
        gloss: 'classes whose direct superclass is one of these',
        namedGraphs: [],
        build: (items) => `
          PREFIX wd:   <http://www.wikidata.org/entity/>
          PREFIX wdt:  <http://www.wikidata.org/prop/direct/>
          PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
          SELECT ?sub (SAMPLE(?lbl) AS ?label)
                      (COUNT(DISTINCT ?cls) AS ?n)
          WHERE {
            VALUES ?cls { ${valuesQids(items)} }
            ?sub wdt:P279 ?cls .
            OPTIONAL { ?sub rdfs:label ?lbl . FILTER(lang(?lbl)="en") }
          } GROUP BY ?sub ORDER BY DESC(?n) LIMIT 200`,
        parse: (rows) => rows.map((b) => ({
          uri:   b.sub.value,
          label: b.label?.value || b.sub.value.replace(/^.*\//, ''),
          image: null, country: null, coords: null,
          originCount: +(b.n?.value || 0),
        })),
      },
    ],
  },
  {
    id: 'wd_superclasses',
    label: 'superclasses (P279)',
    gloss: 'broader classes that this is a subclass of',
    inputType: 'wd_class', outputType: 'wd_class',
    engineId: 'qlever-wikidata',
    role: 'primary',
    requires: (b) => b.items.some((x) => /Q\d+$/.test(x.uri)),
    variants: [
      {
        id: 'default', kind: 'default', label: 'P279 — subclass of',
        gloss: 'direct superclasses (one hop)',
        namedGraphs: [],
        build: (items) => `
          PREFIX wd:   <http://www.wikidata.org/entity/>
          PREFIX wdt:  <http://www.wikidata.org/prop/direct/>
          PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
          SELECT ?sup (SAMPLE(?lbl) AS ?label)
                      (COUNT(DISTINCT ?cls) AS ?n)
          WHERE {
            VALUES ?cls { ${valuesQids(items)} }
            ?cls wdt:P279 ?sup .
            OPTIONAL { ?sup rdfs:label ?lbl . FILTER(lang(?lbl)="en") }
          } GROUP BY ?sup ORDER BY DESC(?n)`,
        parse: (rows) => rows.map((b) => ({
          uri:   b.sup.value,
          label: b.label?.value || b.sup.value.replace(/^.*\//, ''),
          image: null, country: null, coords: null,
          originCount: +(b.n?.value || 0),
        })),
      },
    ],
  },
  {
    id: 'wd_instances_of',
    label: 'instances',
    gloss: 'all things Wikidata records as instances of these classes',
    inputType: 'wd_class', outputType: 'wd_thing',
    engineId: 'qlever-wikidata',
    role: 'primary',
    requires: (b) => b.items.some((x) => /Q\d+$/.test(x.uri)),
    variants: [
      {
        id: 'default', kind: 'default',
        label: '^P31 — direct instance',
        gloss: 'cap 5000; image + coords + country fetched so the next narrow-by-* chip is data-driven',
        namedGraphs: [],
        build: (items) => `
          PREFIX wd:   <http://www.wikidata.org/entity/>
          PREFIX wdt:  <http://www.wikidata.org/prop/direct/>
          PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
          SELECT ?inst (SAMPLE(?lbl)    AS ?label)
                       (SAMPLE(?img)    AS ?image)
                       (SAMPLE(?coordL) AS ?coord)
                       (SAMPLE(?ctry)   AS ?country)
          WHERE {
            VALUES ?cls { ${valuesQids(items)} }
            ?inst wdt:P31 ?cls .
            OPTIONAL { ?inst rdfs:label ?lbl . FILTER(lang(?lbl)="en") }
            OPTIONAL { ?inst wdt:P18  ?img }
            OPTIONAL { ?inst wdt:P625 ?coordL }
            OPTIONAL { ?inst wdt:P17/rdfs:label ?ctry . FILTER(lang(?ctry)="en") }
          } GROUP BY ?inst LIMIT 5000`,
        parse: (rows) => rows.map((b) => ({
          uri:   b.inst.value,
          label: b.label?.value || b.inst.value.replace(/^.*\//, ''),
          image: b.image?.value || null,
          country: b.country?.value || null,
          coords: parsePoint(b.coord?.value),
        })),
      },
      {
        id: 'transitive', kind: 'broaden',
        label: '^P31/^P279* — incl. subclass instances',
        gloss: 'instances of the class OR any of its subclasses (transitive)',
        namedGraphs: [],
        build: (items) => `
          PREFIX wd:   <http://www.wikidata.org/entity/>
          PREFIX wdt:  <http://www.wikidata.org/prop/direct/>
          PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
          SELECT ?inst (SAMPLE(?lbl)    AS ?label)
                       (SAMPLE(?img)    AS ?image)
                       (SAMPLE(?coordL) AS ?coord)
                       (SAMPLE(?ctry)   AS ?country)
          WHERE {
            VALUES ?cls { ${valuesQids(items)} }
            ?inst wdt:P31/wdt:P279* ?cls .
            OPTIONAL { ?inst rdfs:label ?lbl . FILTER(lang(?lbl)="en") }
            OPTIONAL { ?inst wdt:P18  ?img }
            OPTIONAL { ?inst wdt:P625 ?coordL }
            OPTIONAL { ?inst wdt:P17/rdfs:label ?ctry . FILTER(lang(?ctry)="en") }
          } GROUP BY ?inst LIMIT 5000`,
        parse: (rows) => rows.map((b) => ({
          uri:   b.inst.value,
          label: b.label?.value || b.inst.value.replace(/^.*\//, ''),
          image: b.image?.value || null,
          country: b.country?.value || null,
          coords: parsePoint(b.coord?.value),
        })),
      },
    ],
  },
];
