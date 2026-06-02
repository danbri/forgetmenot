// =============================================================================
// kgx/lib/starters.mjs — declarative source ops ("starters")
//
// A SOURCE op kicks off a chain. It takes no input bundle; it emits one
// (along with a Source provenance bead).  In the implicit op-node API:
//
//   () ────────────► { Bundle<T>, Source }     (this file)
//   Bundle<T> ─── restrict ──► Bundle<T>       (restrict.mjs)
//   Bundle<T> ─── pivot    ──► Bundle<U>       (rel-templates.mjs)
//   Bundle<T> × Bundle<T> ─► combine ──► Bundle<T>     (Bundle.union/...)
//
// Each starter here is a PLAN: a tuple of (engine id, SPARQL string, parse
// function, note) plus the catalogue metadata (id, label, sub, type).
// The page calls a generic loader that hands the engine the query and runs
// the parse function on the bindings — same shape every starter.
//
// Today, only `uk-mps-1900` lives here. The other 8 starters in daisychain
// still use their own inline `fetch:` closures because they have
// per-starter wiring (engine('fpkg'), pqFetch(...), bespoke parse logic
// for multi-property rows). They'll migrate in follow-up commits as each
// becomes the next testable cowpath.
// =============================================================================

import { parsePoint } from './node-flow.mjs';

// Cap for the QLever seed — both the SPARQL `LIMIT` and the page's "large
// — see 🔧 chip to narrow" hint use this. Larger seeds get unwieldy on
// mobile until we wire bloom-of-the-full-set + lazy fetch.
export const SEED_LIMIT = 7000;

// SPARQL: every Wikidata person who has held any position-class ⊑
// Q16707842 (member of the UK Parliament) since 1900, with one row per
// person via GROUP BY ?p.
//
// Aggregates ensure the row is closed (SAMPLE on display fields, GROUP_CONCAT
// for multi-valued parties / citizenships). The `?sittingFlag` heuristic:
// any term with a start ≥ 2024 and no end date is treated as "currently
// sitting" — refresh that boundary after each general election.
export const POST1900_MPS_QUERY = `
PREFIX wd:     <http://www.wikidata.org/entity/>
PREFIX wdt:    <http://www.wikidata.org/prop/direct/>
PREFIX p:      <http://www.wikidata.org/prop/>
PREFIX ps:     <http://www.wikidata.org/prop/statement/>
PREFIX pq:     <http://www.wikidata.org/prop/qualifier/>
PREFIX rdfs:   <http://www.w3.org/2000/01/rdf-schema#>

SELECT ?p (SAMPLE(?lbl) AS ?l)
       (SAMPLE(?image) AS ?imgUri)
       (SAMPLE(?mp)    AS ?mpid)
       (MIN(?startYr)  AS ?firstYr)
       (MAX(?startYr)  AS ?latestStart)
       (MAX(?effEnd)   AS ?lastYr)
       (MAX(?openNow)  AS ?sittingFlag)
       (GROUP_CONCAT(DISTINCT ?partyLbl; separator="|") AS ?parties)
       (SAMPLE(?gndLbl) AS ?gender)
       (GROUP_CONCAT(DISTINCT ?ctzLbl; separator="|") AS ?citizenships)
WHERE {
  ?p wdt:P39 ?pos .
  ?pos wdt:P279* wd:Q16707842 .
  ?p p:P39 ?stmt . ?stmt ps:P39 ?pos .
  OPTIONAL { ?stmt pq:P580 ?start . BIND(YEAR(?start) AS ?startYr) }
  OPTIONAL { ?stmt pq:P582 ?end   . BIND(YEAR(?end)   AS ?endYr)   }
  BIND(IF(BOUND(?endYr), ?endYr, 9999) AS ?effEnd)
  BIND(IF(BOUND(?startYr) && !BOUND(?endYr) && ?startYr >= 2024, 1, 0) AS ?openNow)
  FILTER( (BOUND(?startYr) && ?startYr >= 1900) ||
          (BOUND(?endYr)   && ?endYr   >= 1900) )
  OPTIONAL { ?p wdt:P18    ?image }
  OPTIONAL { ?p wdt:P10428 ?mp }
  OPTIONAL { ?p wdt:P102   ?party0 .
             ?party0 rdfs:label ?partyLbl . FILTER(lang(?partyLbl) = "en") }
  OPTIONAL { ?p wdt:P21    ?gnd .
             ?gnd rdfs:label ?gndLbl . FILTER(lang(?gndLbl) = "en") }
  OPTIONAL { ?p wdt:P27    ?ctz .
             ?ctz rdfs:label ?ctzLbl . FILTER(lang(?ctzLbl) = "en") }
  OPTIONAL { ?p rdfs:label ?lbl . FILTER(lang(?lbl) = "en") }
}
GROUP BY ?p
LIMIT ${SEED_LIMIT}`;

export function parseMpRows(bindings) {
  return bindings.map((b) => {
    const uri = b.p.value;
    const firstYr     = b.firstYr?.value     ? +b.firstYr.value     : null;
    const latestStart = b.latestStart?.value ? +b.latestStart.value : null;
    const rawEnd      = b.lastYr?.value      ? +b.lastYr.value      : null;
    const sitting     = b.sittingFlag?.value === '1';
    const lastYr      = (rawEnd === 9999 || rawEnd === null) ? null : rawEnd;
    const decadeYr    = sitting ? latestStart : lastYr;
    const parties     = (b.parties?.value || '').split('|').filter(Boolean);
    return {
      uri,
      label:    b.l?.value      || uri.replace(/^.*\//, ''),
      image:    b.imgUri?.value || null,
      mpid:     b.mpid?.value   || null,
      firstYr, lastYr, latestStart, sitting, parties,
      gender:        b.gender?.value || null,
      citizenships: (b.citizenships?.value || '').split('|').filter(Boolean),
      decade:        decadeYr ? `${Math.floor(decadeYr / 10) * 10}s` : null,
    };
  });
}

// Registry of starters that live here (declarative). The daisychain page
// merges this with its still-inline starters at import-time so the order
// + IDs that the LIBRARY chains reference are preserved.
export const STARTERS = [
  {
    id:        'uk-mps-1900',
    label:     'UK MPs since 1900 (Wikidata)',
    sub:       '~6,900 Wikidata people · QLever',
    type:      'human',
    engineId:  'qlever-wikidata',
    query:     POST1900_MPS_QUERY,
    parse:     parseMpRows,
    note:      'Wikidata persons holding any position ⊑ Q16707842, with at least one term touching 1900+',
  },
];
