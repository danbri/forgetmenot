---
name: eur-lex
description: "Query the EUR-Lex CELLAR SPARQL endpoint at publications.europa.eu/webapi/rdf/sparql — EU law and case-law as Linked Data, with extensive cross-references to national-law transpositions. Of particular UK Parliament interest for Retained EU Law Act 2023 research — every UK statute or SI that retains, modifies, or revokes EU-origin law has a CELEX-number reference that resolves here. Pair with tna-legislation: legislation.gov.uk uses the same FRBR model and includes CELLAR links on EU-origin instruments. Free SPARQL 1.1, no auth."
license: "CC-BY 4.0 (EUR-Lex metadata under EU re-use licence)"
metadata:
  facility: eur-lex
  cli-alias: eurlex
  base-url: https://publications.europa.eu/webapi/rdf/sparql
  provenance:
    tier: 3
    operator: Publications Office of the European Union
    service: publications.europa.eu/webapi/rdf/sparql (CELLAR)
    upstream-data: "EU law and case-law from the EUR-Lex platform, modelled in the Common Data Model (CDM) ontology"
    citation-short: "via EUR-Lex CELLAR"
    citation-formal: "EUR-Lex CELLAR SPARQL endpoint, Publications Office of the EU, retrieved {date}, CC-BY 4.0"
    confidence: authoritative
    confidence-notes: "Authoritative metadata for EU legal acts. The CDM vocabulary is large; the by-celex preset is the only one we ship — for other queries consult https://op.europa.eu/en/web/eu-vocabularies/dataset/-/resource?uri=http://publications.europa.eu/resource/dataset/cdm for the ontology."
---

# EUR-Lex CELLAR SPARQL

Base URL: `https://publications.europa.eu/webapi/rdf/sparql`.
SPARQL 1.1; no auth. Polite User-Agent expected.

## CELEX numbers (the canonical join key)

Every EU legal act has a **CELEX** identifier:
- `32016R0679` — GDPR
- `32011L0024` — Directive on Patients' Rights in Cross-border Healthcare
- `12012E/TXT` — TFEU consolidated 2012

CELEX is the join key from `tna-legislation` (UK Retained EU Law) to
the EU origin — `legislation.gov.uk`'s RDF for retained-EU-law
instruments carries CELEX cross-references.

## CLI

```sh
parl eurlex by-celex 32016R0679              # GDPR's work-level URI + title
parl eurlex query 'SELECT * WHERE { ?s ?p ?o } LIMIT 1'
```

## Joins to Parliament

- **Retained EU Law Act 2023** research: any UK SI that retains or
  revokes EU-origin law cites the CELEX number. Pair with
  [`si`](../statutory-instruments/SKILL.md) for the SI procedural
  side and [`tna-legislation`](../tna-legislation/SKILL.md) for the
  enacted text.
- Brexit-era Bills (the EU (Withdrawal) Act 2018, etc.) reference
  EU directives by CELEX throughout — useful when researching what
  exactly was incorporated.

## Provenance to cite

**Tier 3 — third-party (Publications Office of the EU), authoritative.**

- Inline cite: **"(via EUR-Lex CELLAR)"** — once per paragraph.
- Give the CELEX number for any specific EU act referenced.
- See [`../../docs/provenance.md`](../../docs/provenance.md).
