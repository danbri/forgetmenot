// Information Commissioner's Office — UK data-protection regulator.
// Enforcement notices, Monetary Penalty Notices (MPNs), data-protection
// rulings, FOI decisions, decision notices.
// Base: https://ico.org.uk
//
// Tier-3 third-party. Operator: ICO (independent UK authority for
// data protection / FOI / EIR). OGL v3.0.
//
// ICO does not publish a JSON API or RSS for enforcement actions
// (probed May 2026). Surface is HTML index pages. We expose those
// URLs and a generic page fetcher so LLMs can extract.
import { get } from '../http.mjs';

const BASE = 'https://ico.org.uk';

// HTML index of "Action we've taken" — the umbrella page.
export async function actions(ctx = {}) {
  const r = await get(`${BASE}/action-weve-taken/`, {},
    { ...ctx, accept: 'text/html' });
  return r.body;
}

// Specific action categories. `category` is one of:
//   'enforcement'   — enforcement notices, MPNs, undertakings, audits
//   'decision-notices' — FOI / EIR decisions
//   'audits'        — published audit reports
//   'reprimands'    — formal reprimands
//   'undertakings'  — entity undertakings
export async function actionsByCategory(category, ctx = {}) {
  const r = await get(`${BASE}/action-weve-taken/${encodeURIComponent(category)}/`, {},
    { ...ctx, accept: 'text/html' });
  return r.body;
}

// Generic page fetcher for any ICO URL.
export async function page(path, ctx = {}) {
  const cleanPath = String(path).replace(/^\//, '');
  const r = await get(`${BASE}/${cleanPath}`, {}, { ...ctx, accept: 'text/html' });
  return r.body;
}

// Stable browser URL for an enforcement action (LLM can construct
// after extraction from the listing page).
export function actionUrl(slug) {
  return `${BASE}/action-weve-taken/enforcement/${encodeURIComponent(slug)}/`;
}
