// UK Parliament parameterised query browser.
// Endpoint: https://api.parliament.uk/query/
// Each template is a fixed name with a fixed parameter signature.
// We expose a single `run(template, params)` plus a static template list.
import { get } from '../http.mjs';

const BASE = 'https://api.parliament.uk/query';

// Snapshot of templates discovered 2026-04-30. The canonical list is at
// _specs/discovered/query-templates.txt and refreshed by
// scripts/refetch-discovered.sh.
export const KNOWN_TEMPLATES = [
  // person_*
  'person_index', 'person_a_to_z', 'person_by_id', 'person_by_initial',
  'person_by_substring', 'person_lookup', 'person_constituencies',
  'person_current_constituency', 'person_parties', 'person_current_party',
  'person_houses', 'person_current_house', 'person_contact_points',
  'person_committees_index', 'person_committees_memberships_index',
  'person_current_committees_memberships', 'person_mps',
  // member_*
  'member_index', 'member_a_to_z', 'member_current', 'member_current_a_to_z',
  'member_by_initial', 'member_current_by_initial',
  // constituency_*
  'constituency_index', 'constituency_a_to_z', 'constituency_by_id',
  'constituency_by_initial', 'constituency_by_substring',
  'constituency_lookup', 'constituency_lookup_by_postcode',
  'constituency_current', 'constituency_current_a_to_z',
  'constituency_current_by_initial', 'constituency_map',
  'constituency_members', 'constituency_current_member',
  'constituency_contact_point', 'find_your_constituency',
  // party_*
  'party_index',
];

export async function listTemplates(ctx = {}) {
  // Returns the HTML root with template hrefs. Caller can scrape.
  const r = await get(`${BASE}/`, {}, { ...ctx, accept: 'text/html, */*' });
  return r.body;
}

export async function run(template, params = {}, ctx = {}) {
  const r = await get(`${BASE}/${encodeURIComponent(template)}`, params, ctx);
  return r.body;
}

// Convenience helpers for the most common templates.

export async function postcodeLookup(postcode, ctx = {}) {
  return run('constituency_lookup_by_postcode', { postcode }, ctx);
}

export async function personById(personId, ctx = {}) {
  return run('person_by_id', { person_id: personId }, ctx);
}

export async function personByMnisId(mnisId, ctx = {}) {
  return run('person_lookup', { property: 'mnisId', value: mnisId }, ctx);
}

export async function constituencyByOnsCode(onsCode, ctx = {}) {
  return run('constituency_lookup', { property: 'onsCode', value: onsCode }, ctx);
}

export async function currentMps(ctx = {}) {
  return run('person_mps', {}, ctx);
}
