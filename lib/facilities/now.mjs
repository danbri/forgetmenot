// Annunciator (Now) API.
// Base: https://now-api.parliament.uk/api
import { get } from '../http.mjs';

const BASE = 'https://now-api.parliament.uk/api';

export async function current(annunciator = 'CommonsMain', ctx = {}) {
  const r = await get(`${BASE}/Message/message/${encodeURIComponent(annunciator)}/current`, {}, ctx);
  return r.body;
}

export async function since(annunciator, dateIso, ctx = {}) {
  const r = await get(`${BASE}/Message/message/${encodeURIComponent(annunciator)}/${encodeURIComponent(dateIso)}`, {}, ctx);
  return r.body;
}
