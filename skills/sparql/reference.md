# UK Parliament SPARQL — query cookbook

Endpoint: `https://api.parliament.uk/sparql`

There is no schema document published by the endpoint itself; the
ontology lives implicitly in the data. The most reliable way to learn
it is to interrogate it. Recipes below.

## Discovery

### Enumerate all classes

```sparql
SELECT DISTINCT ?cls (COUNT(?s) AS ?n) WHERE {
  ?s a ?cls .
} GROUP BY ?cls ORDER BY DESC(?n) LIMIT 200
```

### Enumerate predicates used on a class

```sparql
PREFIX parl: <https://id.parliament.uk/schema/>
SELECT DISTINCT ?p (COUNT(?s) AS ?n) WHERE {
  ?s a parl:Person ; ?p ?o .
} GROUP BY ?p ORDER BY DESC(?n) LIMIT 200
```

### Pull `rdfs:Class` and `owl:Class` definitions

```sparql
SELECT DISTINCT ?cls ?label WHERE {
  { ?cls a rdfs:Class } UNION { ?cls a owl:Class }
  OPTIONAL { ?cls rdfs:label ?label }
} ORDER BY ?cls
```

### Pull the class hierarchy

```sparql
SELECT ?sub ?super WHERE { ?sub rdfs:subClassOf ?super . } LIMIT 1000
```

### SKOS concept schemes

```sparql
SELECT DISTINCT ?scheme ?label WHERE {
  ?scheme a skos:ConceptScheme .
  OPTIONAL { ?scheme rdfs:label ?label . }
}
```

## Common queries

### Current MPs and their constituencies

```sparql
PREFIX parl: <https://id.parliament.uk/schema/>
SELECT ?member ?givenName ?familyName ?constituency WHERE {
  ?incumbency a parl:SeatIncumbency ;
              parl:seatIncumbencyHasMember ?member ;
              parl:seatIncumbencyHasHouseSeat ?seat .
  FILTER NOT EXISTS { ?incumbency parl:incumbencyEndDate ?e . FILTER(?e < NOW()) }
  ?seat parl:houseSeatHasConstituencyGroup ?cg .
  ?cg parl:constituencyGroupName ?constituency .
  ?member parl:personGivenName ?givenName ; parl:personFamilyName ?familyName .
}
```

### Post-holders on a specific date

```sparql
PREFIX parl: <https://id.parliament.uk/schema/>
SELECT ?post ?name ?holder WHERE {
  ?incumbency parl:postIncumbencyHasPost ?post ;
              parl:postIncumbencyHasMember ?holder ;
              parl:incumbencyStartDate ?start .
  OPTIONAL { ?incumbency parl:incumbencyEndDate ?end . }
  FILTER (?start <= "2024-01-01"^^xsd:date && (!BOUND(?end) || ?end > "2024-01-01"^^xsd:date))
  ?post parl:postName ?name .
}
```

### Divisions on a sitting day

```sparql
PREFIX parl: <https://id.parliament.uk/schema/>
SELECT ?division ?title WHERE {
  ?division a parl:CommonsDivision ;
            parl:divisionDate "2024-03-12"^^xsd:date ;
            parl:divisionTitle ?title .
}
```

### Committee membership for a person

```sparql
PREFIX parl: <https://id.parliament.uk/schema/>
SELECT ?body ?bodyName ?start ?end WHERE {
  ?membership a parl:FormalBodyMembership ;
              parl:formalBodyMembershipHasPerson ?p ;
              parl:formalBodyMembershipHasFormalBody ?body ;
              parl:formalBodyMembershipStartDate ?start .
  OPTIONAL { ?membership parl:formalBodyMembershipEndDate ?end . }
  ?body parl:formalBodyName ?bodyName .
  ?p parl:hasMnisId 172 .   # Diane Abbott
}
```

## Notes

- The store contains the same person under multiple lifecycle URIs in
  some places; prefer the `parl:hasMnisId` join key for stability.
- Date-typed literals are `xsd:date` not `xsd:dateTime`.
- `parl:` prefixes are the canonical Parliament schema; many entities
  also carry `dcterms:identifier` and `skos:notation` properties for
  cross-referencing to other datasets.
