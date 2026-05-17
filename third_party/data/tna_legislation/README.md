# `tna_legislation` — cached RDF from legislation.gov.uk

Each Act / SI fetched by `skills/tna-legislation/scripts/fetch_rdf.py`
lands here as three files:

```
<type>__<year>__<number>.rdf          # original RDF/XML
<type>__<year>__<number>.ttl          # rdflib-serialised Turtle
<type>__<year>__<number>.fetch.json   # URL, status, ETag, fetched_at
```

Re-creatable from the public per-URI Content API at legislation.gov.uk;
not committed by default (see `.gitignore`).

## Why local cache

The public `/sparql` endpoint at legislation.gov.uk is
**invitation-only** (HTTP Basic realm `By Invitation Only - Linked
Data`), so cross-Act queries need either TNA credentials or a local
materialisation. Pull a slice with the fetch script and serve via
rdflib-endpoint -- the sample queries in
[`skills/tna-legislation/queries/`](../../../skills/tna-legislation/queries/)
target the same vocabularies and so work over either.

## Provenance

Tier 3 (third-party). Operator: The National Archives.
Licence: Open Government Licence v3.0.
See [`docs/provenance.md`](../../../docs/provenance.md) for the policy
and [`skills/tna-legislation/SKILL.md`](../../../skills/tna-legislation/SKILL.md)
for the skill that drives this dir.
