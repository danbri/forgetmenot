// Written Questions and Statements API.
// Base: https://questions-statements-api.parliament.uk/api
// (Replaces the legacy writtenquestions-api host.)
import { get } from '../http.mjs';

const BASE = 'https://questions-statements-api.parliament.uk/api';

// ---- Written questions ----

// Spec params: askingMemberId, answeringMemberId, tabledWhenFrom,
// dateForAnswerWhenFrom, dateForAnswerWhenTo, tabledWhenTo, answered,
// answeredWhenFrom, answeredWhenTo, questionStatus, includeWithdrawn,
// expandMember, correctedWhenFrom, correctedWhenTo, sessionStatus,
// searchTerm, uIN, answeringBodies, members, house, skip, take.
// `party`, `withAttachment`, `correctedOnly`, and `orderBy` are NOT
// in the spec — the API silently dropped them.
export async function searchQuestions(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/writtenquestions/questions`, {
    askingMemberId: opts.askingMemberId ?? opts.memberId,
    answeringMemberId: opts.answeringMemberId,
    house: opts.house,
    members: opts.members,
    answeringBodies: opts.answeringBodies ?? opts.bodyId,
    searchTerm: opts.searchTerm ?? opts.term,
    uIN: opts.uIN ?? opts.uin,
    tabledWhenFrom: opts.tabledWhenFrom ?? opts.from,
    tabledWhenTo: opts.tabledWhenTo ?? opts.to,
    dateForAnswerWhenFrom: opts.dateForAnswerWhenFrom,
    dateForAnswerWhenTo: opts.dateForAnswerWhenTo,
    answered: opts.answered,
    answeredWhenFrom: opts.answeredWhenFrom,
    answeredWhenTo: opts.answeredWhenTo,
    correctedWhenFrom: opts.correctedWhenFrom,
    correctedWhenTo: opts.correctedWhenTo,
    sessionStatus: opts.sessionStatus,
    expandMember: opts.expandMember,
    includeWithdrawn: opts.includeWithdrawn,
    questionStatus: opts.questionStatus,
    take: opts.take ?? 20,
    skip: opts.skip,
  }, ctx);
  return r.body;
}

export async function getQuestion(id, opts = {}, ctx = {}) {
  const r = await get(`${BASE}/writtenquestions/questions/${encodeURIComponent(id)}`, {
    expandMember: opts.expandMember,
    sessionStatus: opts.sessionStatus,
  }, ctx);
  return r.body;
}

export async function getQuestionByUin(date, uin, opts = {}, ctx = {}) {
  const r = await get(`${BASE}/writtenquestions/questions/${encodeURIComponent(date)}/${encodeURIComponent(uin)}`, {
    expandMember: opts.expandMember,
    sessionStatus: opts.sessionStatus,
  }, ctx);
  return r.body;
}

// ---- Written statements ----

// Spec params: madeWhenFrom, madeWhenTo, sessionStatus, searchTerm,
// uIN, answeringBodies, members, house, skip, take, expandMember.
// `madeByMemberId`, `makingDepartmentId`, and `orderBy` are not in
// the spec; member filtering uses `members` (array of memberIds).
export async function searchStatements(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/writtenstatements/statements`, {
    madeWhenFrom: opts.madeWhenFrom ?? opts.from,
    madeWhenTo: opts.madeWhenTo ?? opts.to,
    searchTerm: opts.searchTerm ?? opts.term,
    uIN: opts.uIN ?? opts.uin,
    answeringBodies: opts.answeringBodies ?? opts.bodyId,
    members: opts.members ?? opts.madeByMemberId ?? opts.memberId,
    sessionStatus: opts.sessionStatus,
    house: opts.house,
    expandMember: opts.expandMember,
    take: opts.take ?? 20,
    skip: opts.skip,
  }, ctx);
  return r.body;
}

export async function getStatement(id, opts = {}, ctx = {}) {
  const r = await get(`${BASE}/writtenstatements/statements/${encodeURIComponent(id)}`, {
    expandMember: opts.expandMember,
    sessionStatus: opts.sessionStatus,
  }, ctx);
  return r.body;
}

export async function getStatementByUin(date, uin, opts = {}, ctx = {}) {
  const r = await get(`${BASE}/writtenstatements/statements/${encodeURIComponent(date)}/${encodeURIComponent(uin)}`, {
    expandMember: opts.expandMember,
    sessionStatus: opts.sessionStatus,
  }, ctx);
  return r.body;
}

// ---- Daily reports ----

// Spec params: dateFrom, dateTo, house, skip, take.
// Older code sent `madeWhenFrom/madeWhenTo` and `orderBy` — neither
// is in the spec; the date filters were silently dropped, so daily
// reports came back unfiltered.
export async function dailyReports(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/dailyreports/dailyreports`, {
    dateFrom: opts.dateFrom ?? opts.madeWhenFrom ?? opts.from,
    dateTo: opts.dateTo ?? opts.madeWhenTo ?? opts.to,
    house: opts.house,
    take: opts.take ?? 20,
    skip: opts.skip,
  }, ctx);
  return r.body;
}
