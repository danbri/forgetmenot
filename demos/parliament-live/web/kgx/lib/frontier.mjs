// =============================================================================
// kgx/lib/frontier.mjs — "what can I do with THIS bundle, right now?"
//
// The daisychain's frontier bead shows, for the live bundle, which chips
// are worth tapping: a `party` picker only when items carry parties, a
// `sitting` toggle only when some (not all) items sit, the facet counts
// inside each picker. Those `relevant(b)` / `values(b)` closures live in
// the page's OPS table. This module computes the same thing from the data
// shape alone — no per-op metadata, so it cannot drift from the page the
// way the has-coord / pivot-am op tables did.
//
// `frontierOf(bundle)` classifies every field the items actually carry:
//
//   * facet     — low-cardinality (2..FACET_MAX distinct): sliceable into
//                 named buckets (party → {Labour 199, Conservative 121, …},
//                 decade, country, gender). The explorer picks a value.
//   * presence  — high-cardinality or boolean, held by SOME but not all
//                 items (coords, image, sitting, comingIntoForce): the
//                 useful move is "keep the ones that have it".
//   * uniform   — every item shares one value: not sliceable, reported so
//                 the explorer knows it's a dead end, not an oversight.
//
// Pure + framework-free: same answer in Node, the browser, and a test.
// =============================================================================

// Fields that identify an item rather than describe it — never offered as a
// slice at all. (`uri`/`label` are identity+display; `mpid` is a join key.)
const IDENTITY_FIELDS = new Set(['uri', 'label', 'mpid', 'id']);

// Fields whose only useful operation is "keep the items that have one",
// regardless of cardinality — slicing into individual coordinates or image
// URLs is meaningless. These back the daisychain's has-coord / has-img chips
// and so are always classified as presence (never faceted), and only when a
// strict subset carries them (if everyone does, the filter is a no-op).
const PRESENCE_ONLY = new Set(['coords', 'image']);

// A field with more than this many distinct values is treated as presence
// (has-it / not) rather than a pick-one facet — slicing into 80 buckets is
// not exploration. Coords, free-text and the like land here.
const FACET_MAX = 40;

export function frontierOf(bundle) {
  const items = bundle?.items || [];
  const n = items.length;

  // First pass: per-field presence count + value histogram.
  const fields = new Map(); // field -> { present, isArray, values: Map<v,count> }
  for (const it of items) {
    for (const [k, v] of Object.entries(it || {})) {
      if (IDENTITY_FIELDS.has(k)) continue;
      if (v === null || v === undefined || v === '' || v === false) continue;
      let rec = fields.get(k);
      if (!rec) { rec = { present: 0, isArray: false, values: new Map() }; fields.set(k, rec); }
      rec.present++;
      if (Array.isArray(v)) {
        rec.isArray = true;
        for (const x of v) if (x != null && x !== '') rec.values.set(x, (rec.values.get(x) || 0) + 1);
      } else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        rec.values.set(v, (rec.values.get(v) || 0) + 1);
      }
      // objects (nested shapes) are counted for presence but not faceted.
    }
  }

  const facets = [];
  const presence = [];
  const uniform = [];

  for (const [field, rec] of fields) {
    const distinct = rec.values.size;
    const everyone = rec.present === n;

    if (PRESENCE_ONLY.has(field)) {
      // has-coord / has-img: only worth offering when a strict subset has it.
      if (rec.present > 0 && !everyone) presence.push({ field, present: rec.present, absent: n - rec.present });
      continue;
    }

    if (distinct >= 2 && distinct <= FACET_MAX) {
      facets.push({
        field,
        multi: rec.isArray,                  // one item can match several buckets
        distinct,
        coversAll: everyone,                 // false ⇒ slicing also drops the field-less
        values: [...rec.values.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20)
          .map(([value, count]) => ({ value, count })),
      });
    } else if (distinct <= 1 && !everyone && rec.present > 0) {
      // boolean-ish flag held by a strict subset (sitting, comingIntoForce).
      presence.push({ field, present: rec.present, absent: n - rec.present });
    } else if (distinct > FACET_MAX && rec.present > 0 && !everyone) {
      // high-cardinality but optional (coords on some, not all): the move is
      // "keep the located ones", not pick-a-coordinate.
      presence.push({ field, present: rec.present, absent: n - rec.present });
    } else if (distinct === 1 && everyone) {
      uniform.push({ field, value: [...rec.values.keys()][0] });
    }
  }

  // Stable, useful ordering: biggest splits first.
  facets.sort((a, b) => b.distinct - a.distinct || a.field.localeCompare(b.field));
  presence.sort((a, b) => b.present - a.present || a.field.localeCompare(b.field));
  uniform.sort((a, b) => a.field.localeCompare(b.field));

  return { type: bundle?.type || null, size: n, label: bundle?.label || null,
           facets, presence, uniform };
}
