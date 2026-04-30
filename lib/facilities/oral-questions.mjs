// Oral Questions and Early Day Motions API.
// Base: https://oralquestionsandmotions-api.parliament.uk
// Quirk: parameters under `parameters.<name>` prefix.
import { get } from '../http.mjs';

const BASE = 'https://oralquestionsandmotions-api.parliament.uk';

const pp = (obj) => {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) {
      // Repeated parameter (e.g. tablingMemberIds)
      for (const item of v) out[`parameters.${k}`] = item;
      // The above loses repeats — rebuild as URLSearchParams-friendly array.
    } else {
      out[`parameters.${k}`] = v;
    }
  }
  return out;
};

// Oral questions
export async function oralQuestions(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/oralquestions/list`, pp({
    answeringDateStart: opts.answeringDateStart ?? opts.from,
    answeringDateEnd: opts.answeringDateEnd ?? opts.to,
    tablingMemberIds: opts.tablingMemberIds ?? opts.memberId,
    answeringBodyIds: opts.answeringBodyIds ?? opts.bodyId,
    searchTerm: opts.searchTerm ?? opts.term,
    expandMember: opts.expandMember,
    formerMember: opts.formerMember,
    skip: opts.skip,
    take: opts.take ?? 25,
  }), ctx);
  return r.body;
}

// Oral question times (slots)
export async function oralQuestionTimes(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/oralquestiontimes/list`, pp({
    answeringDateStart: opts.answeringDateStart ?? opts.from,
    answeringDateEnd: opts.answeringDateEnd ?? opts.to,
    skip: opts.skip,
    take: opts.take ?? 25,
  }), ctx);
  return r.body;
}

// Early Day Motions
export async function edms(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/EarlyDayMotions/list`, pp({
    searchTerm: opts.searchTerm ?? opts.term,
    statuses: opts.statuses,
    tablingMemberIds: opts.tablingMemberIds ?? opts.memberId,
    dateTabledStart: opts.dateTabledStart ?? opts.from,
    dateTabledEnd: opts.dateTabledEnd ?? opts.to,
    takenInTheChamber: opts.takenInTheChamber,
    skip: opts.skip,
    take: opts.take ?? 25,
  }), ctx);
  return r.body;
}

export async function edm(id, ctx = {}) {
  const r = await get(`${BASE}/EarlyDayMotion/${encodeURIComponent(id)}`, {}, ctx);
  return r.body;
}
