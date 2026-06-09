// =============================================================================
// kgx/lib/intents.mjs — Android-style intent dispatch for the kgx pages.
//
// An INTENT is a named action applicable to an entity (a single item from a
// bundle) or to a bundle/chain (the whole list, or the daisychain itself).
// Each intent declares whether it can fire on a given target, and the side
// effect to run when it does — open an external URL, copy something to the
// clipboard, build a CLI command, etc.
//
// The registry is pure data + pure predicates; the side-effect step is the
// only impure bit, and is small enough to inline. The lib doesn't touch
// `window` / `navigator`; the runner closures do. That's so this module is
// importable from the CLI and node tests without a DOM shim.
//
// Shape:
//   {
//     id, label, icon,
//     scope: 'entity' | 'bundle',
//     applicable: (target, ctx?) -> boolean,
//     // Returns one of:
//     //   { kind: 'url',  href }    — open in a new tab
//     //   { kind: 'copy', text }    — clipboard write
//     //   { kind: 'noop' }          — already had its effect during plan()
//     plan: (target, ctx) -> action
//   }
//
// `ctx` for entity intents is { bundle } (the source bundle); for bundle
// intents it's { chainSpec, permalink, kgxId } (the saved chain context).
//
// The PAGE chooses the dispatch UI; the CLI just `console.log`s the plan.
// =============================================================================

import { chainToTrig } from './trig.mjs';

// ---------------------------------------------------------------------------
// Entity intents — applicable to a single thing.
// ---------------------------------------------------------------------------

const wdQid = (it) => {
  const m = String(it?.uri || '').match(/\/(Q\d+)$/);
  return m ? m[1] : null;
};

const ENTITY_INTENTS = [
  {
    id: 'open-wikidata',
    label: 'View on Wikidata',
    icon: '⌖',
    scope: 'entity',
    applicable: (it) => !!wdQid(it),
    plan: (it) => ({ kind: 'url', href: `https://www.wikidata.org/wiki/${wdQid(it)}` }),
  },
  {
    id: 'open-wikipedia',
    label: 'View on Wikipedia',
    icon: '📖',
    scope: 'entity',
    // Heuristic: prefer the canonical URI when it's a wikipedia URL; for
    // Wikidata QIDs use the Special:GoToLinkedPage that wikipedia redirects
    // via the wikidata sitelink. Not exact but doesn't pretend otherwise.
    applicable: (it) => !!wdQid(it),
    plan: (it) => ({
      kind: 'url',
      href: `https://en.wikipedia.org/wiki/Special:GoToLinkedPage?wikidata_id=${wdQid(it)}&site=enwiki`,
    }),
  },
  {
    id: 'show-on-osm',
    label: 'Show on OpenStreetMap',
    icon: '🗺',
    scope: 'entity',
    applicable: (it) => !!(it?.coords?.lat != null && it?.coords?.lon != null),
    plan: (it) => ({
      kind: 'url',
      href: `https://www.openstreetmap.org/?mlat=${it.coords.lat}&mlon=${it.coords.lon}#map=10/${it.coords.lat}/${it.coords.lon}`,
    }),
  },
  {
    id: 'open-twfy',
    label: 'View on TheyWorkForYou',
    icon: '🏛',
    scope: 'entity',
    applicable: (it) => !!it?.mpid,
    plan: (it) => ({ kind: 'url', href: `https://www.theyworkforyou.com/mp/${it.mpid}/` }),
  },
  {
    id: 'open-hansard',
    label: 'Search Hansard for this MP',
    icon: '🗣',
    scope: 'entity',
    // The Hansard search UI takes a member id as a member.id= query param;
    // pre-loads their contributions list. Confirmed against the search
    // endpoint shape, not the API — the page works for unauthed users.
    applicable: (it) => !!it?.mpid,
    plan: (it) => ({
      kind: 'url',
      href: `https://hansard.parliament.uk/search/Contributions?searchTerm=&memberId=${it.mpid}`,
    }),
  },
  {
    id: 'open-canonical-uri',
    label: 'Open canonical URI',
    icon: '↗',
    scope: 'entity',
    applicable: (it) => !!it?.uri,
    plan: (it) => ({ kind: 'url', href: it.uri }),
  },
  {
    id: 'copy-label',
    label: 'Copy label',
    icon: '⎘',
    scope: 'entity',
    applicable: (it) => !!it?.label,
    plan: (it) => ({ kind: 'copy', text: it.label }),
  },
  {
    id: 'copy-uri',
    label: 'Copy URI',
    icon: '⎘',
    scope: 'entity',
    applicable: (it) => !!it?.uri,
    plan: (it) => ({ kind: 'copy', text: it.uri }),
  },
];

// ---------------------------------------------------------------------------
// Bundle / chain intents — applicable to the whole list or the saved chain.
// ---------------------------------------------------------------------------

const BUNDLE_INTENTS = [
  {
    id: 'copy-permalink',
    label: 'Copy chain permalink',
    icon: '🔗',
    scope: 'bundle',
    applicable: (_bd, ctx) => !!ctx?.permalink,
    plan: (_bd, ctx) => ({ kind: 'copy', text: ctx.permalink }),
  },
  {
    id: 'copy-spec',
    label: 'Copy chain spec (JSON)',
    icon: '{}',
    scope: 'bundle',
    applicable: (_bd, ctx) => !!ctx?.chainSpec,
    plan: (_bd, ctx) => ({ kind: 'copy', text: JSON.stringify(ctx.chainSpec, null, 2) }),
  },
  {
    id: 'copy-trig',
    label: 'Copy as TriG (RDF manifest)',
    icon: '⏧',
    scope: 'bundle',
    applicable: (_bd, ctx) => !!ctx?.chainSpec,
    plan: (_bd, ctx) => ({ kind: 'copy', text: chainToTrig(ctx.chainSpec) }),
  },
  {
    id: 'copy-kgx-cli',
    label: 'Copy as `kgx chain run` command',
    icon: '⌨',
    scope: 'bundle',
    // Always emittable — for ad-hoc chains we use -f /dev/stdin << JSON;
    // for library chains the --library short form.
    applicable: (_bd, ctx) => !!ctx?.chainSpec,
    plan: (_bd, ctx) => ({
      kind: 'copy',
      text: ctx.kgxId
        ? `kgx chain run --library ${ctx.kgxId}`
        : `cat <<'EOF' | node bin/kgx.mjs chain run -f /dev/stdin\n${JSON.stringify(ctx.chainSpec)}\nEOF`,
    }),
  },
];

// ---------------------------------------------------------------------------
// Public surface.
// ---------------------------------------------------------------------------

export const INTENTS = {
  entity: ENTITY_INTENTS,
  bundle: BUNDLE_INTENTS,
};

export function entityIntentsFor(item) {
  return ENTITY_INTENTS.filter((i) => i.applicable(item));
}

export function bundleIntentsFor(bundle, ctx) {
  return BUNDLE_INTENTS.filter((i) => i.applicable(bundle, ctx));
}
