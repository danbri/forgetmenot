# Cross-source identity graph (RDF N-Quads)

`identity.nq` reconciles every UK Parliament member captured in
this repository across the identifier systems they actually
appear under: Members API id, MNIS id, DDP person LocalId,
scraped per-MP corpora, APPG officer roles, and GOV.UK people
factoids. Built by `scripts/build-identity-graph.mjs` from
local files plus a single SPARQL fetch against
`api.parliament.uk/sparql`.

## Why N-Quads

Quads, not triples, because the same person appears in multiple
sources and we want to *know which source said what*. Each
statement carries a named-graph IRI naming its origin:

| Graph IRI | Source |
|---|---|
| `…/graph/identity/members-api` | `third_party/data/members/<id>.json` per-MP dumps |
| `…/graph/identity/ddp-sparql` | DDP triple store via `api.parliament.uk/sparql` |
| `…/graph/identity/scraped` | `third_party/data/sites/<id>/` polite website crawl |
| `…/graph/identity/appg` | `third_party/data/appg/resolved.json` officer resolutions |
| `…/graph/identity/govuk` | `third_party/govuk/.../factoids/…/factoids.ttl` |
| `…/graph/identity/provenance` | self-describes the other five (see below) |

That way a downstream query like *"which people in our graph
have an `owl:sameAs` from DDP **and** an `owl:sameAs` to GOV.UK?"*
is a one-liner.

## Provenance graph

The sixth named graph is **`https://forgetmenot.local/graph/identity/provenance`**,
which describes the other five using **PROV-O** and **VoID**:

- Each source graph is typed `void:Dataset` + `prov:Entity` and
  carries `dcterms:title`, `dcterms:description`, `dcterms:source`
  (one or more — the local file path and/or the remote URL it was
  fetched from), `void:triples` (its quad count), and
  `prov:wasDerivedFrom` for every source URL.
- One `prov:Activity` represents the build run, with
  `prov:startedAtTime` / `prov:endedAtTime` and
  `prov:wasAssociatedWith` pointing at the `prov:SoftwareAgent`
  for `scripts/build-identity-graph.mjs`. When the build is run
  inside a git checkout the activity also carries
  `fmn:gitRevision`.
- Every source graph is connected back to that activity by
  `prov:wasGeneratedBy`, so given a quad, three hops gets you to
  "what command produced this, at what git revision, against
  which upstream source".

## Identifiers

The canonical subject IRI per person is the Members API URL:

    https://members-api.parliament.uk/api/Members/<id>

with `owl:sameAs` links into:

- DDP: `https://id.parliament.uk/<LocalId>`
- GOV.UK people pages (when matched)
- Wikidata (when the APPG resolver attached one)

Plus literal-valued identifiers under
`https://forgetmenot.local/identity#`:

- `fmn:membersApiId`, `fmn:mnisId`, `fmn:ddpLocalId`
- `fmn:scrapedSiteDir`, `fmn:scrapedFeed`, `fmn:memberDump`
- `fmn:appgOfficership` → blank node with `fmn:appgGroup` and `fmn:appgRole`
- `fmn:govukFactoidFile`

## Build it

    npm run identity-graph
    # or directly:
    node scripts/build-identity-graph.mjs

The script makes **one** SPARQL request (5,425 DDP↔MNIS
bindings in a single fetch) and the rest is local filesystem
reads, so the build is fast (under 10s on a warm machine) and
politely uses the upstream API.

## Today's totals

See `_index.json`. As of the last build:

- 55,975 quads total
- 1,426 members from local per-MP dumps
- 1,425 of those bridged cleanly to a DDP LocalId
- 436 with a scraped MP website
- 2,170 APPG officerships attached
- 14 cross-linked to a GOV.UK people factoid
- 4,000 additional DDP-only persons (historical members we
  don't have a local dump for)

## Worked example — Lord Holmes of Richmond (memberId 4294)

The same person under five surface forms in five different graphs:

```turtle
# members-api graph
<https://members-api.parliament.uk/api/Members/4294>
  a              schema:Person ;
  schema:name    "Lord Holmes of Richmond" ;
  fmn:mnisId     "4294" ;
  fmn:house      "Lords" ;
  fmn:party      "Conservative" .

# ddp-sparql graph
<https://members-api.parliament.uk/api/Members/4294>
  owl:sameAs        <https://id.parliament.uk/34bI5Ock> ;
  fmn:ddpLocalId    "34bI5Ock" ;
  schema:givenName  "Christopher" ;
  schema:familyName "Holmes" .

# scraped graph
<https://members-api.parliament.uk/api/Members/4294>
  schema:url       <http://www.chrisholmes.co.uk/> ;
  fmn:sitePlatform "WordPress" ;
  fmn:scrapedFeed  "third_party/data/sites/4294/feeds/0.xml" ;
  schema:sameAs    <https://www.linkedin.com/in/lord-chris-holmes/> .

# appg graph
<https://members-api.parliament.uk/api/Members/4294>
  fmn:appgOfficership _:appg_data_and_emerging_technologies_4294 .
_:appg_data_and_emerging_technologies_4294
  fmn:appgGroup    <https://publications.parliament.uk/pa/.../data-and-emerging-technologies.htm> ;
  fmn:appgRole     "Officer" .
```

That is the bridge the static traverse report described in prose,
now machine-queryable as RDF.
