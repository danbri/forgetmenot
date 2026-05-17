---
name: tna-caselaw
description: Find Case Law -- TNA's open service for judgments and decisions of UK courts and tribunals at caselaw.nationalarchives.gov.uk. Distributed as LegalDocML / Akoma Ntoso XML with Atom feeds and a public search API. SKILL STUB -- see notes below; full crawler/extractor is the next bite.
license: Open Justice Licence (judgments) / OGL v3.0 (TNA wrapping); skill text MIT.
metadata:
  provenance-policy: docs/provenance.md
  provenance:
    tier: 3
    operator: "The National Archives (TNA)"
    service: caselaw.nationalarchives.gov.uk
    upstream-data: "Court and tribunal judgments as LegalDocML (Akoma Ntoso) XML, Atom feeds, OAI-PMH"
    citation-short: "Find Case Law (TNA)"
    citation-formal: "Find Case Law, The National Archives, retrieved {date} under the Open Justice Licence"
    confidence: derived
    confidence-notes: "Stub. No code yet. Find Case Law is published as structured XML so extraction can target Akoma Ntoso elements directly; this skill will document the shape, sample queries (XPath / SPARQL after RDF lifting), and ShEx shapes once implemented."
---

# `tna-caselaw` — Find Case Law

**Stub.** TNA's Find Case Law publishes judgments from the High Court,
Court of Appeal, Supreme Court, Upper Tribunal, and a growing set of
First-tier Tribunals as LegalDocML (Akoma Ntoso) XML at
[`caselaw.nationalarchives.gov.uk`](https://caselaw.nationalarchives.gov.uk).

The data plane is rich and structured (Akoma Ntoso is a global standard
for legal documents); the crawler/extractor is not yet built. Tracked
in `docs/provenance.md` under tier-3 third-party facilities.

## What's intended

- Atom feed discovery (judgments published per day)
- Public search API at `https://caselaw.nationalarchives.gov.uk/judgments/search`
- Akoma Ntoso XML per judgment via content negotiation
- Lift to RDF using the LegalDocML→RDF conventions
- ShEx shapes for the document model
- Local SPARQL materialisation pattern (same as `tna-legislation`)

## See also

- [`tna-legislation`](../tna-legislation/SKILL.md) — sibling skill, fully built
- [`data-quality`](../data-quality/SKILL.md) — discipline to follow when building
- [Akoma Ntoso 1.0 spec](http://docs.oasis-open.org/legaldocml/akn-core/v1.0/)
- [Find Case Law API docs](https://nationalarchives.github.io/ds-find-caselaw-docs/)
