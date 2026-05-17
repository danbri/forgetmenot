// Environment Agency Real-Time Flood Monitoring API.
// Base: https://environment.data.gov.uk/flood-monitoring
//
// Tier-3 third-party. Operator: Environment Agency (DEFRA, England).
// OGL v3.0. Free, no auth.
//
// REST API documented at https://environment.data.gov.uk/flood-monitoring/doc/reference
// Coverage: England only (Scotland uses SEPA, Wales uses NRW, NI
// uses DfI Rivers). Live flood warnings + alerts, ~5,000 monitoring
// stations measuring river / sea / groundwater / rainfall.
import { get } from '../http.mjs';

const BASE = 'https://environment.data.gov.uk/flood-monitoring';

function dropEmpty(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    out[k] = v;
  }
  return out;
}

// ---- Flood warnings / alerts ----

// Currently-active flood warnings and alerts in England.
// Severity levels: 1 = Severe (danger to life), 2 = Warning,
// 3 = Alert, 4 = Removed (within last 24 h).
export async function floods(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/id/floods`, dropEmpty({
    'min-severity': opts.minSeverity,
    county: opts.county,
    'lat': opts.lat, 'long': opts.lon ?? opts.long,
    'dist': opts.dist,                    // km from lat/lon
    'flood-area-id': opts.floodAreaId,
    _limit: opts.take ?? opts.limit,
    _offset: opts.skip ?? opts.offset,
  }), { ...ctx, accept: 'application/json' });
  return r.body;
}

// All defined flood areas (warning / alert polygons), whether
// currently active or not. ~4,400 areas total.
export async function floodAreas(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/id/floodAreas`, dropEmpty({
    lat: opts.lat, long: opts.lon ?? opts.long, dist: opts.dist,
    county: opts.county,
    _limit: opts.take ?? opts.limit,
    _offset: opts.skip ?? opts.offset,
  }), { ...ctx, accept: 'application/json' });
  return r.body;
}

// One flood area by id.
export async function floodArea(id, ctx = {}) {
  const r = await get(`${BASE}/id/floodAreas/${encodeURIComponent(id)}`, {},
    { ...ctx, accept: 'application/json' });
  return r.body;
}

// ---- Monitoring stations ----

// All monitoring stations. Filterable by parameter type, location.
// `parameter` is e.g. 'level', 'flow', 'rainfall', 'wind',
// 'temperature'; `qualifier` further narrows ('Stage', 'Downstream
// Stage', etc.).
export async function stations(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/id/stations`, dropEmpty({
    parameter: opts.parameter,
    qualifier: opts.qualifier,
    'parameterName': opts.parameterName,
    'qualifierName': opts.qualifierName,
    'town': opts.town,
    'catchmentName': opts.catchmentName,
    'riverName': opts.riverName,
    'stationReference': opts.stationReference,
    'RLOIid': opts.rloiId,
    'search': opts.search,
    'lat': opts.lat, 'long': opts.lon ?? opts.long, 'dist': opts.dist,
    'status': opts.status,                 // 'Active' / 'Closed' / 'Suspended'
    _limit: opts.take ?? opts.limit,
    _offset: opts.skip ?? opts.offset,
  }), { ...ctx, accept: 'application/json' });
  return r.body;
}

// One station by reference id.
export async function station(stationRef, ctx = {}) {
  const r = await get(`${BASE}/id/stations/${encodeURIComponent(stationRef)}`, {},
    { ...ctx, accept: 'application/json' });
  return r.body;
}

// Latest readings from one station (last 24 h by default).
export async function stationReadings(stationRef, opts = {}, ctx = {}) {
  const r = await get(`${BASE}/id/stations/${encodeURIComponent(stationRef)}/readings`, dropEmpty({
    latest: opts.latest ? '' : undefined,    // present flag if true
    since: opts.since,                       // ISO 8601
    today: opts.today ? '' : undefined,
    _limit: opts.take ?? opts.limit,
    _sorted: opts.sorted ? '' : undefined,
  }), { ...ctx, accept: 'application/json' });
  return r.body;
}

// All recent readings across every station (huge — paginate carefully).
export async function readings(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/data/readings`, dropEmpty({
    parameter: opts.parameter,
    latest: opts.latest ? '' : undefined,
    today: opts.today ? '' : undefined,
    since: opts.since,
    stationReference: opts.stationReference,
    _limit: opts.take ?? opts.limit,
    _offset: opts.skip ?? opts.offset,
    _sorted: opts.sorted ? '' : undefined,
  }), { ...ctx, accept: 'application/json' });
  return r.body;
}

// Archived (historic) readings dataset list.
export async function archive(ctx = {}) {
  const r = await get(`${BASE}/archive`, {},
    { ...ctx, accept: 'application/json' });
  return r.body;
}
