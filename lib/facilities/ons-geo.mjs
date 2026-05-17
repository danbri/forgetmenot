// ONS Open Geography Portal — UK administrative-geography boundaries.
// Base: services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services
//
// Tier-3 third-party. Operator: Office for National Statistics (ONS),
// using Esri ArcGIS REST FeatureServer endpoints. Free, no auth.
//
// The portal exposes ~3,900 services. Each one is a typed boundary
// set (constituencies, LADs, wards, regions, …) for a specific
// epoch, with field names that include the year suffix (e.g.
// `PCON24CD` for July-2024 constituency codes, `PCON25CD` for the
// later snapshot). Our wrap intentionally does NOT enumerate them —
// new layers appear every few months. Instead it accepts the service
// name and exposes the four standard ArcGIS operations.
//
// Common service names worth knowing:
//   Westminster_Parliamentary_Constituencies_July_2024_Boundaries_UK_BUC
//   PCON_DEC_2022_UK_BFE_V2     (pre-review 533/59/40/18 boundaries)
//   PCON_JULY_2024_UK_BUC       (modern review)
//   Local_Authority_Districts_December_2024_Boundaries_UK_BUC
//   Wards_December_2024_Boundaries_UK_BUC
import { get } from '../http.mjs';

const BASE = 'https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services';

const dropEmpty = (obj) => {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    out[k] = v;
  }
  return out;
};

// Service metadata: layer fields, geometry type, extent, etc.
export async function serviceInfo(service, opts = {}, ctx = {}) {
  const r = await get(`${BASE}/${encodeURIComponent(service)}/FeatureServer/${opts.layer ?? 0}`, {
    f: 'json',
  }, ctx);
  return r.body;
}

// List every service at the portal (warning: ~3,900 entries; large).
// Pass `filter` to substring-match against the service name client-side.
export async function listServices(opts = {}, ctx = {}) {
  const r = await get(`${BASE}`, { f: 'json' }, ctx);
  const body = r.body || {};
  let services = body.services || [];
  if (opts.filter) {
    const f = String(opts.filter).toLowerCase();
    services = services.filter((s) => (s.name || '').toLowerCase().includes(f));
  }
  return { ...body, services };
}

// Query features. Common operations:
//   query({ service: '…', where: '1=1', outFields: 'PCON24CD,PCON24NM',
//           returnGeometry: false, resultRecordCount: 50 })
//
// returnGeometry defaults to FALSE because boundary polygons are
// large (hundreds of KB per feature). Set `returnGeometry: true` to
// fetch them; consider `geometryPrecision: 5` to shrink output.
//
// Output format defaults to JSON. Pass `format: 'geojson'` for native
// GeoJSON. Pass `format: 'pjson'` for pretty-printed JSON (debug).
export async function query(opts = {}, ctx = {}) {
  if (!opts.service) throw new Error('ons-geo.query: service is required');
  const layer = opts.layer ?? 0;
  const fmt = opts.format ?? 'json';
  const r = await get(`${BASE}/${encodeURIComponent(opts.service)}/FeatureServer/${layer}/query`, dropEmpty({
    where: opts.where ?? '1=1',
    outFields: opts.outFields ?? '*',
    returnGeometry: opts.returnGeometry === true ? 'true' : 'false',
    geometryPrecision: opts.geometryPrecision,
    outSR: opts.outSR,                  // e.g. 4326 for WGS84 lat/lon
    resultRecordCount: opts.take ?? opts.resultRecordCount,
    resultOffset: opts.skip ?? opts.resultOffset,
    orderByFields: opts.orderByFields,
    objectIds: opts.objectIds,           // comma-separated
    geometry: opts.geometry,             // geometry filter (point/extent)
    geometryType: opts.geometryType,
    spatialRel: opts.spatialRel,
    inSR: opts.inSR,
    f: fmt,
  }), ctx);
  return r.body;
}

// Convenience: fetch one feature by attribute (e.g. PCON24CD = E14001063).
// Returns a single feature object or null.
export async function findByCode(service, codeField, code, opts = {}, ctx = {}) {
  const body = await query({
    service,
    where: `${codeField}='${String(code).replace(/'/g, "''")}'`,
    outFields: opts.outFields ?? '*',
    returnGeometry: opts.returnGeometry === true,
    geometryPrecision: opts.geometryPrecision,
    outSR: opts.outSR,
    layer: opts.layer,
  }, ctx);
  return body?.features?.[0] ?? null;
}

// Layer count for a service (handy when the service isn't a single-
// layer FeatureServer).
export async function layerCount(service, ctx = {}) {
  const r = await get(`${BASE}/${encodeURIComponent(service)}/FeatureServer`, { f: 'json' }, ctx);
  return (r.body?.layers || []).length;
}
