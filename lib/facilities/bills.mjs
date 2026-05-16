// UK Parliament Bills API.
// Base: https://bills-api.parliament.uk/api/v1
import { get, getBytes } from '../http.mjs';

const BASE = 'https://bills-api.parliament.uk/api/v1';

// Spec params: SearchTerm, Session, CurrentHouse, OriginatingHouse,
// MemberId, DepartmentId, BillStage (array), BillStagesExcluded (array),
// IsDefeated, IsWithdrawn, BillType (array), SortOrder, BillIds (array),
// IsInAmendableStage, Skip, Take.
//
// Older versions of this library sent `Department`, `Type`, and
// `IsAct` — none of which exist in the spec. The API silently
// dropped them.
export async function search(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/Bills`, {
    SearchTerm: opts.searchTerm ?? opts.term,
    Session: opts.session,
    MemberId: opts.memberId,
    DepartmentId: opts.departmentId ?? opts.department,
    BillStage: opts.billStage,
    BillStagesExcluded: opts.billStagesExcluded,
    CurrentHouse: opts.currentHouse ?? opts.house,
    OriginatingHouse: opts.originatingHouse,
    IsDefeated: opts.isDefeated,
    IsWithdrawn: opts.isWithdrawn,
    BillType: opts.billType ?? opts.type,
    BillIds: opts.billIds,
    IsInAmendableStage: opts.isInAmendableStage,
    SortOrder: opts.sortOrder,
    Skip: opts.skip,
    Take: opts.take ?? 20,
    ...opts.query,
  }, ctx);
  return r.body;
}

export async function getById(billId, ctx = {}) {
  const r = await get(`${BASE}/Bills/${encodeURIComponent(billId)}`, {}, ctx);
  return r.body;
}

export async function newsArticles(billId, ctx = {}) {
  const r = await get(`${BASE}/Bills/${encodeURIComponent(billId)}/NewsArticles`, {}, ctx);
  return r.body;
}

export async function stages(billId, ctx = {}) {
  const r = await get(`${BASE}/Bills/${encodeURIComponent(billId)}/Stages`, {}, ctx);
  return r.body;
}

export async function stage(billId, stageId, ctx = {}) {
  const r = await get(`${BASE}/Bills/${encodeURIComponent(billId)}/Stages/${encodeURIComponent(stageId)}`, {}, ctx);
  return r.body;
}

// Spec params: SearchTerm, AmendmentNumber, Decision, MemberId, Skip,
// Take. `MemberSearchTerm` was sent by older code but is not in the
// spec; the API silently dropped it. The closest match is the
// instrument-wide `SearchTerm`.
export async function amendments(billId, stageId, opts = {}, ctx = {}) {
  const r = await get(`${BASE}/Bills/${encodeURIComponent(billId)}/Stages/${encodeURIComponent(stageId)}/Amendments`, {
    SearchTerm: opts.searchTerm ?? opts.term,
    AmendmentNumber: opts.amendmentNumber,
    Decision: opts.decision,
    MemberId: opts.memberId,
    Skip: opts.skip,
    Take: opts.take ?? 20,
  }, ctx);
  return r.body;
}

export async function amendment(billId, stageId, amendmentId, ctx = {}) {
  const r = await get(`${BASE}/Bills/${encodeURIComponent(billId)}/Stages/${encodeURIComponent(stageId)}/Amendments/${encodeURIComponent(amendmentId)}`, {}, ctx);
  return r.body;
}

export async function pingPongItems(billId, stageId, ctx = {}) {
  const r = await get(`${BASE}/Bills/${encodeURIComponent(billId)}/Stages/${encodeURIComponent(stageId)}/PingPongItems`, {}, ctx);
  return r.body;
}

export async function pingPongItem(billId, stageId, itemId, ctx = {}) {
  const r = await get(`${BASE}/Bills/${encodeURIComponent(billId)}/Stages/${encodeURIComponent(stageId)}/PingPongItems/${encodeURIComponent(itemId)}`, {}, ctx);
  return r.body;
}

export async function publications(billId, ctx = {}) {
  const r = await get(`${BASE}/Bills/${encodeURIComponent(billId)}/Publications`, {}, ctx);
  return r.body;
}

export async function stagePublications(billId, stageId, ctx = {}) {
  const r = await get(`${BASE}/Bills/${encodeURIComponent(billId)}/Stages/${encodeURIComponent(stageId)}/Publications`, {}, ctx);
  return r.body;
}

export async function document(publicationId, documentId, ctx = {}) {
  const r = await get(`${BASE}/Publications/${encodeURIComponent(publicationId)}/Documents/${encodeURIComponent(documentId)}`, {}, ctx);
  return r.body;
}

export async function downloadDocument(publicationId, documentId, ctx = {}) {
  return getBytes(`${BASE}/Publications/${encodeURIComponent(publicationId)}/Documents/${encodeURIComponent(documentId)}/Download`, {}, ctx);
}

export async function rss(kind = 'all', billId, ctx = {}) {
  let path;
  if (billId) path = `/Rss/Bills/${encodeURIComponent(billId)}.rss`;
  else if (kind === 'public') path = `/Rss/publicbills.rss`;
  else if (kind === 'private') path = `/Rss/privatebills.rss`;
  else path = `/Rss/allbills.rss`;
  const r = await get(`${BASE}${path}`, {}, { ...ctx, accept: 'application/rss+xml, application/xml, text/xml' });
  return r.body;
}

export async function billTypes(ctx = {}) {
  const r = await get(`${BASE}/BillTypes`, {}, ctx);
  return r.body;
}

export async function stageTypes(ctx = {}) {
  const r = await get(`${BASE}/Stages`, {}, ctx);
  return r.body;
}

export async function publicationTypes(ctx = {}) {
  const r = await get(`${BASE}/PublicationTypes`, {}, ctx);
  return r.body;
}

export async function sittings(ctx = {}) {
  const r = await get(`${BASE}/Sittings`, {}, ctx);
  return r.body;
}
