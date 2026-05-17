// Nomis — ONS Census + labour-market data.
// Base: https://www.nomisweb.co.uk/api/v01
//
// Tier-3 third-party. Operator: Office for National Statistics (ONS).
// Free, anonymous SDMX-JSON. Census 2021 tables + labour-market
// series at fine geographic granularity (Westminster constituency,
// LAD, MSOA, LSOA, OA).
//
// Dataset id format: `NM_<n>_<v>` (e.g. NM_1_1 = Jobseeker's
// Allowance; NM_2021_1 = Census 2021 main residents table).
//
// Geography codes are ONS GSS codes (E14001063 etc.) OR Nomis-typed
// queries (e.g. `2092957699TYPE236` = "all Westminster constituencies
// in the 2024 set"). The library passes both straight through.
import { get } from '../http.mjs';

const BASE = 'https://www.nomisweb.co.uk/api/v01';

const dropEmpty = (obj) => {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    out[k] = v;
  }
  return out;
};

// ---- Discovery ----

// List every dataset on Nomis (~1,600). Returns the SDMX structure.
export async function listDatasets(ctx = {}) {
  const r = await get(`${BASE}/dataset/def.sdmx.json`, {}, ctx);
  return r.body;
}

// One dataset's definition (dimensions, codelists, attributes).
export async function datasetDef(id, ctx = {}) {
  const r = await get(`${BASE}/dataset/${encodeURIComponent(id)}.def.sdmx.json`, {}, ctx);
  return r.body;
}

// Codelist for one dimension of a dataset (e.g. `geography`,
// `measures`, `c_age`, `c_sex`). Lets you discover the legal codes
// before constructing a data query.
export async function codelist(datasetId, dimension, ctx = {}) {
  const r = await get(
    `${BASE}/dataset/${encodeURIComponent(datasetId)}/${encodeURIComponent(dimension)}/def.sdmx.json`,
    {}, ctx,
  );
  return r.body;
}

// ---- Data ----

// Reserved opts keys that control the request (not Nomis dimensions).
const META_KEYS = new Set([
  'format', 'take', 'skip', 'recordLimit', 'recordOffset', 'select',
]);

// Pull observations from a dataset. Every key on `opts` that is NOT
// in META_KEYS is sent to Nomis as a dimension filter — so calling
//   data('NM_2021_1', { geography: '2092957699TYPE236',
//                       measures: 20100, date: 'latest' })
// hits
//   /dataset/NM_2021_1.data.json?geography=…&measures=20100&date=latest
//
// Geography-filter notes (important):
//   - Bare ONS GSS codes (e.g. 'E14001063') often return 0 obs because
//     Nomis indexes datasets by ITS OWN geography ids, not GSS codes.
//   - The typed-query form `<parentId>TYPE<n>` lists every geography
//     of a given Nomis type within the parent. E.g. for Census 2021
//     by built-up area: `2092957699TYPE236`.
//   - Each dataset publishes its own geography codelist. Discover the
//     valid types with `geographyTypes(<id>)` and read the `TypeCode`
//     annotations.
//   - Some Nomis datasets do accept a bare GSS code (older labour-market
//     series in particular); try both forms when prototyping.
export async function data(datasetId, opts = {}, ctx = {}) {
  const fmt = opts.format ?? 'json';
  const params = {};
  for (const [k, v] of Object.entries(opts)) {
    if (META_KEYS.has(k)) continue;
    if (v === undefined || v === null || v === '') continue;
    params[k] = v;
  }
  if (opts.take ?? opts.recordLimit) params.recordlimit = opts.take ?? opts.recordLimit;
  if (opts.skip ?? opts.recordOffset) params.RecordOffset = opts.skip ?? opts.recordOffset;
  if (opts.select) params.select = opts.select;

  const r = await get(
    `${BASE}/dataset/${encodeURIComponent(datasetId)}.data.${fmt}`,
    params,
    { ...ctx, accept: fmt === 'csv' ? 'text/csv' : 'application/json' },
  );
  return r.body;
}

// Geography-type list for a dataset: returns the Nomis types that
// the dataset is indexed by (with their TypeCode annotation). Use
// this to pick the right `TYPE<n>` for your `data()` call.
export async function geographyTypes(datasetId, ctx = {}) {
  const r = await get(
    `${BASE}/dataset/${encodeURIComponent(datasetId)}/geography/TypeList.def.sdmx.json`,
    {}, ctx,
  );
  return r.body;
}
