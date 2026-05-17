// MPs' Guide to Procedure API.
// Base: https://guidetoprocedure-api.parliament.uk/api
// Spec: https://guidetoprocedure-api.parliament.uk/swagger/v1/swagger.json
//
// A small content-driven service of plain-English procedural
// guidance written for MPs. Distinct content authority from
// Erskine May (which is the formal treatise).
import { get } from '../http.mjs';

const BASE = 'https://guidetoprocedure-api.parliament.uk/api';

export async function landingPage(ctx = {}) {
  const r = await get(`${BASE}/Content/landingPage`, {}, ctx);
  return r.body;
}

export async function howToPage(ctx = {}) {
  const r = await get(`${BASE}/Content/howToPage`, {}, ctx);
  return r.body;
}

export async function globalMessage(ctx = {}) {
  const r = await get(`${BASE}/Content/globalMessage`, {}, ctx);
  return r.body;
}

export async function contentPage(uri, ctx = {}) {
  const r = await get(`${BASE}/Content/contentPage`, { uri }, ctx);
  return r.body;
}

export async function search(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/Content/search`, {
    searchTerms: opts.searchTerms ?? opts.term,
    pageNumber: opts.pageNumber ?? opts.page,
  }, ctx);
  return r.body;
}
