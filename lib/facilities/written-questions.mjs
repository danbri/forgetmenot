// Written Questions and Statements API.
// Base: https://questions-statements-api.parliament.uk/api
// (Replaces the legacy writtenquestions-api host.)
import { get } from '../http.mjs';

const BASE = 'https://questions-statements-api.parliament.uk/api';

// ---- Written questions ----

export async function searchQuestions(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/writtenquestions/questions`, {
    askingMemberId: opts.askingMemberId ?? opts.memberId,
    house: opts.house,
    members: opts.members,
    party: opts.party,
    answeringBodies: opts.answeringBodies ?? opts.bodyId,
    searchTerm: opts.searchTerm ?? opts.term,
    tabledWhenFrom: opts.tabledWhenFrom ?? opts.from,
    tabledWhenTo: opts.tabledWhenTo ?? opts.to,
    answeredWhenFrom: opts.answeredWhenFrom,
    answeredWhenTo: opts.answeredWhenTo,
    expandMember: opts.expandMember,
    answered: opts.answered,
    correctedOnly: opts.correctedOnly,
    includeWithdrawn: opts.includeWithdrawn,
    withAttachment: opts.withAttachment,
    questionStatus: opts.questionStatus,
    take: opts.take ?? 20,
    skip: opts.skip,
    orderBy: opts.orderBy,
  }, ctx);
  return r.body;
}

export async function getQuestion(id, ctx = {}) {
  const r = await get(`${BASE}/writtenquestions/questions/${encodeURIComponent(id)}`, {}, ctx);
  return r.body;
}

export async function getQuestionByUin(date, uin, ctx = {}) {
  const r = await get(`${BASE}/writtenquestions/questions/${encodeURIComponent(date)}/${encodeURIComponent(uin)}`, {}, ctx);
  return r.body;
}

// ---- Written statements ----

export async function searchStatements(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/writtenstatements/statements`, {
    madeWhenFrom: opts.madeWhenFrom ?? opts.from,
    madeWhenTo: opts.madeWhenTo ?? opts.to,
    searchTerm: opts.searchTerm ?? opts.term,
    house: opts.house,
    madeByMemberId: opts.madeByMemberId ?? opts.memberId,
    makingDepartmentId: opts.makingDepartmentId ?? opts.departmentId,
    take: opts.take ?? 20,
    skip: opts.skip,
    orderBy: opts.orderBy,
  }, ctx);
  return r.body;
}

export async function getStatement(id, ctx = {}) {
  const r = await get(`${BASE}/writtenstatements/statements/${encodeURIComponent(id)}`, {}, ctx);
  return r.body;
}

export async function getStatementByUin(date, uin, ctx = {}) {
  const r = await get(`${BASE}/writtenstatements/statements/${encodeURIComponent(date)}/${encodeURIComponent(uin)}`, {}, ctx);
  return r.body;
}

// ---- Daily reports ----

export async function dailyReports(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/dailyreports/dailyreports`, {
    madeWhenFrom: opts.madeWhenFrom ?? opts.from,
    madeWhenTo: opts.madeWhenTo ?? opts.to,
    take: opts.take ?? 20,
    skip: opts.skip,
    orderBy: opts.orderBy,
  }, ctx);
  return r.body;
}
