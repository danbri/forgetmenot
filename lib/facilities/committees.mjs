// UK Parliament Committees API.
// Base: https://committees-api.parliament.uk/api
import { get, getBytes } from '../http.mjs';

const BASE = 'https://committees-api.parliament.uk/api';

// Spec params: CommitteeBusinessId, SearchTerm, ParentCommitteeId,
// CommitteeStatus, CommitteeTypeId, CommitteeCategory, House,
// CommitteeIds, ShowOnWebsiteOnly, Skip, Take.
// `IsLeadCommittee` and `Source` were sent by older code but neither
// exists in the spec; the API silently dropped them. The
// lead-committee concept lives under `CommitteeCategory` instead.
export async function search(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/Committees`, {
    SearchTerm: opts.searchTerm ?? opts.term,
    CommitteeBusinessId: opts.committeeBusinessId,
    ParentCommitteeId: opts.parentCommitteeId,
    CommitteeStatus: opts.committeeStatus,
    CommitteeTypeId: opts.committeeTypeId,
    CommitteeCategory: opts.committeeCategory,
    House: opts.house,
    CommitteeIds: opts.committeeIds,
    ShowOnWebsiteOnly: opts.showOnWebsiteOnly,
    Skip: opts.skip,
    Take: opts.take ?? 20,
  }, ctx);
  return r.body;
}

export async function getById(id, ctx = {}) {
  const r = await get(`${BASE}/Committees/${encodeURIComponent(id)}`, {}, ctx);
  return r.body;
}

export async function nextEvent(ctx = {}) {
  const r = await get(`${BASE}/Committees/NextEvent`, {}, ctx);
  return r.body;
}

export async function members(id, opts = {}, ctx = {}) {
  const r = await get(`${BASE}/Committees/${encodeURIComponent(id)}/Members`, {
    MembershipStatus: opts.current ? 'Current' : (opts.membershipStatus ?? 'All'),
    ShowOnWebsiteOnly: opts.showOnWebsiteOnly,
    Skip: opts.skip,
    Take: opts.take,
  }, ctx);
  return r.body;
}

export async function staff(id, ctx = {}) {
  const r = await get(`${BASE}/Committees/${encodeURIComponent(id)}/Staff`, {}, ctx);
  return r.body;
}

export async function events(id, ctx = {}) {
  const r = await get(`${BASE}/Committees/${encodeURIComponent(id)}/Events`, {}, ctx);
  return r.body;
}

export async function publications(id, ctx = {}) {
  const r = await get(`${BASE}/Committees/${encodeURIComponent(id)}/Publications/Summary`, {}, ctx);
  return r.body;
}

export async function archivedPublicationLinks(id, ctx = {}) {
  const r = await get(`${BASE}/Committees/${encodeURIComponent(id)}/ArchivedPublicationLinks`, {}, ctx);
  return r.body;
}

// ---- Committee Business (inquiries) ----

// Spec params: SearchTerm, CommitteeId, DateFrom, DateTo,
// BusinessTypeId, Status, CurrentlyAcceptingPetitions,
// CurrentlyAcceptingEvidence, SortOrder, CommitteeBusinessIds,
// ShowOnWebsiteOnly, Skip, Take.
// Older code sent `Type` (use `BusinessTypeId`) and `IncludeArchived`
// (use `Status`); neither name was in the spec.
export async function businessSearch(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/CommitteeBusiness`, {
    SearchTerm: opts.searchTerm ?? opts.term,
    CommitteeId: opts.committeeId,
    DateFrom: opts.dateFrom ?? opts.from,
    DateTo: opts.dateTo ?? opts.to,
    BusinessTypeId: opts.businessTypeId ?? opts.type,
    Status: opts.status,
    CurrentlyAcceptingPetitions: opts.currentlyAcceptingPetitions,
    CurrentlyAcceptingEvidence: opts.currentlyAcceptingEvidence,
    SortOrder: opts.sortOrder,
    CommitteeBusinessIds: opts.committeeBusinessIds,
    ShowOnWebsiteOnly: opts.showOnWebsiteOnly,
    Skip: opts.skip,
    Take: opts.take ?? 20,
  }, ctx);
  return r.body;
}

export async function business(id, ctx = {}) {
  const r = await get(`${BASE}/CommitteeBusiness/${encodeURIComponent(id)}`, {}, ctx);
  return r.body;
}

export async function businessPublications(id, ctx = {}) {
  const r = await get(`${BASE}/CommitteeBusiness/${encodeURIComponent(id)}/Publications/Summary`, {}, ctx);
  return r.body;
}

// ---- Evidence ----

// Spec params: CommitteeBusinessId, CommitteeId, SearchTerm,
// StartDate, EndDate, ShowOnWebsiteOnly, Skip, Take. `Witness` is
// not in the spec — for witness names use `SearchTerm`.
export async function oralEvidenceSearch(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/OralEvidence`, {
    CommitteeBusinessId: opts.committeeBusinessId,
    CommitteeId: opts.committeeId,
    SearchTerm: opts.searchTerm ?? opts.witness ?? opts.term,
    StartDate: opts.startDate ?? opts.from,
    EndDate: opts.endDate ?? opts.to,
    ShowOnWebsiteOnly: opts.showOnWebsiteOnly,
    Skip: opts.skip,
    Take: opts.take ?? 20,
  }, ctx);
  return r.body;
}

export async function oralEvidence(id, ctx = {}) {
  const r = await get(`${BASE}/OralEvidence/${encodeURIComponent(id)}`, {}, ctx);
  return r.body;
}

export async function downloadOralEvidence(id, format = 'Pdf', ctx = {}) {
  return getBytes(`${BASE}/OralEvidence/${encodeURIComponent(id)}/Document/${encodeURIComponent(format)}`, {}, ctx);
}

export async function writtenEvidenceSearch(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/WrittenEvidence`, {
    CommitteeBusinessId: opts.committeeBusinessId,
    CommitteeId: opts.committeeId,
    SearchTerm: opts.searchTerm ?? opts.term,
    StartDate: opts.startDate ?? opts.from,
    EndDate: opts.endDate ?? opts.to,
    ShowOnWebsiteOnly: opts.showOnWebsiteOnly,
    Skip: opts.skip,
    Take: opts.take ?? 20,
  }, ctx);
  return r.body;
}

export async function writtenEvidence(id, ctx = {}) {
  const r = await get(`${BASE}/WrittenEvidence/${encodeURIComponent(id)}`, {}, ctx);
  return r.body;
}

export async function downloadWrittenEvidence(id, format = 'Pdf', ctx = {}) {
  return getBytes(`${BASE}/WrittenEvidence/${encodeURIComponent(id)}/Document/${encodeURIComponent(format)}`, {}, ctx);
}

// ---- Events / meetings ----

export async function eventsList(ctx = {}) {
  const r = await get(`${BASE}/Events`, {}, ctx);
  return r.body;
}

export async function eventActivities(ctx = {}) {
  const r = await get(`${BASE}/Events/Activities`, {}, ctx);
  return r.body;
}

export async function event(id, ctx = {}) {
  const r = await get(`${BASE}/Events/${encodeURIComponent(id)}`, {}, ctx);
  return r.body;
}

export async function eventActivitiesById(id, ctx = {}) {
  const r = await get(`${BASE}/Events/${encodeURIComponent(id)}/Activities`, {}, ctx);
  return r.body;
}

export async function eventAttendance(id, ctx = {}) {
  const r = await get(`${BASE}/Events/${encodeURIComponent(id)}/Attendance`, {}, ctx);
  return r.body;
}

// Spec REQUIRES `FromDate` and `ToDate` (not `StartDate`/`EndDate`).
// Earlier code sent the wrong names, so this endpoint either 400'd
// or returned the unfiltered set depending on server handling.
export async function broadcastMeetings(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/Broadcast/Meetings`, {
    FromDate: opts.fromDate ?? opts.from ?? opts.startDate,
    ToDate: opts.toDate ?? opts.to ?? opts.endDate,
  }, ctx);
  return r.body;
}

// ---- Bill petitions ----

export async function billPetitions(ctx = {}) {
  const r = await get(`${BASE}/BillPetitions`, {}, ctx);
  return r.body;
}

export async function billPetition(id, ctx = {}) {
  const r = await get(`${BASE}/BillPetitions/${encodeURIComponent(id)}`, {}, ctx);
  return r.body;
}

export async function downloadBillPetition(id, format = 'Pdf', ctx = {}) {
  return getBytes(`${BASE}/BillPetitions/${encodeURIComponent(id)}/Document/${encodeURIComponent(format)}`, {}, ctx);
}

// ---- Reference ----

export async function committeeBusinessTypes(ctx = {}) {
  const r = await get(`${BASE}/CommitteeBusinessType`, {}, ctx);
  return r.body;
}

export async function committeeTypes(ctx = {}) {
  const r = await get(`${BASE}/CommitteeType`, {}, ctx);
  return r.body;
}

export async function publicationTypes(ctx = {}) {
  const r = await get(`${BASE}/PublicationType`, {}, ctx);
  return r.body;
}
