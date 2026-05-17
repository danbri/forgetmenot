// Senedd Cymru (Welsh Parliament) — Microsoft ModernGov SOAP service.
// Base: https://business.senedd.wales/mgWebService.asmx
//
// Tier-3 third-party. Operator: Senedd Cymru. Welsh public-sector
// licensing (OGL-equivalent).
//
// STUB. The ModernGov ASMX service does NOT accept HTTP GET on its
// operations (returns HTTP 500 / "Web Service method name is not
// valid"). A full wrap needs proper SOAP envelope POSTs to each
// operation; we have not yet built that helper.
//
// Operations available per the WSDL include: CheckComms,
// GetAllMeetingsByDate, GetAttachment, GetAttachmentByPath, plus
// committee / motion / member-detail operations. WSDL at
// `https://business.senedd.wales/mgWebService.asmx?WSDL`.
//
// When implementing: ModernGov SOAP envelopes follow the pattern
//   POST /mgWebService.asmx HTTP/1.1
//   Content-Type: text/xml; charset=utf-8
//   SOAPAction: "<targetNamespace>/<operation>"
//   <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
//     <soap:Body>
//       <Operation xmlns="<targetNamespace>">
//         <param1>value</param1>
//       </Operation>
//     </soap:Body>
//   </soap:Envelope>
// Then parse <OperationResponse><OperationResult>…</OperationResult></OperationResponse>
// out of the XML response. lib/http.mjs's rawFetch can do the POST;
// we'd want a small `lib/soap.mjs` helper to construct + parse the
// envelope.
import { get } from '../http.mjs';

const BASE = 'https://business.senedd.wales/mgWebService.asmx';

// Fetch the WSDL — the only thing that works without SOAP envelopes.
// Useful for discovery while a full client is built.
export async function wsdl(ctx = {}) {
  const r = await get(`${BASE}?WSDL`, {},
    { ...ctx, accept: 'text/xml, application/xml, */*' });
  return r.body;
}

// Stable URL of the WSDL (no fetch).
export function wsdlUrl() {
  return `${BASE}?WSDL`;
}
