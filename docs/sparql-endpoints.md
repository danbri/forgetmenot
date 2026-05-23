# UK Parliament's RDF graphs and SPARQL endpoints

UK Parliament runs **three** RDF graphs (named here DDP, DD, and an
unnamed internal one). Two are public; one is internal. This is
project lore that isn't well-documented anywhere public, captured
here from a session note 2026-04-30 and corrected against direct
evidence 2026-05-18 (see "Correction" near the bottom).

The naming below is **local to this repo** — Parliament does not
reliably call them by these names. If you go and ask a digital-team
person about "DDP" they may not know what you mean. The public
endpoint hostnames are the canonical references.

(Historical note on terminology: "triple store" is the way these
back-ends were marketed in the late-2000s era when this Parliament
stack was first built. No modern RDF store is triples-only — every
shipping engine has supported named graphs / quads for a long time.
This page calls them "graphs" or "endpoints" by default; "store"
appears below only where it specifically means the back-end engine,
not its triples-vs-quads shape.)

## Public graphs

### 1. DDP — `data.parliament`

- Public-facing data catalogue.
- Hosts records for the modern API surface (members, divisions,
  contributions, etc.) **and the procedural-business instance
  data** — Acts, SIs, Bills, Treaties, scrutiny steps — typed under
  the procedural ontology (`parl:LayingBody`, `parl:Procedure`,
  `parl:WorkPackage`, …).
- Approximately **7.5 million statements** as last surveyed.
- **Inference is off.** Queries see asserted statements only.
- Surfaced via three matching public endpoints over the same graph:
  - The SPARQL endpoint at <https://api.parliament.uk/sparql>.
  - The OData service at <https://api.parliament.uk/odata/>.
  - The parameterised-query browser at
    <https://api.parliament.uk/query/>.

### 2. DD — "data developers" / procedural ontology graph

- Carries the **procedural ontology with inference turned on** —
  the closure under `rdfs:subClassOf`, `rdfs:subPropertyOf`, and
  the procedural ontology's OWL axioms. (SL — Silver Oliver,
  formerly of the Parliament data team — worked on this ontology;
  it's recognisable from his published work on parliamentary
  procedure modelling.)
- Approximately **3.14 million statements** as last surveyed.
- **Not on a public SPARQL endpoint of its own.** Its inferred
  closure isn't directly queryable from outside Parliament.
- Procedural data does flow through the public REST APIs (notably
  Statutory Instruments, Treaties, and Written Questions /
  Statements), so a great deal of what DD models is reachable via
  REST — those REST endpoints are the public surface DD effectively
  exposes.

Both run on **GraphDB** as the back-end engine. Neither is heavily
supported — the original team has largely moved on — but both are
running and updated **at least daily**.

**Practical implications of DD's inference being on:**

- Counts of "instances of X" against DD include subclass instances
  even when the asserted triple is `rdf:type subclass-of-X`.
- Property domain/range axioms can populate types you didn't expect.
- A query that depends on entailment under the procedural ontology
  will work against DD but may return empty against DDP, even
  though the asserted instance data lives in DDP.
- DDP, by contrast, is queried as asserted (no inference). The two
  graphs answer the same SPARQL with different result sets when
  the question turns on entailment.

When in doubt about whether a result is asserted or inferred, query
for the `rdfs:isDefinedBy` / `prov:wasDerivedFrom` provenance, or
re-run the same query against the asserted-only graph directly.

## Internal third graph

There is a third RDF graph that is not public-facing. Its scope
isn't recorded here.

## Offline copies

Two opportunistic ways to obtain a snapshot for offline / local
querying — useful if you want to point a local model at a SPARQL
endpoint without going through the live service:

| Source | Notes |
|---|---|
| GraphDB Docker Hub container image | One of the two graphs has been bundled into a public GraphDB container image. **Which** of DDP / DD is in that image is not clearly recorded — verify by inspecting the image labels and statement count after import. |
| Internet Archive Wayback Machine, ~2019 | The other graph can be reconstructed from a Wayback capture circa 2019. Same caveat about which is which. |

For day-to-day querying via the live SPARQL endpoint, see
[`skills/sparql/SKILL.md`](../skills/sparql/SKILL.md). The recipes
in `skills/sparql/reference.md` discover the schema empirically and
do not assume DDP-vs-DD knowledge.

## Why this matters

When the SPARQL endpoint at `api.parliament.uk/sparql` returns
something you didn't expect, it's worth remembering:

- The endpoint fronts **DDP only**. DD's inferred closure isn't on
  this surface. If your query depends on entailment under the
  procedural ontology (e.g. expecting all subclasses of an SI
  category to be returned by a query against the parent class
  without explicit `?x rdf:type/rdfs:subClassOf* ?parent`
  navigation), it won't match against DDP. Either:
  1. Rewrite the query to walk the subclass tree explicitly, or
  2. Drop down to the matching REST API
     (Statutory Instruments, Treaties, Written Questions), which is
     DD's effective public surface.
- Coverage will **not** match the modern REST APIs perfectly.
  The REST APIs are updated more aggressively than either RDF graph;
  SPARQL queries can lag the REST surface by hours to days for the
  newest data.

## Worked examples — the House of Commons Library's procedure queries

The Library publishes ~30 SPARQL queries at
<https://ukparliament.github.io/ontologies/procedure/meta/queries/>
covering Public Acts, proposed Negative SIs, Legislative Reform
Orders, scrutiny types, the SI Service website timeline, and so on.
Every one of them is a saved query on `api.parliament.uk/sparql` —
i.e. they run against **DDP**, not DD. Dereferencing one of the
shortlinks (e.g. <https://api.parliament.uk/s/042015a8>) returns
a SPARQL Service Description naming `api.parliament.uk/sparql`
explicitly.

Two implications:

1. Procedural-business instance data IS in DDP and IS queryable
   over the public SPARQL endpoint — the Library does this routinely.
2. The Library's queries are written so they don't depend on DD's
   inference — they walk the subclass tree explicitly (or work with
   asserted types) where they need to.

So the right mental model is: *DDP has the data, DD has the
reasoning*. A procedural question that's hard against DDP is
usually hard because the entailment is missing, not because the
asserted triples are missing.

## Correction (2026-05-18)

Earlier wording on this page (and in `CLAUDE.md`, `readme.md`)
implied that procedural-business records *live in DD and not in
DDP* — and that a SPARQL query returning empty meant "you need DD".
That's misleading. Verified against the live endpoint and the
Library's published query set:

- The procedural instance data — Acts, SIs, scrutiny steps, work
  packages — is in DDP, asserted, queryable at
  `api.parliament.uk/sparql`.
- DD's distinguishing role is **inference**, not data. It hosts the
  same ontology with the OWL/RDFS closure computed; queries that
  depend on that closure work there and not against DDP.
- The asymmetry between SPARQL and REST that the doc previously
  attributed to "data lives in DD" should really be attributed to
  "DD does the inference; the REST APIs are DD's effective public
  surface".

The rest of the page has been reworded to match this.

## Confirming any of this

Verify with two queries:

```sparql
# How many statements in the live SPARQL graph?
SELECT (COUNT(*) AS ?n) WHERE { ?s ?p ?o }

# Which named graphs?
SELECT DISTINCT ?g WHERE { GRAPH ?g { ?s ?p ?o } } LIMIT 20
```

Both can be run via:

```sh
parl sparql query 'SELECT (COUNT(*) AS ?n) WHERE { ?s ?p ?o }'
parl sparql query 'SELECT DISTINCT ?g WHERE { GRAPH ?g { ?s ?p ?o } } LIMIT 20'
```

And to confirm DDP has the procedural-ontology instance data:

```sparql
PREFIX parl: <https://id.parliament.uk/schema/>
SELECT (COUNT(*) AS ?n) WHERE { ?x a parl:LayingBody }
```
