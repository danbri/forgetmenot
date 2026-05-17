// Northern Ireland Assembly Open Data.
// Base: http://data.niassembly.gov.uk
//
// Tier-3 third-party. Operator: Northern Ireland Assembly.
// OGL v3.0. Free, no auth.
//
// Six ASMX services (members, hansard, committees, questions,
// organisations, plenary). Each service exposes operations in both
// SOAP and HTTP-GET form. We use the _JSON variants where available
// (return JSON wrapped in a <string> XML envelope; we unwrap), and
// fall back to the raw XML form otherwise.
//
// First-party to the NI Assembly; tier-3 from a Westminster perspective.
import { get } from '../http.mjs';

const BASE = 'http://data.niassembly.gov.uk';

function dropEmpty(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    out[k] = v;
  }
  return out;
}

// Call a _JSON operation on a given ASMX service. Returns parsed JSON
// (unwrapped from the ASMX <string>...</string> envelope).
async function jsonOp(service, op, params = {}, ctx = {}) {
  const r = await get(`${BASE}/${service}.asmx/${op}_JSON`, dropEmpty(params),
    { ...ctx, accept: 'application/json, text/json, text/xml, */*' });
  // Some _JSON ops return raw JSON (http layer parses to object); others
  // wrap it in an XML <string>{...}</string> envelope (returned as string).
  if (r.body && typeof r.body === 'object') return r.body;
  const text = String(r.body ?? '');
  const m = text.match(/>(\{[\s\S]*\}|\[[\s\S]*\])</);
  if (m) {
    try { return JSON.parse(m[1]); } catch { /* fall through */ }
  }
  try { return JSON.parse(text); } catch { return { _rawXml: text }; }
}

// ---- Members service ----
export async function members(ctx = {}) { return jsonOp('members', 'GetAllMembers', {}, ctx); }
export async function currentMembers(ctx = {}) { return jsonOp('members', 'GetAllCurrentMembers', {}, ctx); }
export async function membersByDate(date, ctx = {}) {
  return jsonOp('members', 'GetAllMembersByGivenDate', { dateString: date }, ctx);
}
export async function membersByConstituency(constituencyId, ctx = {}) {
  return jsonOp('members', 'GetAllCurrentMembersByGivenConstituencyId', { ConstituencyId: constituencyId }, ctx);
}
export async function membersByParty(partyId, ctx = {}) {
  return jsonOp('members', 'GetAllCurrentMembersByGivenPartyId', { PartyId: partyId }, ctx);
}
export async function membersBySurname(surname, ctx = {}) {
  return jsonOp('members', 'GetAllCurrentMembersBySurnameSearch', { Surname: surname }, ctx);
}
export async function memberContactDetails(ctx = {}) {
  return jsonOp('members', 'GetAllMemberContactDetails', {}, ctx);
}
export async function memberContactByPersonId(personId, ctx = {}) {
  return jsonOp('members', 'GetMemberContactDetailsByPersonId', { personId }, ctx);
}
export async function memberRoles(ctx = {}) { return jsonOp('members', 'GetAllMemberRoles', {}, ctx); }
export async function memberRolesByPersonId(personId, ctx = {}) {
  return jsonOp('members', 'GetMemberRolesByPersonId', { personId }, ctx);
}
export async function constituencies(ctx = {}) {
  return jsonOp('members', 'GetAllConstituencies', {}, ctx);
}

// ---- Hansard service ----
export async function hansardReports(ctx = {}) {
  return jsonOp('hansard', 'GetAllHansardReports', {}, ctx);
}
export async function hansardComponentsByDate(date, ctx = {}) {
  return jsonOp('hansard', 'GetHansardComponentsByPlenaryDate', { plenaryDate: date }, ctx);
}
export async function hansardComponentsByReport(reportId, ctx = {}) {
  return jsonOp('hansard', 'GetHansardComponentsByReportId', { reportId }, ctx);
}
export async function hansardComponentsByReportAndPerson(reportId, personId, ctx = {}) {
  return jsonOp('hansard', 'GetHansardComponentsByReportIdAndPersonId', { reportId, personId }, ctx);
}

// ---- Questions service ----
export async function questionDetails(questionId, ctx = {}) {
  return jsonOp('questions', 'GetQuestionDetails', { QuestionId: questionId }, ctx);
}
export async function questionsByDepartment(departmentId, ctx = {}) {
  return jsonOp('questions', 'GetQuestionsByDepartment', { DepartmentId: departmentId }, ctx);
}
export async function questionsByMember(personId, ctx = {}) {
  return jsonOp('questions', 'GetQuestionsByMember', { PersonId: personId }, ctx);
}
export async function questionsBySearch(searchText, ctx = {}) {
  return jsonOp('questions', 'GetQuestionsBySearchText', { searchText }, ctx);
}

// ---- Organisations service ----
export async function partyGroups(ctx = {}) {
  return jsonOp('organisations', 'GetAllPartyGroupsListCurrent', {}, ctx);
}
export async function departments(ctx = {}) {
  return jsonOp('organisations', 'GetDepartmentListCurrent', {}, ctx);
}
export async function organisations(ctx = {}) {
  return jsonOp('organisations', 'GetOrganisationListCurrent', {}, ctx);
}
export async function parties(ctx = {}) {
  return jsonOp('organisations', 'GetPartiesListCurrent', {}, ctx);
}

// ---- Plenary service ----
export async function businessDiary(fromDate, toDate, ctx = {}) {
  return jsonOp('plenary', 'GetBusinessDiary',
    { fromDate, toDate }, ctx);
}
export async function divisionResult(divisionId, ctx = {}) {
  return jsonOp('plenary', 'GetDivisionResult', { divisionId }, ctx);
}
export async function divisionMemberVoting(divisionId, ctx = {}) {
  return jsonOp('plenary', 'GetDivisionMemberVoting', { divisionId }, ctx);
}
export async function motionAmendments(motionId, ctx = {}) {
  return jsonOp('plenary', 'GetMotionAmendments', { motionId }, ctx);
}
export async function motionPetitionOfConcern(motionId, ctx = {}) {
  return jsonOp('plenary', 'GetMotionPetitionOfConcern', { motionId }, ctx);
}
export async function noDayNamedMotions(ctx = {}) {
  return jsonOp('plenary', 'GetNoDayNamedMotions', {}, ctx);
}
export async function plenaryAddressees(plenaryDate, ctx = {}) {
  return jsonOp('plenary', 'GetPlenaryAddressees', { plenaryDate }, ctx);
}
