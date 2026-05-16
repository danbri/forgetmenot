// What's On / Calendar API.
// Base: https://whatson-api.parliament.uk
// Spec: _specs/whatson.json
//
// The 17 "event-shape" endpoints accept the same filter set under the
// `queryParameters.` prefix; the 4 procedural-date endpoints take
// flat params; the 5 reference-list endpoints take none.
import { get } from '../http.mjs';

const BASE = 'https://whatson-api.parliament.uk';
const FMT = 'json';

const qp = (obj) => {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== '') out[`queryParameters.${k}`] = v;
  }
  return out;
};

const flat = (obj) => {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== '') out[k] = v;
  }
  return out;
};

// Shared event filter object accepted by every /calendar/events/*
// endpoint and the EventTypeMetaData endpoint.
function eventFilters(opts) {
  return qp({
    house: opts.house,
    eventTypeId: opts.eventTypeId,
    startDate: opts.startDate ?? opts.from,
    endDate: opts.endDate ?? opts.to,
    date: opts.date,
    locationId: opts.locationId,
    memberId: opts.memberId,
    tag: opts.tag,
    committeeId: opts.committeeId,
    inquiryId: opts.inquiryId,
    categoryId: opts.categoryId,
    eventId: opts.eventId,
    categoryCode: opts.categoryCode,
    answeringBodyIds: opts.answeringBodyIds,
    searchTerm: opts.searchTerm ?? opts.term,
    groupChildEventsWithParent: opts.groupChildEventsWithParent,
  });
}

// ---- Events ----
export async function eventsList(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/calendar/events/list.${FMT}`, eventFilters(opts), ctx);
  return r.body;
}

export async function eventsNonsitting(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/calendar/events/nonsitting.${FMT}`, eventFilters(opts), ctx);
  return r.body;
}

export async function eventsDiary(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/calendar/events/diary.${FMT}`, eventFilters(opts), ctx);
  return r.body;
}

export async function eventsSpeakers(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/calendar/events/speakers.${FMT}`, eventFilters(opts), ctx);
  return r.body;
}

export async function eventTypeMetadata(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/calendar/events/EventTypeMetaData.${FMT}`, eventFilters(opts), ctx);
  return r.body;
}

export async function event(eventId, ctx = {}) {
  const r = await get(`${BASE}/calendar/events/cal${encodeURIComponent(eventId)}`, {}, ctx);
  return r.body;
}

// ---- Procedural dates ----
// (house, dateToCheck etc. are flat path/query params per spec.)
function houseSeg(h) {
  if (!h) throw new Error('house is required (Commons|Lords)');
  return encodeURIComponent(h);
}

export async function sittingDates(house, opts = {}, ctx = {}) {
  const r = await get(`${BASE}/calendar/proceduraldates/${houseSeg(house)}/sittingdates.${FMT}`, flat({
    startDate: opts.startDate ?? opts.from,
    endDate: opts.endDate ?? opts.to,
  }), ctx);
  return r.body;
}

export async function answerDate(house, opts = {}, ctx = {}) {
  const r = await get(`${BASE}/calendar/proceduraldates/${houseSeg(house)}/answerdate.${FMT}`, flat({
    questionType: opts.questionType,
    tabledDate: opts.tabledDate,
  }), ctx);
  return r.body;
}

export async function tablingDate(house, opts = {}, ctx = {}) {
  const r = await get(`${BASE}/calendar/proceduraldates/${houseSeg(house)}/tablingdate.${FMT}`, flat({
    requestedDate: opts.requestedDate,
  }), ctx);
  return r.body;
}

export async function nextSittingDate(house, opts = {}, ctx = {}) {
  const r = await get(`${BASE}/calendar/proceduraldates/${houseSeg(house)}/nextsittingdate.${FMT}`, flat({
    dateToCheck: opts.dateToCheck,
    includeWeekendSittings: opts.includeWeekendSittings,
  }), ctx);
  return r.body;
}

export async function lastSittingDate(house, opts = {}, ctx = {}) {
  const r = await get(`${BASE}/calendar/proceduraldates/${houseSeg(house)}/lastsittingdate.${FMT}`, flat({
    dateToCheck: opts.dateToCheck,
    includeWeekendSittings: opts.includeWeekendSittings,
  }), ctx);
  return r.body;
}

// SI / treaty annulment-window date. `daysInFuture` defaults to 40
// (the standard SI praying period) per the spec.
export async function annulmentDate(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/calendar/proceduraldates/annulmentdate/forDate.${FMT}`, flat({
    dateLaid: opts.dateLaid,
    daysInFuture: opts.daysInFuture,
    isTreaty: opts.isTreaty,
  }), ctx);
  return r.body;
}

// ---- Sessions ----
export async function sessions(ctx = {}) {
  const r = await get(`${BASE}/calendar/sessions/list.${FMT}`, {}, ctx);
  return r.body;
}

export async function sessionById(sessionId, ctx = {}) {
  const r = await get(`${BASE}/calendar/sessions/byid.${FMT}/${encodeURIComponent(sessionId)}`, {}, ctx);
  return r.body;
}

export async function sessionForDate(date, ctx = {}) {
  const r = await get(`${BASE}/calendar/sessions/fordate.${FMT}/${encodeURIComponent(date)}`, {}, ctx);
  return r.body;
}

// ---- Reference lists ----
export async function locations(ctx = {}) {
  const r = await get(`${BASE}/calendar/locations/list.${FMT}`, {}, ctx);
  return r.body;
}

export async function tags(ctx = {}) {
  const r = await get(`${BASE}/calendar/tags/list.${FMT}`, {}, ctx);
  return r.body;
}

export async function types(ctx = {}) {
  const r = await get(`${BASE}/calendar/types/list.${FMT}`, {}, ctx);
  return r.body;
}

export async function categories(ctx = {}) {
  const r = await get(`${BASE}/calendar/categories/list.${FMT}`, {}, ctx);
  return r.body;
}
