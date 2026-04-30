// UK Parliament OData v4 endpoint.
// Service root: https://api.parliament.uk/odata/
import { get } from '../http.mjs';

const BASE = 'https://api.parliament.uk/odata';

export async function entitySets(ctx = {}) {
  const r = await get(`${BASE}/`, {}, ctx);
  return r.body;
}

export async function metadata(ctx = {}) {
  const r = await get(`${BASE}/$metadata`, {}, { ...ctx, accept: 'application/xml, text/xml' });
  return r.body;
}

export async function getSet(setName, opts = {}, ctx = {}) {
  const params = {};
  if (opts.filter) params['$filter'] = opts.filter;
  if (opts.select) params['$select'] = Array.isArray(opts.select) ? opts.select.join(',') : opts.select;
  if (opts.expand) params['$expand'] = Array.isArray(opts.expand) ? opts.expand.join(',') : opts.expand;
  if (opts.orderby ?? opts.orderBy) params['$orderby'] = opts.orderby ?? opts.orderBy;
  if (opts.top !== undefined) params['$top'] = opts.top;
  if (opts.skip !== undefined) params['$skip'] = opts.skip;
  if (opts.count) params['$count'] = 'true';
  const r = await get(`${BASE}/${encodeURIComponent(setName)}`, params, ctx);
  return r.body;
}

export async function getEntity(setName, key, opts = {}, ctx = {}) {
  // OData keys are quoted for strings: Set('id') vs Set(123)
  const segment = typeof key === 'number' ? `(${key})` : `('${key}')`;
  const params = {};
  if (opts.select) params['$select'] = Array.isArray(opts.select) ? opts.select.join(',') : opts.select;
  if (opts.expand) params['$expand'] = Array.isArray(opts.expand) ? opts.expand.join(',') : opts.expand;
  const r = await get(`${BASE}/${encodeURIComponent(setName)}${segment}`, params, ctx);
  return r.body;
}

export async function count(setName, ctx = {}) {
  const r = await get(`${BASE}/${encodeURIComponent(setName)}/$count`, {}, { ...ctx, accept: 'text/plain, */*' });
  return r.body;
}
