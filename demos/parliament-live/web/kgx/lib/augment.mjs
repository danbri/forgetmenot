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
//     applicableTo  : { types, ... }          // declarative gate (see below)
//     query(items)  -> string                 // SPARQL with VALUES filled
//     parse(bindings, items) -> newItems     // merge bindings back by uri/mpid
//     namedGraphs?  : string[]                // for provenance
//   }
//
// `applicableTo` is the declarative twin of the daisychain page's inline
// `relevant(b)` closures and of this file's `requires(b)` runtime guard —
// pure data so `kgx chain candidates` can filter augments by upstream
// bundle TYPE without executing anything:
//
//   types          : bundle types the op makes sense on (the page only
//                    surfaces these three ops in OPS.human today)
//   requiresFields : item fields that must ALL be present on some item
//   anyOfFields    : item fields of which AT LEAST ONE must be present
//   uriPattern     : documented regex (as a string) that item.uri must
//                    match — NOT executed here; `requires(b)` is the
//                    runtime check, this is the introspectable note
// =============================================================================

const ENRICH_MAX = 500;   // soft cap that the page already enforces

// ---------------------------------------------------------------------------
// enrich — Wikidata facets (P19 birthplace + P625 + P17, P569/P570 dates,
// P69 alma maters, P26 spouses, P106 occupations). Merges flat into
// item.extra alongside any pre-existing sidecars (parl, identity, …).
// ---------------------------------------------------------------------------
// Effective Wikidata QID URI for an item: either its own URI (if already a
// Wikidata QID — the native case for QLever-seeded chains) or its bridged
// QID set by `identity-bridge` on extra.identity.wikidataQid (the case for
// parl-current-mps / parl-sparql-seeded chains that aren't Wikidata-native).
//
// Exported so the runner's relevance check + the page's chip palette can
// share one definition with the lib — and so adding a new bridge source
// later (e.g. an MNIS → Wikidata join) lands in one place.
export function effectiveWikidataUri(x) {
  if (/Q\d+$/.test(x.uri || '')) return x.uri;
  const q = x.extra?.identity?.wikidataQid;
  if (q && /Q\d+$/.test(q)) return q;
  return null;
}

export const enrich = {
  id:        'enrich',
  kind:      'enrich',                  // same-item facets, no cross-source join
  engineId:  'qlever-wikidata',
  role:      'primary',
  cap:       ENRICH_MAX,
  requires:  (b) => b.items.some((x) => !!effectiveWikidataUri(x)),
  // Page has no relevant() gate for enrich; applicability = human bundle
  // whose items carry Wikidata Q-URIs. `requires()` admits the bridged
  // case too (extra.identity.wikidataQid set by identity-bridge), but
  // applicableTo is the CLI-side declarative twin used only by
  // `kgx chain candidates` filtering — that retains the original shape.
  applicableTo: { types: ['human'], uriPattern: 'Q\\d+$' },
  note:      'Wikidata: birthplace + coords + dates + alma maters + spouses + occupations',
  namedGraphs: [],

  query: (items) => {
    const uris = items
      .map(effectiveWikidataUri)
      .filter(Boolean);
    const values = [...new Set(uris)].map((u) => `<${u}>`).join(' ');
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

  // Match bindings to items via the effective QID — same lookup the build
  // used. Items without a QID (DDP-only, no bridge yet) pass through
  // unchanged.
  parse: (bindings, items) => {
    const byUri = new Map();
    for (const b of bindings) byUri.set(b.p.value, b);
    return items.map((x) => {
      const qUri = effectiveWikidataUri(x);
      const b = qUri && byUri.get(qUri);
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

  // Slim-channel Step 1 (slim-channel-dataflow.md §"Property access"):
  // mirror parse() into a flat quad emit so the result data can land in
  // a per-bead named graph addressable via propertyOf(bead, item, p)
  // — equal-status arcs — without changing the renderer-facing parse()
  // contract.
  //
  // The page's runAugment passes a graph IRI for `g`; the same IRI lives
  // in the bead's BeadStore so the renderer can ask "which source?".
  // Items without a QID emit no quads (same skip as parse).
  parseQuads: (bindings, items, graphIri) => {
    const byUri = new Map();
    for (const b of bindings) byUri.set(b.p.value, b);
    const quads = [];
    const add = (s, p, o) => {
      if (!s || !p || o == null || o === '') return;
      quads.push({ s, p, o, g: graphIri });
    };
    for (const x of items) {
      const qUri = effectiveWikidataUri(x);
      const b = qUri && byUri.get(qUri);
      if (!b) continue;
      add(x.uri, 'urn:kgx:vocab:dob',        b.dobOut?.value);
      add(x.uri, 'urn:kgx:vocab:dod',        b.dodOut?.value);
      add(x.uri, 'urn:kgx:vocab:birthplace', b.birthplace?.value);
      // Bridge facts ABOUT the birthplace into the store too, so a
      // pivot to birthplaces can render labels without re-querying.
      if (b.birthplace?.value) {
        const bp = b.birthplace.value;
        add(bp, 'http://www.w3.org/2000/01/rdf-schema#label', b.birthplaceLabel?.value);
        add(bp, 'urn:kgx:vocab:country',                     b.country?.value);
        add(bp, 'urn:kgx:vocab:coord',                       b.birthplaceCoord?.value);
      }
      // GROUP_CONCAT'd multi-values come back pipe-separated; one quad
      // per element so set-arithmetic queries are meaningful.
      for (const am of (b.almaMaters?.value  || '').split('|').filter(Boolean)) add(x.uri, 'urn:kgx:vocab:almaMater',  am);
      for (const sp of (b.spouses?.value     || '').split('|').filter(Boolean)) add(x.uri, 'urn:kgx:vocab:spouse',     sp);
      for (const oc of (b.occupations?.value || '').split('|').filter(Boolean)) add(x.uri, 'urn:kgx:vocab:occupation', oc);
    }
    return quads;
  },
};

// ---------------------------------------------------------------------------
// parl-enrich — UK Parliament SPARQL (DDP) via the rdfs:seeAlso bridge from
// Wikidata QID. Adds item.extra.parl = { personUri, constituency, party,
// familyName, givenName }.
// ---------------------------------------------------------------------------
export const parlEnrich = {
  id:        'parl-enrich',
  kind:      'federate',                // cross-source join via rdfs:seeAlso
  joinKey:   'rdfs:seeAlso(WikidataQID → DDPPerson)',
  engineId:  'parl-sparql',
  role:      'crossCheck',
  cap:       ENRICH_MAX,
  requires:  (b) => b.items.some((x) => /Q\d+$/.test(x.uri || '') && (x.sitting || x.mpid)),
  // Mirrors the page's relevant(): Wikidata Q-URI AND (sitting || mpid).
  applicableTo: { types: ['human'], uriPattern: 'Q\\d+$', anyOfFields: ['sitting', 'mpid'] },
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
  kind:      'federate',                // 4-graph cross-source join via Members API id
  joinKey:   'parl:memberId(MembersAPI → DDP/Wikidata/GOV.UK/scraped)',
  engineId:  'fpkg',
  role:      'crossCheck',
  cap:       ENRICH_MAX,
  requires:  (b) => b.items.some((x) => x.mpid),
  // Mirrors the page's relevant(): items with a Members API id (mpid).
  applicableTo: { types: ['human'], requiresFields: ['mpid'] },
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
