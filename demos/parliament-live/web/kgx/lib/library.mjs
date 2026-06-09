// =============================================================================
// kgx/lib/library.mjs — the saved-chain library
//
// Pure data. Each entry is a chain spec the daisychain page can load
// directly, or that the runner (lib/runner.mjs) can execute headlessly.
// Order + ids preserved across the extraction so library URLs stay
// stable.
// =============================================================================

export const LIBRARY = [
  {
    id: 'lab-sitting',
    title: 'Sitting Labour MPs',
    sub: 'Seed → ⚑ Labour → ◉ sitting',
    steps: [
      { kind: 'starter', id: 'uk-mps-1900' },
      { kind: 'op', op: 'party', value: 'Labour Party' },
      { kind: 'op', op: 'sitting' },
    ],
  },
  {
    id: 'tory-sitting',
    title: 'Sitting Conservatives',
    sub: 'Seed → ⚑ Conservative → ◉ sitting',
    steps: [
      { kind: 'starter', id: 'uk-mps-1900' },
      { kind: 'op', op: 'party', value: 'Conservative Party' },
      { kind: 'op', op: 'sitting' },
    ],
  },
  {
    id: 'lab-sitting-bp',
    title: 'Birthplaces of sitting Labour MPs',
    sub: 'Sitting Labour → ⌖ → birthplaces. Switch to map.',
    steps: [
      { kind: 'starter', id: 'uk-mps-1900' },
      { kind: 'op', op: 'party', value: 'Labour Party' },
      { kind: 'op', op: 'sitting' },
      { kind: 'op', op: 'pivot-bp' },
    ],
    suggestView: 'map',
  },
  {
    id: 'sitting-bridged-enriched',
    title: 'Sitting MPs (bridged) + facts',
    sub: 'Sitting → 🔗 has MP id → ✨ enrich. Look at bead 4’s ⓘ.',
    steps: [
      { kind: 'starter', id: 'uk-mps-1900' },
      { kind: 'op', op: 'sitting' },
      { kind: 'op', op: 'bridged' },
      { kind: 'op', op: 'enrich' },
    ],
  },
  {
    id: 'tory-alma',
    title: 'Tory alma maters',
    sub: 'Sitting Tories → 🎓 → alma maters. (Eton, Oxford appear at the top.)',
    steps: [
      { kind: 'starter', id: 'uk-mps-1900' },
      { kind: 'op', op: 'party', value: 'Conservative Party' },
      { kind: 'op', op: 'sitting' },
      { kind: 'op', op: 'pivot-am' },
    ],
  },
  {
    id: 'pre1920-mps',
    title: 'MPs whose last decade was the 1910s',
    sub: 'Seed → ⌚ decade = 1910s.',
    steps: [
      { kind: 'starter', id: 'uk-mps-1900' },
      { kind: 'op', op: 'decade', value: '1910s' },
    ],
  },
  {
    id: 'female-mps',
    title: 'Female MPs since 1900',
    sub: 'Seed → ⚧ gender = female.',
    steps: [
      { kind: 'starter', id: 'uk-mps-1900' },
      { kind: 'op', op: 'gender', value: 'female' },
    ],
  },
  {
    id: 'lab-sitting-parl',
    title: 'Sitting Labour MPs · Parliament-enriched',
    sub: 'Wikidata seed → Labour → sitting → 🏛 enrich with constituency from the DDP.',
    steps: [
      { kind: 'starter', id: 'uk-mps-1900' },
      { kind: 'op', op: 'party', value: 'Labour Party' },
      { kind: 'op', op: 'sitting' },
      { kind: 'op', op: 'parl-enrich' },
    ],
  },
  {
    id: 'parl-seed-tories',
    title: 'Current Tory MPs via UK Parliament SPARQL',
    sub: 'Different engine: starter pulled from id.parliament.uk; ⚑ Conservative.',
    steps: [
      { kind: 'starter', id: 'parl-current-mps' },
      { kind: 'op', op: 'party', value: 'Conservative' },
    ],
  },
  {
    id: 'pm-children-family',
    title: 'Family of recent PMs (design showpiece)',
    sub: 'Wikidata seed → 1990s+ → `children` template, broaden:family. Tighten/broaden enforced.',
    steps: [
      { kind: 'starter', id: 'uk-mps-1900' },
      { kind: 'op', op: 'decade', value: '2000s' },
      { kind: 'op', op: 'rel-pivot', template: 'children', variant: 'family' },
    ],
  },
  {
    id: 'lab-sitting-appgs',
    title: 'APPGs sitting Labour MPs officer (FPKG named graph)',
    sub: 'Wikidata seed → Labour → sitting → AppGs they officer (FPKG appg-register NG).',
    steps: [
      { kind: 'starter', id: 'uk-mps-1900' },
      { kind: 'op', op: 'party', value: 'Labour Party' },
      { kind: 'op', op: 'sitting' },
      { kind: 'op', op: 'rel-pivot', template: 'appg_officer', variant: 'default' },
    ],
  },
  {
    id: 'sitting-constituencies-parl',
    title: 'Constituencies of sitting MPs (Parliament DDP)',
    sub: 'Sitting seed → `current_constituency` template (parl-sparql).',
    steps: [
      { kind: 'starter', id: 'uk-mps-1900' },
      { kind: 'op', op: 'sitting' },
      { kind: 'op', op: 'rel-pivot', template: 'current_constituency', variant: 'default' },
    ],
  },
  {
    id: 'parl-seed-female-heuristic',
    title: 'Female current MPs (Parliament seed, with name heuristic)',
    sub: 'Parl-current-mps doesn’t ship P21 — picker resolves the unknowns from first names.',
    steps: [
      { kind: 'starter', id: 'parl-current-mps' },
      { kind: 'op', op: 'gender', value: 'female (+ first-name heuristic)' },
    ],
  },
  {
    id: 'sitting-bridged-identity',
    title: 'Sitting Labour MPs · bridged across all sources',
    sub: 'Wikidata seed → Labour → sitting → 🔗 cross-source bridge (DDP / Wikidata / GOV.UK / scraped site, via fpkg identity-graph).',
    steps: [
      { kind: 'starter', id: 'uk-mps-1900' },
      { kind: 'op', op: 'party', value: 'Labour Party' },
      { kind: 'op', op: 'sitting' },
      { kind: 'op', op: 'identity-bridge' },
    ],
  },
  {
    id: 'pq-labour-constituencies',
    title: 'Labour-held Commons seats (PQ-seeded)',
    sub: 'constituency_current → MP-party filter Labour.',
    steps: [
      { kind: 'starter', id: 'pq-constituency-current' },
      { kind: 'op', op: 'by-mp-party', value: 'Labour' },
    ],
  },
  {
    id: 'pq-select-committees',
    title: 'Select Committees (PQ)',
    sub: 'formal_body_index → name contains "Select".',
    steps: [
      { kind: 'starter', id: 'pq-formal-body-index' },
      { kind: 'op', op: 'name-contains', value: 'Select' },
    ],
  },
  // -- Coverage chains — exercise op-API verbs that the main library
  //    chains don't, so the LIBRARY iteration test surfaces a wider
  //    slice of the runner + lib.
  {
    id: 'us-mps-by-citizenship',
    title: 'UK MPs since 1900 · narrow by citizenship',
    sub: 'Exercises the citizenship op (Wikidata wdt:P27 — filter on item.citizenships[]).',
    steps: [
      { kind: 'starter', id: 'uk-mps-1900' },
      { kind: 'op', op: 'citizenship', value: 'United Kingdom' },
    ],
  },
  {
    id: 'parties-with-commons',
    title: 'Parties with Commons membership · top by total size',
    sub: 'Exercises the party-bundle ops: in-commons + top-by-size on a PQ-seeded bundle.',
    steps: [
      { kind: 'starter', id: 'pq-party-index' },
      { kind: 'op', op: 'in-commons' },
      { kind: 'op', op: 'top-by-size' },
    ],
  },
  // -- A fork example. The tree shape (branches[] with forkedFrom) lets
  //    one chain hold multiple lines of inquiry sharing a common prefix.
  //    Active-branch runs starter → party → sitting → rel-pivot
  //    (the same as lab-sitting-bp), but a sibling branch on `main`
  //    would let the user also pivot to alma_maters from the same
  //    sitting-Labour bundle without re-fetching the prefix.
  {
    id: 'fork-demo',
    title: 'Fork demo — sitting Labour, branching to birthplaces',
    sub: 'tree-shape chain: shared {starter → Labour → sitting} prefix, fork into birthplaces.',
    activeBranch: 'with-bp',
    branches: [
      {
        id: 'main',
        label: 'sitting Labour',
        steps: [
          { kind: 'starter', id: 'uk-mps-1900' },
          { kind: 'op', op: 'party', value: 'Labour Party' },
          { kind: 'op', op: 'sitting' },
        ],
      },
      {
        id: 'with-bp',
        label: '→ birthplaces',
        forkedFrom: { branch: 'main', beadIdx: 2 },
        steps: [
          { kind: 'op', op: 'rel-pivot', template: 'birthplaces', variant: 'default' },
        ],
      },
    ],
  },
  // -- Parallax-style demonstrators
  {
    id: 'parallax-hk',
    title: 'HK skyscrapers → architects → other works',
    sub: 'Classic Parallax chain: building bundle → P84 architect → ^P84 other buildings. Switch to map.',
    steps: [
      { kind: 'starter', id: 'hk-skyscrapers' },
      { kind: 'op', op: 'rel-pivot', template: 'architects', variant: 'default' },
      { kind: 'op', op: 'rel-pivot', template: 'works_by', variant: 'default' },
    ],
    suggestView: 'map',
  },
  {
    id: 'parallax-hk-via-class',
    title: 'HK building → its class → all instances',
    sub: 'Start from HK skyscrapers → P31 to class (skyscraper / high-rise) → ^P31 to every instance of that class. Then narrow by country.',
    steps: [
      { kind: 'starter', id: 'hk-skyscrapers' },
      { kind: 'op', op: 'rel-pivot', template: 'wd_class_of',    variant: 'default' },
      { kind: 'op', op: 'rel-pivot', template: 'wd_instances_of', variant: 'default' },
    ],
    suggestView: 'map',
  },
  {
    id: 'parallax-presidents',
    title: 'US Presidents → children → educated at',
    sub: 'Presidents → P40 children → 🎓 alma maters.',
    steps: [
      { kind: 'starter', id: 'us-presidents' },
      { kind: 'op', op: 'rel-pivot', template: 'children', variant: 'default' },
      { kind: 'op', op: 'pivot-am' },
    ],
  },
  {
    id: 'whig-pm-descendants-royal',
    title: 'Whig PMs of the 1700s → 20th-century descendants with “royal” blurbs',
    sub: '11 Whig PMs (Walpole 1721 → Portland 1783) → P40+ descendants → born 1901–2000 → ≥5 sitelinks → description contains “royal”. Diana, Princess of Wales tops the list.',
    steps: [
      { kind: 'starter', id: 'whig-pms-1700s' },
      { kind: 'op', op: 'rel-pivot', template: 'descendants', variant: 'default' },
      { kind: 'op', op: 'born-century',  value: '20' },
      { kind: 'op', op: 'min-sitelinks', value: '5' },
      { kind: 'op', op: 'desc-contains', value: 'royal' },
    ],
  },
  {
    id: 'sis-by-laying-body',
    title: 'SIs → laying body (DDP)',
    sub: 'Statutory Instruments → walk via Laying → LayingBody. Government departments ranked by how many SIs they laid.',
    steps: [
      { kind: 'starter', id: 'recent-sis' },
      { kind: 'op', op: 'rel-pivot', template: 'si_laying_body', variant: 'default' },
    ],
  },
  {
    id: 'leg-url-to-parl-wrapper',
    title: 'legislation.gov.uk URL → Parliament SI wrapper',
    sub: 'Inverse webLink pivot — given a leg.gov.uk SI URL, find what Parliament calls it. The cross-source bridge the user query expressed as SPARQL.',
    steps: [
      { kind: 'starter', id: 'legislation-gov-uk-sample' },
      { kind: 'op', op: 'rel-pivot', template: 'parl-wraps', variant: 'default' },
    ],
  },
];
