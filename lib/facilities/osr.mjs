// Office for Statistics Regulation — polices the production and use
// of official statistics, including by Ministers, MPs, and government
// departments. Publishes formal censures when stats are misused.
// Base: https://osr.statisticsauthority.gov.uk
//
// Tier-3 third-party. Operator: OSR (part of the UK Statistics
// Authority). OGL v3.0.
//
// Surface: RSS feed + HTML pages. No JSON API.
import { get } from '../http.mjs';

const BASE = 'https://osr.statisticsauthority.gov.uk';

// All-publications RSS feed (includes case studies, censures,
// review reports, guidance).
export async function feed(ctx = {}) {
  const r = await get(`${BASE}/feed/`, {},
    { ...ctx, accept: 'application/rss+xml, application/xml, text/xml' });
  return r.body;
}

// One OSR page by relative path (e.g. 'news/...', 'publication/...',
// 'casework/...').
export async function page(path, ctx = {}) {
  const cleanPath = String(path).replace(/^\//, '');
  const r = await get(`${BASE}/${cleanPath}`, {}, { ...ctx, accept: 'text/html' });
  return r.body;
}
