// Erskine May API.
// Base: https://erskinemay-api.parliament.uk/api
import { get } from '../http.mjs';

const BASE = 'https://erskinemay-api.parliament.uk/api';

export async function parts(ctx = {}) {
  const r = await get(`${BASE}/Part`, {}, ctx);
  return r.body;
}

export async function part(partNumber, ctx = {}) {
  const r = await get(`${BASE}/Part/${encodeURIComponent(partNumber)}`, {}, ctx);
  return r.body;
}

export async function chapter(chapterNumber, ctx = {}) {
  const r = await get(`${BASE}/Chapter/${encodeURIComponent(chapterNumber)}`, {}, ctx);
  return r.body;
}

export async function section(sectionId, ctx = {}) {
  const r = await get(`${BASE}/Section/${encodeURIComponent(sectionId)}`, {}, ctx);
  return r.body;
}

export async function sectionStep(sectionId, step, ctx = {}) {
  const r = await get(`${BASE}/Section/${encodeURIComponent(sectionId)},${encodeURIComponent(step)}`, {}, ctx);
  return r.body;
}

export async function paragraph(reference, ctx = {}) {
  const r = await get(`${BASE}/Search/Paragraph/${encodeURIComponent(reference)}`, {}, ctx);
  return r.body;
}

export async function searchParagraphs(term, ctx = {}) {
  const r = await get(`${BASE}/Search/ParagraphSearchResults/${encodeURIComponent(term)}`, {}, ctx);
  return r.body;
}

export async function searchSections(term, ctx = {}) {
  const r = await get(`${BASE}/Search/SectionSearchResults/${encodeURIComponent(term)}`, {}, ctx);
  return r.body;
}

export async function indexBrowse(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/IndexTerm/browse`, {
    startLetter: opts.startLetter,
  }, ctx);
  return r.body;
}

export async function indexTerm(indexTermId, ctx = {}) {
  const r = await get(`${BASE}/IndexTerm/${encodeURIComponent(indexTermId)}`, {}, ctx);
  return r.body;
}

export async function searchIndex(term, ctx = {}) {
  const r = await get(`${BASE}/Search/IndexTermSearchResults/${encodeURIComponent(term)}`, {}, ctx);
  return r.body;
}
