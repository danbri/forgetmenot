// UK Parliament e-Petitions API (JSON:API style).
// Base: https://petition.parliament.uk
import { get } from '../http.mjs';

const BASE = 'https://petition.parliament.uk';

export async function search(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/petitions.json`, {
    state: opts.state,
    topic: opts.topic,
    q: opts.q ?? opts.term,
    count: opts.count ?? opts.take ?? 50,
    page: opts.page,
    sort: opts.sort,
  }, ctx);
  return r.body;
}

export async function getById(id, ctx = {}) {
  const r = await get(`${BASE}/petitions/${encodeURIComponent(id)}.json`, {}, ctx);
  return r.body;
}

export async function archive(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/archive/petitions.json`, {
    state: opts.state,
    topic: opts.topic,
    q: opts.q ?? opts.term,
    count: opts.count ?? opts.take ?? 50,
    page: opts.page,
  }, ctx);
  return r.body;
}

export async function archiveGet(id, ctx = {}) {
  const r = await get(`${BASE}/archive/petitions/${encodeURIComponent(id)}.json`, {}, ctx);
  return r.body;
}
