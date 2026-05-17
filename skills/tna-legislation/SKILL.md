---
name: tna-legislation
description: Query and fetch UK legislation as Linked Data from legislation.gov.uk (operated by The National Archives). Covers SPARQL endpoint patterns (note - invitation-only), public per-URI RDF content negotiation, Atom feeds for new/updated Acts and SIs, FRBR/Metalex/Dublin Core data model, and ShEx shapes for the legislation graph. Use when the question is about UK statute, statutory instruments, Acts of Parliament, devolved-legislature Acts, or EU origin law up to 31 Dec 2020.
license: Open Government Licence v3.0 (Crown copyright; legislation.gov.uk content); skill text MIT.
metadata:
  cli-binary: skills/tna-legislation/scripts/fetch_rdf.py
  spec-cache: skills/tna-legislation/shapes/
  provenance-policy: docs/provenance.md
  provenance:
    tier: 3
    operator: "The National Archives (TNA) / TSO"
    service: legislation.gov.uk
    upstream-data: "UK Acts of Parliament, statutory instruments, devolved legislation, EU origin law (to 2020-12-31); RDF/XML + Atom + HTML via content negotiation per URI"
    citation-short: "legislation.gov.uk (TNA)"
    citation-formal: "legislation.gov.uk, The National Archives, Crown copyright under OGL v3.0, retrieved {date}"
    confidence: derived
    confidence-notes: "Per-URI RDF and Atom feeds are first-party authoritative. SPARQL endpoint at /sparql is by-invitation-only (HTTP Basic realm 'By Invitation Only - Linked Data') despite the public docs implying open access -- see danbri/forgetmenot upstream issue."
---

# `tna-legislation` — legislation.gov.uk Linked Data

The National Archives publishes the consolidated UK statute book at
[`legislation.gov.uk`](https://www.legislation.gov.uk/) as Linked Data.
Every legislation URI dereferences to RDF/XML, XML, HTML or Atom by
content negotiation, modelling each Act using FRBR (Work → Expression →
Manifestation → Item) and Metalex.

Two access patterns, very different shapes:

| Surface | Public? | When to use |
|---|---|---|
| Per-URI RDF (`Accept: application/rdf+xml`) | **Yes** | Pull a specific Act / SI / section, walk its FRBR tree, follow `frbr:hasExpression` to versioned text |
| Atom feeds (`*.feed`) | **Yes** | Discover new / recently-amended legislation, drive a crawler |
| SPARQL endpoint at `/sparql` | **Invitation-only** | Cross-Act queries (find all Acts citing X, all amendments to S of Act Y). Requires TNA-issued credentials (HTTP Basic realm `By Invitation Only - Linked Data`) |

This skill documents how to use the public surfaces directly and how to
materialise a local SPARQL endpoint over a fetched slice of RDF for
sessions that don't have endpoint credentials.

## Quick start

```sh
# 1. Pull one Act as RDF/XML (no credentials needed)
python3 skills/tna-legislation/scripts/fetch_rdf.py \
  ukpga/2024/22                # = Leasehold and Freehold Reform Act 2024

# 2. Or fetch by URI directly via curl
curl -H "Accept: application/rdf+xml" \
     -A "your-agent (your-email@example)" \
     https://www.legislation.gov.uk/ukpga/2024/22

# 3. Discover new Acts via the Atom feed
curl https://www.legislation.gov.uk/new/ukpga/data.feed

# 4. (Once you have credentials) hit the SPARQL endpoint
curl -u username:password \
     -H "Accept: application/sparql-results+json" \
     --data-urlencode "query=$(cat skills/tna-legislation/queries/acts-by-keyword.rq)" \
     https://www.legislation.gov.uk/sparql
```

## URI patterns

Every public legislation URI is dereferenceable. The skeleton is
`https://www.legislation.gov.uk/<type>/<year>/<number>[/<section>][/<version>]`.

| Pattern | Example | What it identifies |
|---|---|---|
| `<type>/<year>/<number>` | `ukpga/2024/22` | the **Work** (FRBR) — the Act as a conceptual entity |
| `id/<type>/<year>/<number>` | `id/ukpga/2024/22` | identifier-only URI, `owl:sameAs` the Work |
| `<type>/<year>/<number>/section/<n>` | `ukpga/2024/22/section/1` | a section as its own Work |
| `<type>/<year>/<number>/<version>` | `ukpga/2024/22/2024-05-24` | a specific point-in-time **Expression** |
| `<type>/<year>/<number>/data.xml` | `ukpga/2024/22/data.xml` | the CLML (Crown Legislation Markup Language) XML manifestation |
| `<type>/<year>/<number>/data.rdf` | `ukpga/2024/22/data.rdf` | the RDF/XML manifestation |

Common `<type>` values: `ukpga` (UK Public General Act),
`uksi` (UK Statutory Instrument), `ukla` (UK Local Act), `asp` (Act of
the Scottish Parliament), `anaw` (Act of the National Assembly for
Wales), `nia` (Act of the Northern Ireland Assembly), `eur` (EU
regulation, retained to 2020-12-31), `eudn` (EU decision).

Full pattern documented at https://www.legislation.gov.uk/developer/uris.

## Vocabularies used in the RDF

Each Act ships ~1,500 triples covering its FRBR tree. The actual
vocabularies in use (verified by parsing `ukpga/2024/22.rdf`):

| Prefix | URI | Role |
|---|---|---|
| `leg:` | `http://www.legislation.gov.uk/def/legislation/` | TNA's own legislation ontology |
| `frbr:` | `http://purl.org/vocab/frbr/core#` | Work / Expression / Manifestation / Item |
| `metalex:` | `http://www.metalex.eu/metalex/2008-05-02#` | Legal-document modelling, BibliographicWork etc. |
| `dct:` | `http://purl.org/dc/terms/` | title, identifier, hasVersion, hasFormat, type |
| `rdfs:` | `http://www.w3.org/2000/01/rdf-schema#` | label |
| `owl:` | `http://www.w3.org/2002/07/owl#` | sameAs |
| `foaf:` | `http://xmlns.com/foaf/0.1/` | rare; used for some agents |

The data model is a strict FRBR tree per Act:

```
:Work (the Act as concept)
  └─ frbr:embodiment → :Expression (a versioned text)
       └─ frbr:embodiment → :Manifestation (XML, RDF, HTML, ...)
            └─ frbr:exemplar → :Item (specific file we serve you)
```

A typical Act has many Expressions (each amendment creates a new
point-in-time version) and each Expression has several Manifestations
(XML, RDF/XML, HTML, PDF).

## ShEx shapes

The data model above is formally documented as ShEx shapes at
[`shapes/legislation.shex`](shapes/legislation.shex). Validate a fetched
Act with `shex-validator` or `pyshex`:

```sh
pyshex --schema skills/tna-legislation/shapes/legislation.shex \
       --shape http://www.legislation.gov.uk/shape/Act \
       --infile /path/to/ukpga-2024-22.ttl
```

The shapes also serve as documentation: each `Shape` declaration lists
the predicates that should appear on a node of that class, with their
expected cardinality.

## Sample SPARQL queries

Live in `queries/`. All assume the standard prefix list at the top of
each file. They run against the invitation-only endpoint at
`https://www.legislation.gov.uk/sparql` -- or against a local
rdflib-endpoint over a materialised slice (see "Materialise locally"
below).

| File | What |
|---|---|
| [`queries/acts-by-keyword.rq`](queries/acts-by-keyword.rq) | Acts whose title matches a keyword |
| [`queries/all-formats-of-act.rq`](queries/all-formats-of-act.rq) | Every manifestation (XML/RDF/HTML/PDF) of one Act |
| [`queries/recent-uksi.rq`](queries/recent-uksi.rq) | Statutory instruments enacted in the last year |
| [`queries/amendments-to-act.rq`](queries/amendments-to-act.rq) | Every Metalex `LegislativeModification` that touches an Act |
| [`queries/sections-of-act.rq`](queries/sections-of-act.rq) | All sections (and their parts/chapters) of a given Act |

## Materialise locally

For sessions without SPARQL credentials, fetch a slice as RDF and
serve it via `rdflib-endpoint`:

```sh
# Pull a hundred Acts + their RDF
python3 skills/tna-legislation/scripts/fetch_rdf.py \
  --feed https://www.legislation.gov.uk/new/ukpga/data.feed \
  --max 100 --out third_party/data/tna_legislation/

# Combine and serve
cat third_party/data/tna_legislation/*.ttl > /tmp/leg.nq
rdflib-endpoint serve --port 8766 /tmp/leg.nq
```

Sample queries from `queries/` then work against `http://127.0.0.1:8766/`.

## Atom feeds

Public, no auth. Every legislation listing has a `.feed` URL.

```
https://www.legislation.gov.uk/new/data.feed          # everything new
https://www.legislation.gov.uk/new/ukpga/data.feed    # new UK Public General Acts
https://www.legislation.gov.uk/new/uksi/data.feed     # new statutory instruments
https://www.legislation.gov.uk/changes/affected/ukpga/data.feed   # Acts affected by recent amendments
```

Each `<entry>` has `<id>` (the canonical URI), `<title>`, `<updated>`,
and `<link>`s to alternate formats.

## Coverage caveats

- **SPARQL endpoint is invitation-only.** Public documentation
  (`legislation.gov.uk/developer/formats`, the
  `legislation.github.io/data-documentation/` site) implies open
  access; the actual server returns 401 with the auth realm
  `"By Invitation Only - Linked Data"`. Email TNA via the contact
  form at https://www.legislation.gov.uk/contact-us to request
  access. Until you have credentials, use the per-URI RDF + local
  materialisation pattern above.
- **EU origin law** is retained only up to 2020-12-31.
- **Wales pre-2011 and Northern Ireland pre-1999** legislation
  is incomplete -- TNA is still digitising historical material.
- **Devolved Acts** (asp, anaw, nia) use the same vocabularies but
  list themselves under different `<type>` slugs; queries that
  hard-code `ukpga` will miss them.

## Data-quality discipline

This skill operates under [`data-quality`](../data-quality/SKILL.md):

- Anchor cases — when adding extraction, smoke-test a known Act
  (`ukpga/2024/22` is a useful one: 141 KB RDF, 1,573 triples,
  9 distinct types).
- Cross-format reconciliation — the same Act's data is available
  as CLML XML, RDF/XML, and HTML. Triples extracted from RDF should
  reconcile against the CLML when both are present.
- Provenance qualifiers — tag triples with their source URI so
  downstream consumers can re-fetch / cite.
- Upstream issues — file at `danbri/forgetmenot` with label
  `upstream` when TNA's published model disagrees with the served
  data (e.g. the docs/auth-realm discrepancy above is one such
  issue).

## See also

- [`docs/provenance.md`](../../docs/provenance.md) -- the naming + tier convention
- [`tna-caselaw`](../tna-caselaw/SKILL.md) -- Find Case Law (Atom + Akoma Ntoso); stub for now
- [`data-quality`](../data-quality/SKILL.md) -- discipline this skill follows
