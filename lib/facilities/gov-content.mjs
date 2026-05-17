// gov.uk Content API + Search API.
// Base: https://www.gov.uk
//
// Tier-3 third-party. Operator: Government Digital Service (Cabinet
// Office). OGL v3.0. Free, no auth.
//
// Sister to `gov-data` (which wraps the CKAN dataset catalogue at
// data.gov.uk). This facility wraps the gov.uk *content store* —
// every page on www.gov.uk, structured. Lookup-shaped document
// types covered by the search filter include:
//   local_transaction      118  postcode → council service
//   place                   23  postcode → nearest provider
//   licence_transaction    453  postcode → council-issued licence
//   transaction            241  national lookups (vehicle reg, VAT, ...)
//   smart_answer            29  Q&A trees with structured output
//   simple_smart_answer     38  simpler variant
//   step_by_step_nav        42  multi-step process guides
//   finder                  57  faceted search frontends
//   hmrc_contact           127  HMRC enquiry-route lookup
//   answer                 762  helpers / sign-ins / calculators
//   help_page               11
// Plus every other published page (consultation, guidance,
// publication, statistical_announcement, etc.).
import { get } from '../http.mjs';

const BASE = 'https://www.gov.uk';

function dropEmpty(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    out[k] = v;
  }
  return out;
}

// Full Content API record for any gov.uk path.
// Pass the path with or without leading slash, e.g.:
//   content('rubbish-collection-day')
//   content('/government/foreign-travel-advice/france')
export async function content(path, ctx = {}) {
  const clean = String(path).replace(/^\//, '');
  const r = await get(`${BASE}/api/content/${clean}`, {},
    { ...ctx, accept: 'application/json' });
  return r.body;
}

// Full-text + facet search across every gov.uk page.
//
// Common opts:
//   query                    free-text query (Solr `q`)
//   filterDocumentType       'local_transaction' | 'place' | 'smart_answer' | ...
//   filterFormat             alternate filter on schema
//   filterOrganisations      e.g. 'ministry-of-defence'
//   filterContentPurposeSupergroup  e.g. 'services'
//   aggregateDocumentType    N    return aggregate counts per type
//   count                    page size (default 10)
//   start                    offset
//   orderBy                  e.g. '-public_timestamp', 'title'
//   fields                   comma-separated: title,link,description,public_timestamp
export async function search(opts = {}, ctx = {}) {
  const params = dropEmpty({
    q: opts.query ?? opts.q,
    count: opts.take ?? opts.count,
    start: opts.skip ?? opts.start,
    order: opts.orderBy ?? opts.order,
    fields: opts.fields,
    filter_content_store_document_type: opts.filterDocumentType,
    filter_format: opts.filterFormat,
    filter_organisations: opts.filterOrganisations,
    filter_content_purpose_supergroup: opts.filterContentPurposeSupergroup,
    aggregate_content_store_document_type: opts.aggregateDocumentType,
  });
  const r = await get(`${BASE}/api/search.json`, params,
    { ...ctx, accept: 'application/json' });
  return r.body;
}

// All lookup-shaped pages (the "feels like an API" set). Returns
// document_type counts so you can see the shape of what's available.
export async function lookupTypes(ctx = {}) {
  const body = await search({ aggregateDocumentType: 200, take: 0 }, ctx);
  const LOOKUP_KEYS = new Set([
    'local_transaction', 'place', 'licence_transaction', 'transaction',
    'smart_answer', 'simple_smart_answer', 'step_by_step_nav',
    'finder', 'hmrc_contact', 'answer', 'help_page',
  ]);
  const opts = body?.aggregates?.content_store_document_type?.options ?? [];
  return opts.filter((o) => LOOKUP_KEYS.has(o?.value?.slug));
}

// Enumerate pages of one lookup type (handy for "list every place
// lookup", "every smart answer", etc.).
export async function listType(documentType, opts = {}, ctx = {}) {
  return search({
    ...opts,
    filterDocumentType: documentType,
    fields: opts.fields ?? 'title,link,description,public_timestamp,document_type',
  }, ctx);
}

// ---- Bank Holidays (the canonical hidden gov.uk JSON API) ----
// Free, no auth, three divisions (england-and-wales, scotland,
// northern-ireland), each with `events[]` of { title, date, notes,
// bunting }. Lives at /bank-holidays.json (NOT under /api/content).
export async function bankHolidays(ctx = {}) {
  const r = await get(`${BASE}/bank-holidays.json`, {},
    { ...ctx, accept: 'application/json' });
  return r.body;
}
