# SPARQL material from the humans (Trello)

> Captured verbatim from Trello card **"Write up a style guide?"** — <https://trello.com/c/8qbXV4lx>
> and the two example pages its description links to. Raw capture; indentation is
> as-extracted from the page `<textarea>` blocks (not yet normalised). Provenance noted per query.

## The style guide (card checklist)

These are the cleanup rules the humans are applying:

1. Change from string to array with title, link and query
2. Consistent indenting in code
3. SPARQL commands upper case
4. Only list namespaces used
5. Comment to explain
6. Data properties returned to be lower case. Getter will need to be updated if these change.
7. Include anything useful to adapt the query but commented out. eg date range type stuff
8. If there's another page with a query that has additional filtering, we don't add that stuff commented out to this query
9. Include tab title in link
10. Consistent indenting in SPARQL client

## Card description (links)

```
Examples: [https://api.parliament.uk/procedure-browser/legislatures](https://api.parliament.uk/procedure-browser/legislatures "smartCard-inline")

[https://api.parliament.uk/procedure-browser/legislatures/SO65GBkm](https://api.parliament.uk/procedure-browser/legislatures/SO65GBkm "smartCard-inline")
```

## Extracted queries

### Source: `api.parliament.uk/procedure-browser/legislatures` (index)

Appears to be a **cleaned exemplar** (uppercase keywords, only-used namespace, comments, `ORDER BY`).

```sparql
# We declare the Parliament namespace.
        PREFIX : <https://id.parliament.uk/schema/>
        
        # We select all properties returned.
        SELECT *
        
        # We find all the legislatures and get their name.
        WHERE {
          ?legislature a :Legislature ;
          :name ?legislatureName.
        }
        
        # We order by the name of the legislature.
        ORDER BY ?legislatureName
```

### Source: `api.parliament.uk/procedure-browser/legislatures/SO65GBkm` (Northern Ireland Assembly)

Three blocks: the **first** is a cleaned exemplar; the **second and third** are messier originals
(lowercase `select`/`where`/`filter`, blank-line noise, an unused `rdfs:` prefix, CamelCase
variables, mixed-case keywords) — i.e. good before/after material.

**Block 1 — cleaned exemplar:**

```sparql
# We declare the Parliament and ID namespaces.
        PREFIX : <https://id.parliament.uk/schema/>
        PREFIX id: <https://id.parliament.uk/>
        
        # We select all properties returned.
        SELECT *
        
        # We find all the legislatures and get their name.
        WHERE {
          ?legislature a :Legislature ;
          :name ?legislatureName.
          
          # We filter the results to only include the legislature with ID SO65GBkm.
          FILTER ( ?legislature in ( id:SO65GBkm ) )
        }
```

**Block 2 — messy original:**

```sparql
PREFIX : <https://id.parliament.uk/schema/>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      PREFIX id: <https://id.parliament.uk/>
      select * where { 
  
  
       ?Legislature a :Legislature ;
                    :name ?LegislatureName;
                    :legislatureHasHouse ?House. 
        ?House :name ?HouseName. 
        filter (?Legislature in (id:SO65GBkm))
  
                 } order by ?HouseName
```

**Block 3 — messy original:**

```sparql
PREFIX : <https://id.parliament.uk/schema/>
          PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
          PREFIX id: <https://id.parliament.uk/>
          select ?Legislature ?LegislatureName ?Step ?StepName ?StepType ?StepTypeName (COUNT(?bi) AS ?biCount)   where { 
  
  
           ?Legislature a :Legislature ;
                        :name ?LegislatureName;
                        :legislatureHasProcedureStep ?Step. 
      OPTIONAL { ?Step :procedureStepHasBusinessItem ?bi }
            ?Step :name ?StepName;
                  :procedureStepHasProcedureStepType ?StepType.
            ?StepType :name ?StepTypeName.
              filter (?Legislature in (id:SO65GBkm))
                       } 
      GROUP BY ?Legislature ?LegislatureName ?Step ?StepName ?StepType ?StepTypeName
      Order by ?StepName
```
