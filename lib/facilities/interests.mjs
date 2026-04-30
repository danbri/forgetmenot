// Register of Members' Financial Interests API.
// Base: https://interests-api.parliament.uk/api/v1
import { get, getBytes } from '../http.mjs';

const BASE = 'https://interests-api.parliament.uk/api/v1';

export async function search(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/Interests`, {
    MemberId: opts.memberId,
    CategoryId: opts.categoryId,
    IsCorrection: opts.isCorrection,
    IsPublished: opts.isPublished,
    PublishedFrom: opts.publishedFrom ?? opts.from,
    PublishedTo: opts.publishedTo ?? opts.to,
    CreatedFrom: opts.createdFrom,
    CreatedTo: opts.createdTo,
    AmendedFrom: opts.amendedFrom,
    AmendedTo: opts.amendedTo,
    DeletedFrom: opts.deletedFrom,
    DeletedTo: opts.deletedTo,
    RegistrationDateFrom: opts.registrationDateFrom,
    RegistrationDateTo: opts.registrationDateTo,
    Take: opts.take ?? 20,
    Skip: opts.skip,
    OrderByDate: opts.orderByDate,
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
    PublishedFrom: opts.publishedFrom ?? opts.from,
    PublishedTo: opts.publishedTo ?? opts.to,
  }, { ...ctx, accept: 'application/zip' });
}

export async function categories(ctx = {}) {
  const r = await get(`${BASE}/Categories`, {}, ctx);
  return r.body;
}

export async function category(id, ctx = {}) {
  const r = await get(`${BASE}/Categories/${encodeURIComponent(id)}`, {}, ctx);
  return r.body;
}

export async function registers(ctx = {}) {
  const r = await get(`${BASE}/Registers`, {}, ctx);
  return r.body;
}

export async function register(id, ctx = {}) {
  const r = await get(`${BASE}/Registers/${encodeURIComponent(id)}`, {}, ctx);
  return r.body;
}

export async function registerPdf(id, ctx = {}) {
  return getBytes(`${BASE}/Registers/${encodeURIComponent(id)}/document`, {}, { ...ctx, accept: 'application/pdf' });
}
