// Oral Questions and Early Day Motions API.
// Base: https://oralquestionsandmotions-api.parliament.uk
//
// Quirk: parameters are nested under a `parameters.<name>` prefix.
//
// Spec: _specs/oralquestions.json. The supported filter sets per
// endpoint are listed inline below. Earlier versions of this library
// sent several names that aren't in the spec — `tablingMemberIds`,
// `searchTerm`, `expandMember`, `formerMember` on `/oralquestions/list`
// (use `askingMemberIds`); and `tablingMemberIds`,
// `dateTabledStart/End`, `takenInTheChamber` on `/EarlyDayMotions/list`
// (use `memberId`, `tabledStartDate/EndDate`). All silently dropped.
import { rawFetch } from '../http.mjs';

const BASE = 'https://oralquestionsandmotions-api.parliament.uk';

// Build a parameters.* search-params object. Arrays produce REPEATED
// keys (the spec marks array params as `style: form, explode: true`),
// which the older `pp()` helper silently collapsed to the last value.
function pp(obj) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    const key = `parameters.${k}`;
    if (Array.isArray(v)) {
      for (const item of v) {
        if (item === undefined || item === null || item === '') continue;
        u.append(key, String(item));
      }
    } else {
      u.append(key, String(v));
    }
  }
  return u;
}

async function fetchWith(url, search, ctx) {
  const full = search.toString() ? `${url}?${search.toString()}` : url;
  const r = await rawFetch(full, { method: 'GET' }, ctx);
  return r.body;
}

// Oral questions — spec params: answeringDateStart, answeringDateEnd,
// questionType, oralQuestionTimeId, statuses, askingMemberIds, uINs,
// answeringBodyIds, skip, take.
export async function oralQuestions(opts = {}, ctx = {}) {
  const u = pp({
    answeringDateStart: opts.answeringDateStart ?? opts.from,
    answeringDateEnd: opts.answeringDateEnd ?? opts.to,
    questionType: opts.questionType,
    oralQuestionTimeId: opts.oralQuestionTimeId,
    statuses: opts.statuses,
    askingMemberIds: opts.askingMemberIds ?? opts.tablingMemberIds ?? opts.memberId,
    uINs: opts.uINs ?? opts.uins,
    answeringBodyIds: opts.answeringBodyIds ?? opts.bodyId,
    skip: opts.skip,
    take: opts.take ?? 25,
  });
  return fetchWith(`${BASE}/oralquestions/list`, u, ctx);
}

// Oral question times (slots) — spec params: deadlineDateStart,
// deadlineDateEnd, oralQuestionTimeId, answeringBodyIds.
export async function oralQuestionTimes(opts = {}, ctx = {}) {
  const u = pp({
    deadlineDateStart: opts.deadlineDateStart ?? opts.from,
    deadlineDateEnd: opts.deadlineDateEnd ?? opts.to,
    oralQuestionTimeId: opts.oralQuestionTimeId,
    answeringBodyIds: opts.answeringBodyIds ?? opts.bodyId,
  });
  return fetchWith(`${BASE}/oralquestiontimes/list`, u, ctx);
}

// EDMs — spec params: edmIds, uINWithAmendmentSuffix, searchTerm,
// currentStatusDateStart, currentStatusDateEnd, isPrayer, memberId,
// includeSponsoredByMember, tabledStartDate, tabledEndDate, statuses,
// orderBy, skip, take.
export async function edms(opts = {}, ctx = {}) {
  const u = pp({
    edmIds: opts.edmIds,
    uINWithAmendmentSuffix: opts.uINWithAmendmentSuffix,
    searchTerm: opts.searchTerm ?? opts.term,
    currentStatusDateStart: opts.currentStatusDateStart,
    currentStatusDateEnd: opts.currentStatusDateEnd,
    isPrayer: opts.isPrayer,
    memberId: opts.memberId ?? opts.tablingMemberIds,
    includeSponsoredByMember: opts.includeSponsoredByMember,
    tabledStartDate: opts.tabledStartDate ?? opts.dateTabledStart ?? opts.from,
    tabledEndDate: opts.tabledEndDate ?? opts.dateTabledEnd ?? opts.to,
    statuses: opts.statuses,
    orderBy: opts.orderBy,
    skip: opts.skip,
    take: opts.take ?? 25,
  });
  return fetchWith(`${BASE}/EarlyDayMotions/list`, u, ctx);
}

export async function edm(id, ctx = {}) {
  const r = await rawFetch(`${BASE}/EarlyDayMotion/${encodeURIComponent(id)}`, { method: 'GET' }, ctx);
  return r.body;
}
