// Identity matching: resolve a free-text name (e.g. an APPG
// officer name as printed in the Register) to a canonical
// Parliament member record with an MNIS id.
//
// Primary signal: the Members API search.
//   GET https://members-api.parliament.uk/api/Members/Search?Name=<surname>&take=20
// returns hits with id, nameDisplayAs, latestParty, latestHouseMembership.
// In practice surname-only searches work well because the API
// already does fuzzy / contains matching across the name field.
//
// Disambiguation when several hits come back:
//   * party match  — APPG records the officer's party verbatim; we
//     normalise both sides (party abbreviation + full name) and
//     keep only hits whose party fits.
//   * first-name token presence — Lord Oates ≠ Mr Smith Oates.
//   * title → house implication — "Lord", "Baroness", "Lady",
//     "Bishop" → Lords. "Dame", "Sir", "Mr", "Mrs", "Ms", "Dr",
//     "Rt Hon" → ambiguous (Commons or peer dame/sir).
//
// Output buckets (for any input name):
//   matched           — exactly one candidate after disambiguation
//   ambiguous         — multiple candidates remain
//   no_candidates     — search returned nothing usable
//   error             — network or parse error
//
// Wikidata fallback (operator-side): the resolver exposes a
// `lookupWikidata(name)` helper that issues
//   GET https://www.wikidata.org/w/api.php?action=wbsearchentities&search=...
// and returns candidate Q-IDs. Wikidata items for UK MPs and peers
// frequently carry property P2031 (UK Parliament identifier =
// MNIS id) on the `parliament-uk` Wikipedia template, plus P102
// (party). The fallback is INTENDED as the second pass of a two-
// step resolver — kept as a separate function so callers can
// choose when (and from which environment) to invoke it.
//
// This module is browser-portable: only `fetch`, `URL`, no `fs`.

import { rawFetch } from './http.mjs';
import { search as memberSearch } from './facilities/members.mjs';

// Honorifics + titles we strip from a candidate name before searching.
// We KEEP them on the original record (for display) but don't pass
// them to the Members API — the search index would otherwise match
// "Lord Mandelson" against the literal word "Lord" elsewhere.
const HONORIFICS = [
  'the rt hon', 'rt hon', 'right honourable', 'rt honourable',
  'lord bishop of', 'bishop of', 'archbishop of',
  'baroness', 'lord', 'lady', 'sir', 'dame', 'dr', 'mr', 'mrs', 'ms',
  'rev', 'reverend', 'professor', 'prof',
];

// Title → likely house. Used as a tie-breaker when the API search
// returns a Commons hit and a Lords hit and we have no other signal.
// "Bishop" titles always go to Lords (Lords Spiritual).
const TITLE_TO_HOUSE = {
  baroness: 'Lords', lord: 'Lords', lady: 'Lords', bishop: 'Lords',
  archbishop: 'Lords',
};

// Strip honorifics and tidy whitespace. Returns an array of cleaned
// tokens (preserves first name + surname + any patronymic part).
export function normaliseName(raw) {
  if (!raw) return { stripped: '', titles: [], firstNames: [], surname: '' };
  let s = String(raw).trim().replace(/\s+/g, ' ');
  const lower = s.toLowerCase();
  const titles = [];
  // Strip honorifics from the front. Order matters — multi-word
  // honorifics first ("The Rt Hon" before "Rt Hon").
  for (const h of HONORIFICS) {
    const re = new RegExp(`^${h.replace(/[ ]/g, '\\s+')}\\s+`, 'i');
    if (re.test(s)) { titles.push(h); s = s.replace(re, ''); }
  }
  // Drop trailing post-nominals like "MP", "QC", "KC", "CBE".
  s = s.replace(/\s+(MP|QC|KC|CBE|MBE|OBE|DBE|GBE|KBE|FRSE)(?:\s+(MP|QC|KC|CBE|MBE|OBE|DBE|GBE|KBE|FRSE))*\s*$/g, '');
  const tokens = s.split(/\s+/).filter(Boolean);
  // Heuristic: surname is the final token, given names are everything before.
  const surname = tokens[tokens.length - 1] || '';
  const firstNames = tokens.slice(0, -1);
  // Implied house from the original prefix.
  let impliedHouse = null;
  for (const t of titles.concat([lower.split(/\s+/)[0]])) {
    const k = t.toLowerCase().split(/\s+/)[0];
    if (TITLE_TO_HOUSE[k]) impliedHouse = TITLE_TO_HOUSE[k];
  }
  return { stripped: tokens.join(' '), titles, firstNames, surname, impliedHouse };
}

// Party normalisation. APPG records say "Conservative", "Labour",
// "Liberal Democrat", "Crossbench", "Non-affiliated", etc. The
// Members API returns essentially the same strings on `latestParty.name`
// plus an abbreviation. We compare on lower-case-stripped strings.
function partyMatch(a, b) {
  if (!a || !b) return false;
  const norm = (s) => String(s).toLowerCase()
    .replace(/\(co-op\)/g, '').replace(/\bparty\b/g, '').replace(/[^a-z]+/g, ' ').trim();
  const an = norm(a), bn = norm(b);
  if (!an || !bn) return false;
  if (an === bn) return true;
  // "Lab" / "Labour" abbreviations.
  if (an.startsWith(bn) || bn.startsWith(an)) return true;
  return false;
}

function houseFromHit(hit) {
  const h = hit?.latestHouseMembership?.house;
  return h === 1 ? 'Commons' : h === 2 ? 'Lords' : null;
}

// Score how well a Members API hit matches the officer name.
// Returns { score, hit }. Score components:
//   * tokensMatched — number of cleaned-name tokens that appear in
//     the hit's display/full/list name. The single most useful
//     positive signal: "Hunt of Kings Heath" gets 4 tokens against
//     id 2024 but only 1 ("Heath") against unrelated peers.
//   * partyExact   — boolean
//   * houseImplied — boolean (title implies a house and hit matches)
//   * isCurrent    — boolean (APPG officers must be sitting members,
//     so this is essentially a hard filter, scored to break ties).
function scoreCandidate(hit, officer, norm) {
  const hay = `${hit.nameDisplayAs || ''} ${hit.nameFullTitle || ''} ${hit.nameListAs || ''}`.toLowerCase();
  const cleanedTokens = [...norm.firstNames, norm.surname].map((s) => s.toLowerCase()).filter((t) => t && t.length > 1);
  const tokensMatched = cleanedTokens.filter((t) => hay.includes(t)).length;
  const partyExact   = !!(officer.party && partyMatch(officer.party, hit?.latestParty?.name));
  const houseImplied = !!(norm.impliedHouse && houseFromHit(hit) === norm.impliedHouse);
  const isCurrent    = !!(hit?.latestHouseMembership?.membershipStatus?.statusIsActive
                          && !hit?.latestHouseMembership?.membershipEndDate);
  const score =
    tokensMatched * 10 +
    (partyExact   ? 5 : 0) +
    (houseImplied ? 3 : 0) +
    (isCurrent    ? 2 : 0);
  return { score, hit, breakdown: { tokensMatched, partyExact, houseImplied, isCurrent } };
}

// Resolve one APPG-officer record to a member id. Returns:
//   { status: 'matched',    member: {...} }
//   { status: 'ambiguous',  candidates: [...] }
//   { status: 'no_candidates', tried: { ... } }
//   { status: 'error',      message: ... }
//
// Strategy:
//   1. Try the full cleaned name as the search query first. Peers
//      with locative titles ("Hunt of Kings Heath", "Palmer of
//      Childs Hill") are ONLY findable by the full title; the
//      surname alone returns dozens of unrelated hits.
//   2. If the full-name search returns 0 hits, fall back to
//      surname-only.
//   3. Apply scoreCandidate to every hit and keep the top score.
//      If a single hit beats all others by ≥5 points and is the
//      only `current` member, that's a confident match. If the
//      top score is shared, return ambiguous with all tied
//      candidates.
//
// `IsCurrentMember=true` is NOT enforced as a hard filter at the
// API level because some APPG editions (or recently-stepped-down
// officers) might temporarily lag. We apply it as a soft signal
// in scoring, then a hard filter only at the tie-break step.
//
// Inputs:
//   officer  — { name, party, role } as emitted by the appg facility
//   ctx      — passed through to rawFetch (timeout, ua etc.)
export async function resolveOfficer(officer, ctx = {}) {
  const norm = normaliseName(officer.name);
  if (!norm.stripped) return { status: 'no_candidates', tried: norm };

  // Strategy 1: full cleaned name.
  let hits;
  try {
    const r1 = await memberSearch({ name: norm.stripped, take: 20 }, ctx);
    hits = (r1?.items || []).map((it) => it.value);
    // Strategy 2: surname-only fallback if full name returned nothing.
    if (hits.length === 0) {
      const r2 = await memberSearch({ name: norm.surname, take: 20 }, ctx);
      hits = (r2?.items || []).map((it) => it.value);
    }
  } catch (e) {
    return { status: 'error', message: e.message, name: officer.name };
  }
  if (hits.length === 0) {
    return { status: 'no_candidates', tried: { full: norm.stripped, surname: norm.surname } };
  }

  // Score every hit and rank.
  const scored = hits.map((h) => scoreCandidate(h, officer, norm));
  scored.sort((a, b) => b.score - a.score);
  const top = scored[0];
  const tied = scored.filter((s) => s.score === top.score);

  // Single top → matched.
  if (tied.length === 1) {
    const m = top.hit;
    return {
      status: 'matched',
      member: {
        id: m.id,
        name: m.nameDisplayAs,
        party: m.latestParty?.name,
        partyAbbr: m.latestParty?.abbreviation,
        house: houseFromHit(m),
        constituency: m.latestHouseMembership?.membershipFrom || null,
      },
      score: { value: top.score, ...top.breakdown, totalHits: hits.length },
    };
  }

  // Tie — try one tie-break: keep only currently-sitting members.
  // APPG officers must be sitting, so a non-current candidate is
  // almost always a historic namesake.
  const currents = tied.filter((s) => s.breakdown.isCurrent);
  if (currents.length === 1) {
    const m = currents[0].hit;
    return {
      status: 'matched',
      member: {
        id: m.id,
        name: m.nameDisplayAs,
        party: m.latestParty?.name,
        partyAbbr: m.latestParty?.abbreviation,
        house: houseFromHit(m),
        constituency: m.latestHouseMembership?.membershipFrom || null,
      },
      score: { value: currents[0].score, ...currents[0].breakdown, totalHits: hits.length, tieBreak: 'current-only' },
    };
  }

  // Genuinely ambiguous — emit all tied candidates.
  return {
    status: 'ambiguous',
    candidates: tied.map((s) => ({
      id: s.hit.id,
      name: s.hit.nameDisplayAs,
      party: s.hit.latestParty?.name,
      house: houseFromHit(s.hit),
      constituency: s.hit.latestHouseMembership?.membershipFrom || null,
      isCurrent: s.breakdown.isCurrent,
      score: s.score,
    })),
    score: { totalHits: hits.length, tied: tied.length, top: top.score },
  };
}

// ---------------------------------------------------------------
// Wikidata fallback (operator-side)
// ---------------------------------------------------------------
//
// Wikidata items for UK politicians carry property P2031 — "UK
// Parliament identifier" — which is the MNIS id we want. This
// function searches Wikidata for the name, fetches each candidate
// item, and reports the P2031 + P102 (party) values where present.
// Use it only when resolveOfficer returns 'no_candidates' or
// 'ambiguous' AND you have egress to www.wikidata.org.

const WD_API = 'https://www.wikidata.org/w/api.php';

export async function lookupWikidata(name, ctx = {}) {
  // Step 1: search.
  const sParams = new URLSearchParams({
    action: 'wbsearchentities', search: name, language: 'en',
    type: 'item', format: 'json', limit: '5',
  });
  const sRes = await rawFetch(`${WD_API}?${sParams}`, { method: 'GET' },
    { ...ctx, accept: 'application/json' });
  const candidates = sRes.body?.search || [];
  if (candidates.length === 0) return { status: 'no_candidates' };

  // Step 2: fetch claims for each candidate in one round-trip.
  const ids = candidates.map((c) => c.id).join('|');
  const eParams = new URLSearchParams({
    action: 'wbgetentities', ids, props: 'claims|labels|descriptions',
    languages: 'en', format: 'json',
  });
  const eRes = await rawFetch(`${WD_API}?${eParams}`, { method: 'GET' },
    { ...ctx, accept: 'application/json' });
  const ents = eRes.body?.entities || {};

  // Pull P2031 (MNIS id) and P102 (party) where present.
  const out = [];
  for (const c of candidates) {
    const ent = ents[c.id];
    const claims = ent?.claims || {};
    const p2031 = claims.P2031?.[0]?.mainsnak?.datavalue?.value || null;
    const p102 = claims.P102?.[0]?.mainsnak?.datavalue?.value?.id || null;
    out.push({
      qid: c.id,
      label: c.label,
      description: c.description || ent?.descriptions?.en?.value || null,
      mnisId: p2031 ? Number(p2031) : null,
      partyQid: p102,
    });
  }
  return { status: out.some((o) => o.mnisId != null) ? 'matched' : 'ambiguous', candidates: out };
}
