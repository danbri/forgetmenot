// =============================================================================
// kgx/lib/augment.mjs — augment op registry (federate / enrich)
//
// AUGMENT ops take a Bundle<T>, hit a SPARQL endpoint to pull facets /
// cross-source identifiers, and return a NEW Bundle<T> of the same items
// (same uris, same type) with richer `.extra.*` per item. Federate /
// enrich in the design's vocabulary; "+ facts" / "+ DDP" / "+ identity
// bridges" in the UI's bead labels.
//
// Difference from rel-pivot:
//   * rel-pivot:  Bundle<T> → Bundle<U>   (new bundle of new entity type)
//   * augment:    Bundle<T> → Bundle<T>   (same items, more extra.* on each)
//
// Each entry is a declarative plan — pure data plus pure pure parse/merge
// functions. Side effects (the SPARQL call) live in the runner, not here.
//
//   {
//     id, engineId, requires(bundle), cap, note,
//     query(items)  -> string                 // SPARQL with VALUES filled
//     parse(bindings, items) -> newItems     // merge bindings back by uri/mpid
//     namedGraphs?  : string[]                // for provenance
//   }
// =============================================================================

const ENRICH_MAX = 500;   // soft cap that the page already enforces

// ---------------------------------------------------------------------------
// enrich — Wikidata facets (P19 birthplace + P625 + P17, P569/P570 dates,
// P69 alma maters, P26 spouses, P106 occupations). Merges flat into
// item.extra alongside any pre-existing sidecars (parl, identity, …).
// ---------------------------------------------------------------------------
export const enrich = {
  id:        'enrich',
  engineId:  'qlever-wikidata',
  role:      'primary',
  cap:       ENRICH_MAX,
  requires:  (b) => b.items.some((x) => /Q\d+$/.test(x.uri || '')),
  note:      'Wikidata: birthplace + coords + dates + alma maters + spouses + occupations',
  namedGraphs: [],

  query: (items) => {
    const values = items
      .filter((x) => /Q\d+$/.test(x.uri || ''))
      .map((x) => `<${x.uri}>`)
      .join(' ');
    return `
      PREFIX wd:   <http://www.wikidata.org/entity/>
      PREFIX wdt:  <http://www.wikidata.org/prop/direct/>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      SELECT ?p
        (SAMPLE(?bp)      AS ?birthplace)
        (SAMPLE(?bpLbl)   AS ?birthplaceLabel)
        (SAMPLE(?bpCoord) AS ?birthplaceCoord)
        (SAMPLE(?ctryLbl) AS ?country)
        (SAMPLE(?dobRaw)  AS ?dobOut)
        (SAMPLE(?dodRaw)  AS ?dodOut)
        (GROUP_CONCAT(DISTINCT ?amLbl;     separator="|") AS ?almaMaters)
        (GROUP_CONCAT(DISTINCT ?spouseLbl; separator="|") AS ?spouses)
        (GROUP_CONCAT(DISTINCT ?occLbl;    separator="|") AS ?occupations)
      WHERE {
        VALUES ?p { ${values} }
        OPTIONAL { ?p wdt:P19 ?bp .
                   OPTIONAL { ?bp rdfs:label ?bpLbl . FILTER(lang(?bpLbl)="en") }
                   OPTIONAL { ?bp wdt:P625 ?bpCoord }
                   OPTIONAL { ?bp wdt:P17 ?ctry .
                              OPTIONAL { ?ctry rdfs:label ?ctryLbl . FILTER(lang(?ctryLbl)="en") } }
        }
        OPTIONAL { ?p wdt:P569 ?dobRaw }
        OPTIONAL { ?p wdt:P570 ?dodRaw }
        OPTIONAL { ?p wdt:P69  ?am .   OPTIONAL { ?am rdfs:label ?amLbl     . FILTER(lang(?amLbl)="en") } }
        OPTIONAL { ?p wdt:P26  ?sp .   OPTIONAL { ?sp rdfs:label ?spouseLbl . FILTER(lang(?spouseLbl)="en") } }
        OPTIONAL { ?p wdt:P106 ?occ .  OPTIONAL { ?occ rdfs:label ?occLbl   . FILTER(lang(?occLbl)="en") } }
      } GROUP BY ?p`;
  },

  parse: (bindings, items) => {
    const byUri = new Map();
    for (const b of bindings) byUri.set(b.p.value, b);
    return items.map((x) => {
      const b = byUri.get(x.uri);
      if (!b) return x;
      const extra = {
        dob:        b.dobOut?.value || null,
        dod:        b.dodOut?.value || null,
        birthplace: b.birthplace ? {
          uri:     b.birthplace.value,
          label:   b.birthplaceLabel?.value || null,
          country: b.country?.value || null,
          coord:   b.birthplaceCoord?.value || null,
        } : null,
        almaMaters:  (b.almaMaters?.value  || '').split('|').filter(Boolean),
        spouses:     (b.spouses?.value     || '').split('|').filter(Boolean),
        occupations: (b.occupations?.value || '').split('|').filter(Boolean),
      };
      return { ...x, extra: { ...(x.extra || {}), ...extra } };
    });
  },
};

// ---------------------------------------------------------------------------
// parl-enrich — UK Parliament SPARQL (DDP) via the rdfs:seeAlso bridge from
// Wikidata QID. Adds item.extra.parl = { personUri, constituency, party,
// familyName, givenName }.
// ---------------------------------------------------------------------------
export const parlEnrich = {
  id:        'parl-enrich',
  engineId:  'parl-sparql',
  role:      'crossCheck',
  cap:       ENRICH_MAX,
  requires:  (b) => b.items.some((x) => /Q\d+$/.test(x.uri || '') && (x.sitting || x.mpid)),
  note:      'join via rdfs:seeAlso to UK Parliament DDP (current constituency + current party + name parts)',
  namedGraphs: [],

  query: (items) => {
    const values = items
      .filter((x) => /Q\d+$/.test(x.uri || ''))
      .map((x) => `<${x.uri}>`)
      .join(' ');
    return `
      PREFIX schema: <https://id.parliament.uk/schema/>
      PREFIX rdfs:   <http://www.w3.org/2000/01/rdf-schema#>
      SELECT ?qid
             (SAMPLE(?constName) AS ?constituency)
             (SAMPLE(?partyName) AS ?parliamentParty)
             (SAMPLE(?famName)   AS ?familyName)
             (SAMPLE(?givName)   AS ?givenName)
             (SAMPLE(?personUri) AS ?parliamentPerson)
      WHERE {
        VALUES ?qid { ${values} }
        ?personUri rdfs:seeAlso ?qid ;
                   a schema:Member ;
                   schema:memberHasParliamentaryIncumbency ?in .
        OPTIONAL {
          ?in schema:seatIncumbencyHasHouseSeat/schema:houseSeatHasConstituencyGroup/schema:constituencyGroupName ?constName
        }
        OPTIONAL {
          ?personUri schema:partyMemberHasPartyMembership ?pm .
          FILTER NOT EXISTS { ?pm schema:partyMembershipEndDate ?pe }
          ?pm schema:partyMembershipHasParty/schema:partyName ?partyName
        }
        OPTIONAL { ?personUri schema:personFamilyName ?famName }
        OPTIONAL { ?personUri schema:personGivenName  ?givName }
      } GROUP BY ?qid`;
  },

  parse: (bindings, items) => {
    const byQid = new Map();
    for (const b of bindings) byQid.set(b.qid.value, b);
    return items.map((x) => {
      const b = byQid.get(x.uri);
      if (!b) return x;
      const parl = {
        personUri:    b.parliamentPerson?.value || null,
        constituency: b.constituency?.value     || null,
        currentParty: b.parliamentParty?.value  || null,
        familyName:   b.familyName?.value       || null,
        givenName:    b.givenName?.value        || null,
      };
      return { ...x, extra: { ...(x.extra || {}), parl } };
    });
  },
};

// ---------------------------------------------------------------------------
// identity-bridge — FPKG identity-graph: resolve each MP's MNIS id to its
// DDP person URI, Wikidata QID, GOV.UK people-page slug, and presence of a
// scraped per-MP website. The principled cross-source resolve the design
// note asks for: stop hand-rolling rdfs:seeAlso joins in every template
// and route through parl:memberId as the canonical key.
// ---------------------------------------------------------------------------
export const identityBridge = {
  id:        'identity-bridge',
  engineId:  'fpkg',
  role:      'crossCheck',
  cap:       ENRICH_MAX,
  requires:  (b) => b.items.some((x) => x.mpid),
  note:      'joined across 4 identity named graphs in fpkg (parl:memberId as canonical key)',
  namedGraphs: [
    'https://forgetmenot.local/graph/identity/ddp-sparql',
    'https://forgetmenot.local/graph/identity/wikidata',
    'https://forgetmenot.local/graph/identity/govuk',
    'https://forgetmenot.local/graph/identity/scraped',
  ],

  query: (items) => {
    const ids = [...new Set(items.map((x) => x.mpid).filter(Boolean))];
    const values = ids
      .map((id) => `<https://members-api.parliament.uk/api/Members/${id}>`)
      .join(' ');
    return `
      PREFIX owl:    <http://www.w3.org/2002/07/owl#>
      PREFIX schema: <http://schema.org/>
      PREFIX rdfs:   <http://www.w3.org/2000/01/rdf-schema#>
      PREFIX fm:     <https://forgetmenot.local/vocab/>
      SELECT ?p
             (SAMPLE(?ddp)       AS ?ddpUri)
             (SAMPLE(?wd)        AS ?wikidataQid)
             (SAMPLE(?govuk)     AS ?govukSlug)
             (SAMPLE(?site)      AS ?scrapedSite)
             (SAMPLE(?platform)  AS ?sitePlatform)
             (SAMPLE(?given)     AS ?givenName)
             (SAMPLE(?family)    AS ?familyName)
      WHERE {
        VALUES ?p { ${values} }
        OPTIONAL { GRAPH <https://forgetmenot.local/graph/identity/ddp-sparql>  { ?p owl:sameAs ?ddp } }
        OPTIONAL { GRAPH <https://forgetmenot.local/graph/identity/wikidata>    { ?p owl:sameAs ?wd } }
        OPTIONAL { GRAPH <https://forgetmenot.local/graph/identity/govuk>       { ?p owl:sameAs ?govuk } }
        OPTIONAL { GRAPH <https://forgetmenot.local/graph/identity/scraped>     { ?p <https://forgetmenot.local/vocab#scrapedSiteDir> ?site } }
        OPTIONAL { GRAPH <https://forgetmenot.local/graph/identity/scraped>     { ?p <https://forgetmenot.local/vocab#sitePlatform>   ?platform } }
        OPTIONAL { GRAPH <https://forgetmenot.local/graph/identity/ddp-sparql>  { ?p schema:givenName  ?given } }
        OPTIONAL { GRAPH <https://forgetmenot.local/graph/identity/ddp-sparql>  { ?p schema:familyName ?family } }
      } GROUP BY ?p`;
  },

  parse: (bindings, items) => {
    const byMpid = new Map();
    for (const b of bindings) {
      const m = b.p.value.match(/Members\/(\d+)$/);
      if (m) byMpid.set(m[1], b);
    }
    return items.map((x) => {
      const b = x.mpid ? byMpid.get(String(x.mpid)) : null;
      if (!b) return x;
      const identity = {
        ddpUri:       b.ddpUri?.value      || null,
        wikidataQid:  b.wikidataQid?.value || null,
        govukSlug:    b.govukSlug?.value   || null,
        scrapedSite:  b.scrapedSite?.value || null,
        sitePlatform: b.sitePlatform?.value|| null,
        givenName:    b.givenName?.value   || null,
        familyName:   b.familyName?.value  || null,
      };
      return { ...x, extra: { ...(x.extra || {}), identity } };
    });
  },
};

// Registry keyed by op id. The runner looks up by step.op.
export const AUGMENT_OPS = {
  'enrich':          enrich,
  'parl-enrich':     parlEnrich,
  'identity-bridge': identityBridge,
};
