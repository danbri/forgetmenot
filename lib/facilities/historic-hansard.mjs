// Historic Hansard (1803–2005).
// HTML site only — no JSON API. We provide URL builders and an HTML
// fetch helper. Parsing the HTML is left to the caller.
import { rawFetch } from '../http.mjs';

export const BASE = 'https://api.parliament.uk/historic-hansard';

const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

export function sittingUrl(year, month, day) {
  const mon = typeof month === 'number' ? MONTHS[month - 1] : String(month).toLowerCase().slice(0, 3);
  return `${BASE}/sittings/${year}/${mon}/${String(day).padStart(2, '0')}`;
}

export function houseSittingUrl(house, year, month, day) {
  const mon = typeof month === 'number' ? MONTHS[month - 1] : String(month).toLowerCase().slice(0, 3);
  const h = String(house).toLowerCase();
  return `${BASE}/${h}/${year}/${mon}/${String(day).padStart(2, '0')}`;
}

export function personUrl(slug) {
  return `${BASE}/people/${encodeURIComponent(slug)}`;
}

export function constituencyUrl(slug) {
  return `${BASE}/constituencies/${encodeURIComponent(slug)}`;
}

export function officeUrl(slug) {
  return `${BASE}/offices/${encodeURIComponent(slug)}`;
}

export function actUrl(slug) {
  return `${BASE}/acts/${encodeURIComponent(slug)}`;
}

export function billUrl(slug) {
  return `${BASE}/bills/${encodeURIComponent(slug)}`;
}

export function divisionUrl(house, year, month, day, slug) {
  const mon = typeof month === 'number' ? MONTHS[month - 1] : String(month).toLowerCase().slice(0, 3);
  return `${BASE}/divisions/${String(house).toLowerCase()}/${year}/${mon}/${String(day).padStart(2, '0')}/${encodeURIComponent(slug)}`;
}

// Fetch arbitrary historic-hansard HTML.
export async function fetchHtml(relativePath, ctx = {}) {
  const url = relativePath.startsWith('http') ? relativePath
            : `${BASE}/${relativePath.replace(/^\//, '')}`;
  const r = await rawFetch(url, { method: 'GET' }, { ...ctx, accept: 'text/html, */*' });
  return r.body;
}
