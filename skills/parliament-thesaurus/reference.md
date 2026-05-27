# UK Parliament Thesaurus — reference

## Endpoint shape

Base: `https://lda.data.parliament.uk/terms`

Format suffixes (per Elda's content negotiation):

| Suffix | Response |
|---|---|
| `.json` | LDA JSON-LD output |
| `.ttl`  | Turtle (used by this skill — easiest for rdflib) |
| `.xml`  | RDF/XML |
| `.csv`  | flattened CSV |

Pagination via `_page` (zero-indexed) + `_pageSize`. Default view is
incomplete on some terms; for full coverage use `_view=all`.

Per-item URLs: `https://lda.data.parliament.uk/terms/{id}` returning
RDF (e.g. `terms/8193.ttl`).

## Named graphs

Predicate classification fixed by `graph_for_triple()` in
`dump_terms.py`:

| Graph | Predicates included | Typical count |
|---|---|---:|
| `…/legacy-terms/core` | `rdf:type`, `skos:prefLabel`, `skos:altLabel`, `skos:hiddenLabel`, `skos:notation`, `parl:isPreferred`, `parl:skosAttribute`, `parl:isThesaurusTerm` | ~half the quads |
| `…/legacy-terms/hierarchy` | `skos:broader`, `narrower`, `broaderTransitive`, `narrowerTransitive`, `inScheme`, `topConceptOf`, `hasTopConcept` | per-relation |
| `…/legacy-terms/related` | `skos:related` | sparser |
| `…/legacy-terms/mappings` | `skos:exactMatch`, `closeMatch`, `broadMatch`, `narrowMatch`, `relatedMatch`, `parl:mappedTopic`, `parl:member` | per-bridge |
| `…/legacy-terms/label-sidecar` | label predicates on subjects we referenced but didn't ourselves emit core data for | small |
| `…/legacy-terms/other` | catch-all for predicates not classified above | small |

The split is deliberately coarse: when you want only the concept
backbone you query the `core` + `hierarchy` graphs; for cross-vocabulary
joins you bring in `mappings`.

## Example query against the loaded store

Once the `.nq.gz` is in Oxigraph (locally or on `fpkg.fly.dev`):

```sparql
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?label ?broader_label WHERE {
  GRAPH <https://lda.data.parliament.uk/graph/legacy-terms/core> {
    ?term skos:prefLabel ?label .
  }
  GRAPH <https://lda.data.parliament.uk/graph/legacy-terms/hierarchy> {
    ?term skos:broader ?broader .
  }
  GRAPH <https://lda.data.parliament.uk/graph/legacy-terms/core> {
    ?broader skos:prefLabel ?broader_label .
  }
} LIMIT 20
```

```sparql
# Top-concept hierarchy
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?label WHERE {
  GRAPH <https://lda.data.parliament.uk/graph/legacy-terms/hierarchy> {
    ?term skos:topConceptOf ?scheme .
  }
  GRAPH <https://lda.data.parliament.uk/graph/legacy-terms/core> {
    ?term skos:prefLabel ?label .
  }
} ORDER BY ?label
```

## Operational notes

- The crawler caches every Turtle response to `cache-parliament-lda-terms/` (gitignored). Re-runs from cache are instant; force-refresh by deleting the directory.
- Be polite — `--sleep 0.25` between fetches. The LDA throttles aggressively when hit faster.
- Blank-node triples are skipped (no good way to round-trip them across an N-Quads dump that gets reloaded). The dataset uses very few; the skip count is in the summary JSON.
- Some LDA pages return `_view`-dependent content; if you see suspiciously low coverage, retry with `--view all`.
- The default `terms.ttl` endpoint returns a Linked-Data API "list view" wrapped around the actual triples. The crawler discards that wrapping by selecting only subjects under the canonical `http://data.parliament.uk/terms/` namespace, then sidecars in useful labels for targets.

## Why not just SPARQL?

The modern `api.parliament.uk/sparql` (DDP) defines a `Concept` class
but holds zero instances — the Thesaurus was never loaded into that
store. The legacy LDA at `lda.data.parliament.uk` is the only source
of the actual concept data; this skill is the way to extract it once.
See [`../sparql/SKILL.md`](../sparql/SKILL.md) for the broader
DDP-vs-LDA story.
