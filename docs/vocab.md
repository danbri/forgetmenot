# forgetmenot vocabulary (`fm:`)

URI: `https://forgetmenot.local/vocab#`

Used as the `fm:` prefix throughout the repo's RDF outputs. **All classes
and predicates this project invents go here.** External namespaces
(`schema:`, `dcterms:`, `owl:`, `rdf:`, `rdfs:`, `xsd:`, `parl:`, `wd:`)
stay external; vendor namespaces (`govuk:`) are reserved for attribute
names a third party actually publishes.

## Rule

> Never invent a predicate or class under a third party's namespace.

If we invent it, it's `fm:X`. If gov.uk publishes a `<meta
name="govuk:X">` and we lift that value into a triple, the predicate
can be `govuk:X` because we're mirroring an attribute name they
literally use. If we model "this Act has these sections" without that
mirroring, it's `fm:hasSection` — never `tna:hasSection`,
`legislation:hasSection`, or similar.

## Reserved external namespaces (the only `govuk:` we use)

| Prefix | URI | Reason |
|---|---|---|
| `govuk:` | `https://www.gov.uk/vocab/meta#` | Mirrors `<meta name="govuk:*">` attributes literally emitted by gov.uk's publishing-app. **We do not invent under this namespace.** Currently used for: `govuk:contentId`, `govuk:schemaName`, `govuk:publishingApp`. |
| `parl:` | `https://id.parliament.uk/schema/` | Parliament's own identifier scheme; we add `parl:memberId` and `parl:treatyId` bridge predicates here because they reference Parliament's stable IDs verbatim. |
| `wd:`   | `http://www.wikidata.org/entity/` | Wikidata entity URIs. |
| `schema:` | `http://schema.org/` | Standard schema.org. |
| `dcterms:`/`dct:` | `http://purl.org/dc/terms/` | Dublin Core. |
| `owl:`, `rdfs:`, `rdf:`, `xsd:` | as standard | The usual ontology infrastructure. |

## fm: classes (incomplete catalogue — keep updating)

| Class | Used by | Description |
|---|---|---|
| `fm:MinisterialRole` | gov.uk org-chart | A UK ministerial role with a definable holder |
| `fm:Organisation` | gov.uk org-chart | A UK government organisation (department, agency, NDPB, ...) |
| `fm:RoleTenure` | gov.uk org-chart, fcdo | Reified blank node: (holder, role, start, end), plus provenance flags |
| `fm:CurrentOfficeHolder` | gov.uk org-chart | Person currently in a ministerial role (per the Content API `current=true` flag) |
| `fm:FormerOfficeHolder` | gov.uk org-chart | Inverse |
| `fm:PastPrimeMinister` | gov.uk org-chart | Past PM (anchor for the past-PMs index) |
| `fm:Treaty` | fcdo treaties | A UK treaty record at UKTO |

## fm: relations

### gov.uk org-chart
- `fm:hasMinister`, `fm:hasManager`, `fm:hasRole`, `fm:roleHolder`,
  `fm:holdsRole`, `fm:previouslyHeldBy`, `fm:previouslyHeldRole`,
  `fm:partOf`, `fm:affiliatedWith`, `fm:currentRoleTitle`,
  `fm:tenureStart`, `fm:tenureEnd`, `fm:role`, `fm:holder`,
  `fm:party`, `fm:responsibility`

### fcdo treaties
- `fm:uktoId`, `fm:uktoUuid`, `fm:signedDate`, `fm:signedDateText`,
  `fm:signedPlace`, `fm:entryIntoForceDate`, `fm:reference`,
  `fm:subject`, `fm:kind`, `fm:partyAction`, `fm:country`,
  `fm:countryQid`, `fm:action`, `fm:actionDate`, `fm:effectiveDate`,
  `fm:capturedAt`, `fm:commandPaper`

### Provenance flags
- `fm:apiSourced` (`true`) — triple read from the source's own
  structured API (e.g. gov.uk `/api/content/`)
- `fm:proseExtracted` (`true`) — triple read from biography prose
  via regex templates; lower confidence

When two extractors over the same source both emit the same (s, p, o),
they appear in the rolled-up `.nq` with their respective provenance
flags — the [`data-quality`](../skills/data-quality/SKILL.md) skill
prescribes cross-checking those.

## Named-graph conventions

The N-Quads files in `extractors/factoids/all.nq` use **one named
graph per source URL** so the file itself answers "which page is this
fact from?" The graph URI is the upstream page URL (gov.uk URL, UKTO
treaty record URL, ...).

### Raw source text → separate named graph

If we ever store the raw source text alongside extracted triples
(for LLM verification, human review, audit), it goes in a **separate
named graph**, never inline in the same graph as the structured
triples. Convention:

```
<{source-url}>       fm:title "..." ; ... ; fm:tenureStart "..." .
                         # ↑ in graph <{source-url}> (the extracted facts)

<{source-url}>       fm:rawHtml  "..."@en .
<{source-url}>       fm:rawJson  "..." .
                         # ↑ in graph <{source-url}#raw> (the source text)
```

Rationale: raw text is large, slows every query that doesn't need it,
and conflating "what we extracted" with "what the page said" makes
the corpus unauditable — a consumer can't tell whether a triple is
an extraction or a verbatim quote. Separate graphs keep both queryable
but loadable on demand.

This convention is not yet emitted by the extractors. When raw-text
capture is added, the graph URI suffix `#raw` (or a parallel host
like `https://forgetmenot.local/raw/<encoded-url>`) is reserved.

## Per-corpus vocab declarations

Each extractor that emits `fm:` triples ships a Turtle file alongside
its output that formally declares (`rdfs:Class`, `rdf:Property`,
`rdfs:domain`, `rdfs:range`, `rdfs:label`, `rdfs:comment`) every term
it uses. Currently:

- [`third_party/data/fcdo_treaties/extractors/factoids/fm-vocab.ttl`](../third_party/data/fcdo_treaties/extractors/factoids/fm-vocab.ttl)
  — the FCDO treaty lift's subset. Kept in sync with the script by
  [`scripts/fcdo_treaties_vocab_check.py`](../scripts/fcdo_treaties_vocab_check.py),
  which diffs declared terms against the script's emitted terms.

When a new extractor is added or an existing one grows a new term,
the matching declaration goes in the per-corpus vocab file in the
same commit. A future consolidated `vocab/fm.ttl` could union them.

## Stability

`fm:` URIs are stable across this repo's lifetime — they don't change
between commits. The vocabulary is **non-resolvable** today (it doesn't
host an ontology document at the namespace URI); the per-corpus
declarations above are the closest substitute.

Until then, treat `fm:` as a project-internal vocabulary: stable to
us, opaque to outsiders. Don't put `fm:` triples in datasets meant
for external consumption without first resolving the vocabulary to
something published.
