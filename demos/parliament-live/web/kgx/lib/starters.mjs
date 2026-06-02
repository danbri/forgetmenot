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

// -----------------------------------------------------------------------------
// parl-current-mps: the FPKG-bundled DDP-shape projection built daily by
// scripts/build-parl-current.mjs from the Members API. Uses fpkg's Oxigraph
// store at /kgx/query against a named graph that contains the synthetic
// current-MPs triples in DDP vocab.
//
// NB: the api.parliament.uk/sparql endpoint is a Parliament behind for
// current-state questions; this starter exists because we need a
// "what's the current Commons look like, RIGHT NOW" answer that the
// official DDP store can't give. See /kgx/queries/08 + 09 for the
// diagnosis.
//
// SPARQL hygiene fix during extraction: the inline version used the same
// name for the SAMPLE source and the AS target (e.g. `(SAMPLE(?fam) AS ?fam)`).
// Oxigraph accepts it; strict engines (api.parliament.uk/sparql, QLever)
// don't. Renamed the WHERE-side variables (?famName / ?givName / ...) so
// the AS targets stay short (?fam / ?giv / ...) and parse() doesn't need
// to change.
// -----------------------------------------------------------------------------
export const PARL_CURRENT_MPS_QUERY = `
PREFIX schema: <https://id.parliament.uk/schema/>
SELECT ?p (SAMPLE(?famName)   AS ?fam)
          (SAMPLE(?givName)   AS ?giv)
          (SAMPLE(?constName) AS ?const)
          (SAMPLE(?partyName) AS ?party)
          (SAMPLE(?mid)       AS ?mpid)
          (SAMPLE(?startDate) AS ?start)
WHERE {
  GRAPH ?g {
    FILTER(CONTAINS(STR(?g), "parl-current/"))
    ?p schema:memberHasParliamentaryIncumbency ?in .
    ?in schema:seatIncumbencyHasHouseSeat ?seat .
    ?seat schema:houseSeatHasHouse <https://id.parliament.uk/1AFu55Hs> .
    ?seat schema:houseSeatHasConstituencyGroup/schema:constituencyGroupName ?constName .
    FILTER NOT EXISTS { ?in schema:incumbencyEndDate ?e }
    OPTIONAL { ?p schema:personGivenName  ?givName }
    OPTIONAL { ?p schema:personFamilyName ?famName }
    OPTIONAL { ?p schema:mnisId           ?mid }
    OPTIONAL { ?in schema:parliamentaryIncumbencyStartDate ?startDate }
    OPTIONAL {
      ?p schema:partyMemberHasPartyMembership/schema:partyMembershipHasParty/schema:partyName ?partyName
    }
  }
} GROUP BY ?p`;

export function parseParlCurrentRows(bindings) {
  return bindings.map((b) => {
    const giv = b.giv?.value || '', fam = b.fam?.value || '';
    const startYr = b.start?.value ? +b.start.value.slice(0, 4) : null;
    return {
      uri:     b.p.value,
      label:   (giv + ' ' + fam).trim() || b.p.value.replace(/^.*\//, ''),
      image:   null,
      mpid:    b.mpid?.value || null,
      firstYr: startYr, lastYr: null, latestStart: startYr, sitting: true,
      parties: [b.party?.value].filter(Boolean),
      gender:  null, citizenships: [],
      decade:  '2020s',
      // Pre-populated parl extra so the bead reads enriched without an
      // explicit `enrich (Parliament)` step.
      extra: {
        parl: {
          personUri:     b.p.value,
          constituency:  b.const?.value || null,
          currentParty:  b.party?.value || null,
          familyName:    fam || null,
          givenName:     giv || null,
        },
      },
    };
  });
}

// -----------------------------------------------------------------------------
// hk-skyscrapers — scenic Parallax starter: Wikidata buildings inside Hong Kong.
// -----------------------------------------------------------------------------
export const HK_SKYSCRAPERS_QUERY = `
PREFIX wd:   <http://www.wikidata.org/entity/>
PREFIX wdt:  <http://www.wikidata.org/prop/direct/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?b (SAMPLE(?lbl)    AS ?label)
          (SAMPLE(?img)    AS ?image)
          (SAMPLE(?coordL) AS ?coord)
          (SAMPLE(?yr)     AS ?year)
WHERE {
  { ?b wdt:P31 wd:Q11303 } UNION { ?b wdt:P31 wd:Q18142 }
  ?b wdt:P131* wd:Q8646 .
  OPTIONAL { ?b wdt:P18  ?img }
  OPTIONAL { ?b wdt:P625 ?coordL }
  OPTIONAL { ?b wdt:P1619 ?yrLit . BIND(YEAR(?yrLit) AS ?yr) }
  OPTIONAL { ?b rdfs:label ?lbl . FILTER(lang(?lbl)="en") }
} GROUP BY ?b`;

export function parseHkSkyscraperRows(bindings) {
  return bindings.map((b) => ({
    uri:    b.b.value,
    label:  b.label?.value || b.b.value.replace(/^.*\//, ''),
    image:  b.image?.value || null,
    coords: parsePoint(b.coord?.value),
    year:   b.year?.value ? +b.year.value : null,
  }));
}

// -----------------------------------------------------------------------------
// us-presidents — every Wikidata human holding wd:Q11696 (President of the USA).
// -----------------------------------------------------------------------------
export const US_PRESIDENTS_QUERY = `
PREFIX wd:   <http://www.wikidata.org/entity/>
PREFIX wdt:  <http://www.wikidata.org/prop/direct/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?p (SAMPLE(?lbl)  AS ?label)  (SAMPLE(?img) AS ?image)
          (MIN(?dobLit)  AS ?dob)    (MAX(?dodLit) AS ?dod)
WHERE {
  ?p wdt:P39 wd:Q11696 .
  OPTIONAL { ?p wdt:P18  ?img }
  OPTIONAL { ?p wdt:P569 ?dobLit }
  OPTIONAL { ?p wdt:P570 ?dodLit }
  OPTIONAL { ?p rdfs:label ?lbl . FILTER(lang(?lbl)="en") }
} GROUP BY ?p`;

export function parseUsPresidentRows(bindings) {
  return bindings.map((b) => {
    const firstYr = b.dob?.value ? +b.dob.value.slice(0, 4) : null;
    const lastYr  = b.dod?.value ? +b.dod.value.slice(0, 4) : null;
    return {
      uri:    b.p.value,
      label:  b.label?.value || b.p.value.replace(/^.*\//, ''),
      image:  b.image?.value || null,
      firstYr, lastYr, latestStart: firstYr, sitting: !lastYr,
      parties: [], gender: null, citizenships: [], mpid: null,
      decade: lastYr ? `${Math.floor(lastYr / 10) * 10}s` : null,
    };
  });
}

// -----------------------------------------------------------------------------
// recent-sis — every Statutory Instrument in the DDP, newest first, capped 1500.
// -----------------------------------------------------------------------------
export const RECENT_SIS_QUERY = `
PREFIX schema: <https://id.parliament.uk/schema/>
SELECT ?si (SAMPLE(?name)   AS ?label)
           (SAMPLE(?yr)     AS ?year)
           (SAMPLE(?num)    AS ?number)
           (SAMPLE(?made)   AS ?madeDate)
           (SAMPLE(?cif)    AS ?comingIntoForce)
WHERE {
  ?si a schema:StatutoryInstrumentPaper ;
      schema:statutoryInstrumentPaperName ?name .
  OPTIONAL { ?si schema:statutoryInstrumentPaperYear     ?yr }
  OPTIONAL { ?si schema:statutoryInstrumentPaperNumber   ?num }
  OPTIONAL { ?si schema:statutoryInstrumentPaperMadeDate ?made }
  OPTIONAL { ?si schema:statutoryInstrumentPaperComingIntoForceDate ?cif }
} GROUP BY ?si ORDER BY DESC(?madeDate) LIMIT 1500`;

export function parseSiRows(bindings) {
  return bindings.map((b) => ({
    uri:    b.si.value,
    label:  b.label?.value || b.si.value.replace(/^.*\//, ''),
    image:  null,
    year:   b.year?.value ? +b.year.value : null,
    number: b.number?.value || null,
    madeDate:        b.madeDate?.value        || null,
    comingIntoForce: b.comingIntoForce?.value || null,
    decade: b.year?.value ? `${Math.floor((+b.year.value) / 10) * 10}s` : null,
  }));
}

// -----------------------------------------------------------------------------
// PQ ("parameterised query") starters — Parliament's named-template service
// at api.parliament.uk/query/<template>. Returns JSON-LD with `@graph` rows
// rather than SPARQL bindings. Each PQ starter declares `pqTemplate`
// instead of `query`; the runner takes that as a signal to call
// `ctx.pq(template)` rather than `ctx.engine(...).query(sparql)`.
//
// The page goes through its `/api/query/<t>` proxy route (public, no
// auth); node tests go directly to api.parliament.uk/query/<t>
// (also public, CORS-open).
// -----------------------------------------------------------------------------

export function parsePqConstituencyCurrentRows(rows) {
  return rows.map((g) => {
    const inc = g.constituencyGroupHasHouseSeat?.houseSeatHasSeatIncumbency;
    const mp  = inc?.parliamentaryIncumbencyHasMember;
    const ptyName = mp?.partyMemberHasPartyMembership?.partyMembershipHasParty?.partyName || null;
    return {
      uri:   'https://id.parliament.uk/' + g['@id'],
      label: g.constituencyGroupName || g['@id'],
      image: null, country: null, coords: null,
      currentMpName:  mp ? `${mp.personGivenName || ''} ${mp.personFamilyName || ''}`.trim() : null,
      currentMpParty: ptyName,
    };
  });
}

export function parsePqPartyIndexRows(rows) {
  return rows.map((g) => ({
    uri:   'https://id.parliament.uk/' + g['@id'],
    label: g.partyName || g['@id'],
    image: null, country: null, coords: null,
    commonsCount: +g.commonsCount || 0,
    lordsCount:   +g.lordsCount   || 0,
    originCount:  (+g.commonsCount || 0) + (+g.lordsCount || 0),
  }));
}

export function parsePqFormalBodyIndexRows(rows) {
  return rows.map((g) => ({
    uri:   'https://id.parliament.uk/' + g['@id'],
    label: g.formalBodyName || g['@id'],
    image: null, country: null, coords: null,
  }));
}

export function parsePqConceptIndexRows(rows) {
  return rows.map((g) => ({
    uri:   'https://id.parliament.uk/' + g['@id'],
    label: g.prefLabel || g['@id'],
    image: null, country: null, coords: null,
  }));
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
  {
    id:        'parl-current-mps',
    label:     'Current MPs (live)',
    sub:       'Members API → fresh DDP-shape synthetic graph in FPKG. 647 current Commons, dated 2024 cohort.',
    type:      'human',
    engineId:  'fpkg',
    query:     PARL_CURRENT_MPS_QUERY,
    parse:     parseParlCurrentRows,
    note:      'FPKG sidecar: DDP-shaped projection of Members API current state. Built daily by scripts/build-parl-current.mjs; DDP endpoint itself is a Parliament behind — see /kgx/queries/08-… for the diagnosis.',
    namedGraphs: ['https://forgetmenot.local/graph/parl-current/<date>'],
  },
  {
    id:        'hk-skyscrapers',
    label:     'Hong Kong skyscrapers (Wikidata)',
    sub:       '~98 skyscrapers + high-rises in HK; most have coords, some have architects.',
    type:      'building',
    engineId:  'qlever-wikidata',
    query:     HK_SKYSCRAPERS_QUERY,
    parse:     parseHkSkyscraperRows,
    note:      'Wikidata: instances of skyscraper (Q11303) or high-rise (Q18142) inside HK SAR (Q8646) via wdt:P131*',
  },
  {
    id:        'us-presidents',
    label:     'US Presidents (Wikidata)',
    sub:       '~63 presidents via QLever; with portraits, dates, embedded human shape.',
    type:      'human',
    engineId:  'qlever-wikidata',
    query:     US_PRESIDENTS_QUERY,
    parse:     parseUsPresidentRows,
    note:      'Wikidata: humans holding position P39 = wd:Q11696 (President of the USA)',
  },
  {
    id:        'recent-sis',
    label:     'Statutory Instruments (Parliament SPARQL)',
    sub:       '~6,900 SIs in DDP — laid before Parliament under various procedures.',
    type:      'si',
    engineId:  'parl-sparql',
    query:     RECENT_SIS_QUERY,
    parse:     parseSiRows,
    note:      'DDP class schema:StatutoryInstrumentPaper, newest first, capped 1500.',
  },
  // -- PQ-shape starters — runner dispatches via ctx.pq(template) instead
  //    of ctx.engine(id).query(sparql).
  {
    id:         'pq-constituency-current',
    label:      'Current Commons constituencies (PQ)',
    sub:        '674 ConstituencyGroups, each with current MP + party',
    type:       'constituency',
    pqTemplate: 'constituency_current',
    parse:      parsePqConstituencyCurrentRows,
    note:       'PQ template constituency_current — Commons-current constituencies with sitting MP + party.',
  },
  {
    id:         'pq-party-index',
    label:      'Parliament parties · with Commons + Lords counts (PQ)',
    sub:        '73 Party records, current state',
    type:       'party',
    pqTemplate: 'party_index',
    parse:      parsePqPartyIndexRows,
    note:       'PQ template party_index — each party with current Commons + Lords membership counts.',
  },
  {
    id:         'pq-formal-body-index',
    label:      'Parliament formal bodies · committees + boards (PQ)',
    sub:        '399 FormalBody records — Select, Joint, General Committees, Boards',
    type:       'formal_body',
    pqTemplate: 'formal_body_index',
    parse:      parsePqFormalBodyIndexRows,
    note:       'PQ template formal_body_index — every formal body (Select / Joint / General Committees, Boards, …).',
  },
  {
    id:         'pq-concept-index',
    label:      'Top thesaurus concepts (PQ)',
    sub:        '108 SKOS Concept top-terms from the Parliament Thesaurus',
    type:       'concept',
    pqTemplate: 'concept_index',
    parse:      parsePqConceptIndexRows,
    note:       'PQ template concept_index — top-term SKOS concepts in the Parliament Thesaurus.',
  },
];
