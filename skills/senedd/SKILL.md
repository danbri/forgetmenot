---
name: senedd
description: "STUB — Query Senedd Cymru (Welsh Parliament) Open Data. The official endpoint at business.senedd.wales/mgWebService.asmx is a Microsoft ModernGov SOAP service. We have not yet built a SOAP client — operations return HTTP 500 to plain GET requests. This stub exposes WSDL fetching for discovery; a full wrap needs proper SOAP envelope POSTs (see WSDL for operation list). First-party to Senedd Cymru; tier-3 from a Westminster perspective. Pairs with sp (Scottish Parliament) and nia (NI Assembly) for cross-devolved research."
license: Open Government Licence v3.0 (Crown copyright; Senedd Cymru)
metadata:
  facility: senedd
  cli-alias: senedd
  base-url: https://business.senedd.wales/mgWebService.asmx
  provenance:
    tier: 3
    operator: Senedd Cymru (Welsh Parliament)
    service: business.senedd.wales/mgWebService.asmx
    upstream-data: "Welsh Parliament procedural data via Microsoft ModernGov ASMX SOAP service"
    citation-short: "via Senedd Cymru ModernGov"
    citation-formal: "Senedd Cymru ModernGov Open Data service, retrieved {date}, OGL v3.0"
    confidence: derived
    confidence-notes: "STUB. The service is SOAP-only — HTTP GET on each operation returns 500. A proper wrap needs a small SOAP envelope helper; deferred."
---

# Senedd Cymru — STUB

Base URL: `https://business.senedd.wales/mgWebService.asmx`. WSDL at
`?WSDL`.

## What works today

```sh
parl senedd wsdl                                 # full WSDL for discovery
parl senedd wsdl-url                             # WSDL URL only
```

## What doesn't (yet)

Every actual operation needs a SOAP envelope POST. The ASMX service
rejects plain GET requests with HTTP 500 ("Web Service method name
is not valid"). Operations listed in the WSDL include:

- `CheckComms` (health check)
- `GetAllMeetingsByDate(dateString)`
- `GetAttachment(documentId)`
- `GetAttachmentByPath(path)`
- ...and committee / motion / member-detail operations

To build the wrap: implement a tiny `lib/soap.mjs` helper that
constructs the SOAP envelope, POSTs with `Content-Type: text/xml;
charset=utf-8` and a `SOAPAction` header, then parses the
`<OperationResponse><OperationResult>...</OperationResult></OperationResponse>`
out of the response. Then wire each operation through it.

## Joins to Parliament

- Cross-devolved Members research: an MP may have been an MS (or
  vice versa) — use Wikidata QIDs as the bridge.
- Westminster legislation often interacts with Welsh Parliament
  (e.g. the Internal Market Act 2020) — pair with `bills` /
  `hansard`.

## Provenance to cite

**Tier 3 — third-party (Senedd Cymru), authoritative for Welsh
Parliament data when the SOAP wrap is built.**

- Until built: cite WSDL inspection only.
- See [`../../docs/provenance.md`](../../docs/provenance.md).
