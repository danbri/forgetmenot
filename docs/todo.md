# TODO

Items captured during initial scaffolding that we deliberately deferred.

## RDF / SPARQL alignment with REST concepts

User-suggested follow-up: walk the SPARQL endpoint at
`https://api.parliament.uk/sparql` to extract the class hierarchy
(`rdfs:Class`, `owl:Class`, `rdfs:subClassOf`) and look for explicit
or implicit alignments with the entities surfaced by each REST API.

Specifically:

1. Enumerate all classes via:
   ```sparql
   SELECT DISTINCT ?cls ?label WHERE {
     { ?cls a rdfs:Class } UNION { ?cls a owl:Class }
     OPTIONAL { ?cls rdfs:label ?label }
   }
   ```
2. Pull the hierarchy via `?sub rdfs:subClassOf ?super`.
3. Pull SKOS concept schemes (`?cs a skos:ConceptScheme`) and their
   `skos:hasTopConcept` / `skos:narrower` chains. The Parliament
   Thesaurus is the most interesting target — it sits behind much of
   the indexing of debates, briefings and questions and is therefore
   the natural bridge to free-text REST APIs (Hansard search,
   Q&S search).
4. For each REST API, list the resource types it returns (member,
   bill, division, debate, treaty, …) and map them to the closest
   class in the ontology. Record the mapping in
   `docs/concept-map.md`.
5. Where a REST resource has an `id`/`uri` that resolves under
   `id.parliament.uk`, the link is direct — record that. Where it
   does not, note the join key (e.g. Members API integer ID joins
   to SPARQL via `parl:hasMnisId`).
6. Output: a single concept map document plus, where useful, an
   updated `reference.md` for each affected skill that says "this
   resource corresponds to class X in the SPARQL graph".

This is non-trivial and is deferred for a later session.

## Other deferred items

- An MCP server wrapping the same per-facility folders. The skill format
  was chosen first because it's the lighter-weight artefact; an MCP
  layer can be added later without redoing the cataloguing.
- A `data-parliament-uk-datasets` skill currently documents the 19
  legacy datasets but does not yet enumerate the corresponding
  individual LDA endpoint URLs for each. Worth doing once the
  alignment with the SPARQL ontology above is in place.
- Historic Hansard (1803–2005) has no documented JSON API. Investigate
  whether the underlying `parlparse` data feeds (TheyWorkForYou) or
  the `xml.parliament.uk` dumps offer a programmatic route.
