// =============================================================================
// kgx/lib/restrict.mjs — the pure-client restrict primitives
//
// These are the "filter chips" the daisychain/pivcab pages surface as a
// palette under `OPS[bundle.type]`. They take a Bundle in, return a smaller
// (or equal-size) Bundle of the SAME type — no engine call, no Source bead.
//
// In the implicit op-node API (see rel-templates.mjs):
//
//   Bundle<T> ─── restrict ──► Bundle<T>     (this file)
//   Bundle<T> ─── pivot    ──► Bundle<U>     (rel-templates.mjs)
//   Bundle<T> × Bundle<T> ─► combine ──► Bundle<T>   (Bundle.union/...)
//
// Lifted to a library so the upcoming runChainSpec() can interpret a
// saved chain's `{ kind: 'op', op: 'party', value: '...' }` steps without
// being inside the browser DOM, and so unit tests can pin each filter's
// behaviour on a fixed Bundle without setting up an HTTP layer.
//
// `opFilters` is the registry keyed by the op id used in the chain JSON:
//   { id: 'party',   run: (b, v) => Bundle }
//   { id: 'decade',  run: (b, v) => Bundle }
//   { id: 'sitting', run: (b)    => Bundle }
//   { id: 'bridged', run: (b)    => Bundle }
//
// Gender / citizenship / name-contains / top-counts etc. land here in a
// follow-up commit when the broader OPS table is extracted; they have
// inline run() functions in the page today rather than going through this
// helper.
// =============================================================================

import { Bundle } from './node-flow.mjs';

// ---------------------------------------------------------------------------
// Filter registry — used directly by daisychain's OPS[].run(), and by the
// chain interpreter that walks { kind: 'op', op: <id>, value? } steps.
//
// All entries are pure functions Bundle<T> → Bundle<T>: no engine call,
// no DOM, no side effects (the legacy `_opNote` stash is dropped — the
// page's source-bead UI now reads counts from the Source, not the
// bundle).
//
// Type-specific ops (e.g. `by-mp-party` only makes sense on a
// `constituency` bundle) live here regardless of type. The runner
// matches on op id only; an op applied to the wrong bundle type yields
// an empty bundle, which surfaces in the UI as a visible-broken
// "no items match" state — by design (CLAUDE.md rule 11, honesty).
// ---------------------------------------------------------------------------

// Gender resolver shared by daisychain's picker UI and the lib runner.
// The picker offers two ROW shapes:
//   "female (exact P21)"             → exact match on item.gender
//   "female (+ first-name heuristic)" → exact OR nameGender(label) match
// Legacy LIBRARY entries used plain 'female' / 'male' — treated as exact.
function genderFilter(b, v) {
  const legacy = (v === 'female' || v === 'male');
  const m = legacy ? [null, v] : v.match(/^(female|male)\b/);
  const g = m?.[1];
  if (!g) return new Bundle([], b.type, `${b.label} · ${v}`);
  const useHeuristic = /heuristic/.test(v);
  const filtered = b.items.filter((x) =>
    x.gender === g ||
    (useHeuristic && !x.gender && nameGender(x.label) === g));
  return new Bundle(filtered, b.type, `${b.label} · ${v}`);
}

export const opFilters = {
  // --- human bundles ---
  party:       (b, v) => new Bundle(b.items.filter((x) => x.parties?.includes(v)), b.type, v),
  decade:      (b, v) => new Bundle(b.items.filter((x) => x.decade === v),          b.type, v + ' '),
  sitting:     (b)    => new Bundle(b.items.filter((x) => x.sitting),               b.type, 'sitting now'),
  bridged:     (b)    => new Bundle(b.items.filter((x) => !!x.mpid),                b.type, 'has Members API id'),
  gender:      genderFilter,
  citizenship: (b, v) => new Bundle(b.items.filter((x) => (x.citizenships || []).includes(v)), b.type, `cit:${v}`),

  // --- constituency bundles ---
  'has-origin': (b) => new Bundle(
    [...b.items].sort((a, b2) => (b2.originCount || 0) - (a.originCount || 0)).slice(0, 50),
    b.type, `${b.label} · top 50`),
  'by-mp-party': (b, v) => new Bundle(
    b.items.filter((x) => x.currentMpParty === v),
    b.type, `${b.label} · MP party=${v}`),

  // --- party bundles ---
  'in-commons': (b) => new Bundle(b.items.filter((x) => (x.commonsCount || 0) > 0), b.type, `${b.label} · with Commons MPs`),
  'in-lords':   (b) => new Bundle(b.items.filter((x) => (x.lordsCount   || 0) > 0), b.type, `${b.label} · with Lords peers`),
  'top-by-size': (b) => new Bundle(
    [...b.items].sort((a, b2) => (b2.originCount || 0) - (a.originCount || 0)).slice(0, 25),
    b.type, `${b.label} · top 25`),

  // --- appg bundles ---
  'top-by-officer-count': (b) => new Bundle(
    [...b.items].sort((a, b2) => (b2.originCount || 0) - (a.originCount || 0)).slice(0, 50),
    b.type, `${b.label} · top 50`),

  // --- formal_body / concept bundles ---
  'name-contains': (b, v) => new Bundle(
    b.items.filter((x) => new RegExp(v, 'i').test(x.label || '')),
    b.type, `${b.label} · "${v}"`),

  // --- generic data-shape filters (apply to any bundle whose items
  //     carry a `coords` or `image` field — used by daisychain's
  //     wd_thing / building / place / org chip palettes).
  'has-coord': (b) => new Bundle(
    b.items.filter((x) => x.coords),
    b.type, `${b.label} · located`),
  'has-img': (b) => new Bundle(
    b.items.filter((x) => x.image),
    b.type, `${b.label} · with photo`),
};

// ---------------------------------------------------------------------------
// First-name → gender heuristic dictionary.
// Used as a FALLBACK when an item has no explicit `gender` (Wikidata P21).
// Never silently merged with authoritative gender values — the OPS picker
// surfaces "(exact P21)" vs "(+ first-name heuristic)" rows separately.
//
// Names that are commonly used for more than one gender in UK politics
// (Alex, Sam, Chris, Pat, Jamie, Lee, Robin, Kim, Jo, Bobby, Jordan,
// Kit, Morgan, Taylor, Leslie, Leigh) are deliberately absent from both
// sets so the heuristic returns null rather than guessing. Audited
// against the dictionary in the test suite — see
// tests/unit/kgx-restrict.test.mjs "GENDER_NAMES_* share no entries".
// ---------------------------------------------------------------------------
export const GENDER_NAMES_FEMALE = new Set([
  'abigail','aisha','alice','alison','allison','amanda','amy','angela','ann','anna','anne','annette',
  'apsana','barbara','beatrice','beth','bridget','carla','carol','caroline','catherine','charlotte',
  'cherilyn','christine','claire','clare','connie','cynthia','daisy','dawn','deborah','debbie',
  'diana','diane','dorothy','eleanor','elizabeth','ellie','emily','emma','esther','eve','feryal',
  'fiona','flick','florence','frances','geraldine','gillian','grace','hannah','harriet','hazel',
  'heather','helen','helena','henrietta','hilary','holly','imogen','isabel','jacqueline','jane',
  'janet','jean','jenna','jennifer','jess','jessica','joan','joanna','joanne','judith','julia',
  'julie','justine','karen','karin','kate','katherine','kathleen','kathryn','katie','kelly',
  'kerry','laura','lauren','lesley','linda','lisa','liz','lola','lorna','louise',
  'lucy','lyn','lynne','margaret','maria','marie','marion','marjorie','martha','mary','maureen',
  'megan','meg','melanie','michelle','miriam','mona','nadia','naomi','natalie','nia','nicola',
  'norma','olivia','pamela','patricia','paula','pauline','penelope','phyllis','polly','preet',
  'priti','rachael','rachel','rebecca','rosemary','rosie','ruth','sally','samantha','sara',
  'sarah','seema','sharon','sheryll','shirley','siobhan','sonia','sophia','sophie','stella',
  'stephanie','susan','susanna','suzanne','sylvia','tabitha','tammy','tamara','tania','tessa',
  'theresa','therese','toni','tracey','tracy','tulip','valerie','vanessa','vicki','victoria',
  'virginia','wera','yasmin','yvette','yvonne','zara','zarah','zoe',
]);
export const GENDER_NAMES_MALE = new Set([
  'aaron','adam','adrian','afzal','alan','albert','alec','alexander','alfred','alistair',
  'alok','andrew','andy','angus','anthony','antony','archibald','arthur','asim','baillie','barry',
  'ben','benjamin','bernard','bill','bob','boris','brendan','brian','bruce','bryan','callum',
  'carl','cecil','charles','christopher','clive','colin','conor','craig','damian','daniel','danny',
  'darren','dave','david','dean','dennis','derek','desmond','dominic','donald','douglas','drew',
  'duncan','edward','elliot','eric','ernest','euan','felix','fred','frederick','gareth','gary',
  'gavin','geoff','geoffrey','george','gerald','gerry','glyn','gordon','graham','grahame','grant',
  'greg','gregory','guy','harold','harry','harvey','henry','herbert','howard','hugh','hugo','iain',
  'ian','ivan','jack','jacob','james','jason','jeff','jeffrey','jeremy','jim','joe',
  'joel','john','johnny','jonathan','joseph','joshua','julian','justin','keith','ken','kenneth',
  'kenny','kevin','kieran','kris','kwasi','laurence','lawrence','layla','leo','leonard','lewis',
  'liam','lincoln','lloyd','luke','malcolm','marcus','mark','martin',
  'martyn','matt','matthew','maurice','max','michael','mick','mike','miles','mohammad','mohammed',
  'nathan','neil','nicholas','nick','nigel','noah','norman','oliver','oscar','owen','patrick',
  'paul','peter','philip','phillip','quentin','ralph','randall','randolph','ray','raymond','rees',
  'reggie','reg','rhodri','richard','rick','rob','robert','roderick','rodney','roger','ronald',
  'ross','roy','rupert','russell','samuel','scott','sean','sebastian','sid','sidney','simon',
  'stephen','steve','steven','stewart','stuart','syed','taj','tam','terence','terry','tim',
  'timothy','tobias','toby','tom','tony','trevor','vince','vincent','virendra','wally','walter',
  'wayne','wes','will','william','zac',
]);

export function nameGender(label) {
  if (!label) return null;
  const first = String(label).trim().split(/[\s.,]+/)[0]?.toLowerCase();
  if (!first) return null;
  if (GENDER_NAMES_FEMALE.has(first)) return 'female';
  if (GENDER_NAMES_MALE.has(first))   return 'male';
  return null;
}

// ---------------------------------------------------------------------------
// Tiny aggregators used by the OPS picker rows. Pure and live here so the
// runner / tests don't drag in the page's UI code just to count facets.
// ---------------------------------------------------------------------------
export function countBy(items, field) {
  const m = new Map();
  for (const x of items) {
    const v = x[field];
    if (v) m.set(v, (m.get(v) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export function sortByKey(pairs) {
  return [...pairs].sort((a, b) => a[0].localeCompare(b[0]));
}

export function topCounts(strs) {
  const m = new Map();
  for (const s of strs) m.set(s, (m.get(s) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
}
