// Register of Members' Financial Interests API.
// Base: https://interests-api.parliament.uk/api/v1
//
// Spec: _specs/interests.json. The `/api/v1/Interests` endpoint
// accepts only the following filters per the OpenAPI document:
//   MemberId, CategoryId, PublishedFrom, PublishedTo, RegisteredFrom,
//   RegisteredTo, UpdatedFrom, UpdatedTo, RegisterId,
//   ExpandChildInterests, Take, Skip, SortOrder.
// Older versions of this library exposed `IsCorrection`,
// `IsPublished`, `CreatedFrom/To`, `AmendedFrom/To`, `DeletedFrom/To`,
// `RegistrationDateFrom/To`, and `OrderByDate` — none of which are
// in the spec; the API silently dropped them, so most date-window
// searches returned the unfiltered set.
import { get, getBytes } from '../http.mjs';

const BASE = 'https://interests-api.parliament.uk/api/v1';

export async function search(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/Interests`, {
    MemberId: opts.memberId,
    CategoryId: opts.categoryId,
    RegisterId: opts.registerId,
    PublishedFrom: opts.publishedFrom ?? opts.from,
    PublishedTo: opts.publishedTo ?? opts.to,
    RegisteredFrom: opts.registeredFrom ?? opts.registrationDateFrom,
    RegisteredTo: opts.registeredTo ?? opts.registrationDateTo,
    UpdatedFrom: opts.updatedFrom ?? opts.amendedFrom,
    UpdatedTo: opts.updatedTo ?? opts.amendedTo,
    ExpandChildInterests: opts.expandChildInterests,
    SortOrder: opts.sortOrder ?? opts.orderByDate,
    Skip: opts.skip,
    Take: opts.take ?? 20,
  }, ctx);
  return r.body;
}

export async function getById(id, ctx = {}) {
  const r = await get(`${BASE}/Interests/${encodeURIComponent(id)}`, {}, ctx);
  return r.body;
}

export async function csvBundle(opts = {}, ctx = {}) {
  return getBytes(`${BASE}/Interests/csv`, {
    MemberId: opts.memberId,
    CategoryId: opts.categoryId,
    RegisterId: opts.registerId,
    PublishedFrom: opts.publishedFrom ?? opts.from,
    PublishedTo: opts.publishedTo ?? opts.to,
    RegisteredFrom: opts.registeredFrom,
    RegisteredTo: opts.registeredTo,
    UpdatedFrom: opts.updatedFrom,
    UpdatedTo: opts.updatedTo,
    IncludeFieldDescriptions: opts.includeFieldDescriptions,
  }, { ...ctx, accept: 'application/zip' });
}

export async function categories(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/Categories`, {
    Skip: opts.skip,
    Take: opts.take,
  }, ctx);
  return r.body;
}

export async function category(id, ctx = {}) {
  const r = await get(`${BASE}/Categories/${encodeURIComponent(id)}`, {}, ctx);
  return r.body;
}

export async function registers(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/Registers`, {
    SessionId: opts.sessionId,
    Skip: opts.skip,
    Take: opts.take,
  }, ctx);
  return r.body;
}

export async function register(id, ctx = {}) {
  const r = await get(`${BASE}/Registers/${encodeURIComponent(id)}`, {}, ctx);
  return r.body;
}

export async function registerPdf(id, opts = {}, ctx = {}) {
  return getBytes(`${BASE}/Registers/${encodeURIComponent(id)}/document`, {
    type: opts.type,
  }, { ...ctx, accept: 'application/pdf' });
}
