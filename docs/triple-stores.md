# UK Parliament's RDF triple stores

UK Parliament runs **three** RDF triple stores. Two are public; one is
internal. This is project lore that isn't well-documented anywhere
public, captured here from a session note 2026-04-30.

The naming below is **local to this repo** — Parliament does not
reliably call them by these names. If you go and ask a digital-team
person about "DDP" they may not know what you mean. The public
endpoint hostnames are the canonical references.

## Public stores

### 1. DDP — `data.parliament`

- Public-facing data catalogue store.
- Hosts records for the modern API surface (members, divisions,
  contributions, etc.).
- Approximately **7.5 million triples** as last surveyed.
- Surfaced via:
  - The SPARQL endpoint at <https://api.parliament.uk/sparql>.
  - The OData service at <https://api.parliament.uk/odata/>.
  - The parameterised-query browser at
    <https://api.parliament.uk/query/>.

### 2. DD — "data developers" / procedural ontology store

- Carries an **ontology describing procedural business**, particularly
  statutory instruments, treaties, and written questions. (SL —
  Silver Oliver, formerly of the Parliament data team — worked on
  this; the ontology is sometimes recognisable from his published
  work on parliamentary procedure modelling.)
- Approximately **3.14 million triples** as last surveyed.
- Less obviously surfaced via a single public endpoint than DDP.
  Procedural data does flow through the public REST APIs (notably
  Statutory Instruments, Treaties, and Written Questions /
  Statements), so a great deal of what's in DD is reachable via REST
  even when the SPARQL surface is awkward.

Both are running on **GraphDB** as of last check. Neither is heavily
supported — the original team has largely moved on — but both are
running and updated **at least daily**.

**DD has inference turned on.** That is, when you query DD you are
querying the closure under the procedural ontology's `rdfs:subClassOf`,
`rdfs:subPropertyOf`, and OWL axioms — *not* just the asserted triples.
Practical implications:

- Counts of "instances of X" include subclass instances even when the
  asserted triple is `rdf:type subclass-of-X`.
- Property domain/range axioms can populate types you didn't expect.
- A query that looks for asserted typing only (e.g. via
  `EXISTS { ?s a <X> }`) will see more matches than the same query
  against an inference-off store would.
- DDP, by contrast, is queried as asserted (no inference). The two
  stores answer the same SPARQL with different result sets.

When in doubt about whether a result is asserted or inferred, query
for the `rdfs:isDefinedBy` / `prov:wasDerivedFrom` provenance, or
re-run the same query against the asserted-only graph directly.

## Internal third store

There is a third triple store that is not public-facing. Its scope
isn't recorded here.

## Offline copies

Two opportunistic ways to obtain a snapshot for offline / local
querying — useful if you want to point a local model at a SPARQL
endpoint without going through the live service:

| Source | Notes |
|---|---|
| GraphDB Docker Hub container image | One of the two stores has been bundled into a public GraphDB container image. **Which** of DDP / DD is in that image is not clearly recorded — verify by inspecting the image labels and triple count after import. |
| Internet Archive Wayback Machine, ~2019 | The other store can be reconstructed from a Wayback capture circa 2019. Same caveat about which is which. |

For day-to-day querying via the live SPARQL endpoint, see
[`skills/sparql/SKILL.md`](../skills/sparql/SKILL.md). The recipes
in `skills/sparql/reference.md` discover the schema empirically and
do not assume DDP-vs-DD knowledge.

## Why this matters

When the SPARQL endpoint at `api.parliament.uk/sparql` returns
something you didn't expect, it's worth remembering:

- The endpoint is fronting **DDP**, mostly. Procedural-business
  questions that feel like they should be answerable but return empty
  may live in DD instead, and DD is not on the same SPARQL surface.
  When that happens, drop down to the matching REST API
  (Statutory Instruments, Treaties, Written Questions) — the data is
  there, just exposed via REST not SPARQL.
- Coverage will **not** match the modern REST APIs perfectly.
  The REST APIs are updated more aggressively than either triple
  store; SPARQL queries can lag the REST surface by hours to days for
  newest data.

## Confirming any of this

Verify with two queries:

```sparql
# How many triples in the live SPARQL store?
SELECT (COUNT(*) AS ?n) WHERE { ?s ?p ?o }

# Which named graphs?
SELECT DISTINCT ?g WHERE { GRAPH ?g { ?s ?p ?o } } LIMIT 20
```

Both can be run via:

```sh
parl sparql query 'SELECT (COUNT(*) AS ?n) WHERE { ?s ?p ?o }'
parl sparql query 'SELECT DISTINCT ?g WHERE { GRAPH ?g { ?s ?p ?o } } LIMIT 20'
```
