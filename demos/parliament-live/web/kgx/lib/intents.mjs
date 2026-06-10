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
// Plan action kinds:
//   { kind: 'url',     href }                  — open in a new tab
//   { kind: 'copy',    text }                  — clipboard write
//   { kind: 'post',    href, body,             — HTTP POST (e.g. save chain
//      contentType, successStatus }              to the FPKG chain store)
//   { kind: 'focus',   beadIdx }               — page-only: set focusIdx +
//                                                flip to the content pane
//   { kind: 'undo-to', beadIdx }               — page-only: discard every
//                                                bead after beadIdx
//
// The PAGE chooses the dispatch UI; the CLI just `console.log`s the plan.
// =============================================================================

import { chainToTrig } from './trig.mjs';
import { buildSaveUpdate } from './chain-store.mjs';

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
    // Persist the chain into the fpkg writable Oxigraph side store, one
    // named graph per chain (urn:kgx:flow:<uuid>). The save endpoint is
    // /kgx/chains-update and accepts application/sparql-update. Same
    // RDF the "Copy as TriG" intent emits — just routed through a
    // DROP SILENT + INSERT DATA so re-saves replace cleanly.
    id: 'save-to-fpkg',
    label: 'Save to FPKG (named graph in the kg)',
    icon: '💾',
    scope: 'bundle',
    applicable: (_bd, ctx) => !!ctx?.chainSpec,
    plan: (_bd, ctx) => {
      // Stamp the spec with a title and a creation timestamp so the chain
      // list endpoint can sort by recency and surface a human-readable
      // label without forcing the user to name the chain first.
      const stamped = { ...ctx.chainSpec, _ts: new Date().toISOString() };
      const trig = chainToTrig(stamped);
      const body = buildSaveUpdate(trig);
      return {
        kind: 'post',
        href: '/kgx/chains-update',
        contentType: 'application/sparql-update',
        body,
        successStatus: 204,
      };
    },
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
// Bead intents — applicable to a specific bead in the active chain. ctx
// carries { bead, beadIdx, chainSpec, permalink, prefixSpec, prefixPermalink,
// totalBeads }, where prefixSpec is the chain truncated AT this bead (one
// step less than the full chain when this is the frontier; the trimmed
// chain for any older bead). prefixPermalink is the share-URL form of
// prefixSpec — handy for "send this earlier point to a collaborator".
// ---------------------------------------------------------------------------

const BEAD_INTENTS = [
  {
    id: 'bead-focus-here',
    label: 'Focus this bead in tiles / pivot / map',
    icon: '📌',
    scope: 'bead',
    applicable: (_b, ctx) => !!ctx?.bead,
    // Plan returns kind:'focus' so the page knows to set state.focusIdx
    // + flip to the content pane. CLI consumers (if any) treat it as a
    // noop — there's no analog there.
    plan: (_b, ctx) => ({ kind: 'focus', beadIdx: ctx.beadIdx }),
  },
  {
    id: 'bead-copy-permalink',
    label: 'Copy permalink to this point',
    icon: '🔗',
    scope: 'bead',
    applicable: (_b, ctx) => !!ctx?.prefixPermalink,
    plan: (_b, ctx) => ({ kind: 'copy', text: ctx.prefixPermalink }),
  },
  {
    id: 'bead-copy-prefix-spec',
    label: 'Copy chain prefix (JSON)',
    icon: '{}',
    scope: 'bead',
    applicable: (_b, ctx) => !!ctx?.prefixSpec,
    plan: (_b, ctx) => ({ kind: 'copy', text: JSON.stringify(ctx.prefixSpec, null, 2) }),
  },
  {
    id: 'bead-copy-trig',
    label: 'Copy this point as TriG',
    icon: '⏧',
    scope: 'bead',
    applicable: (_b, ctx) => !!ctx?.prefixSpec,
    plan: (_b, ctx) => ({ kind: 'copy', text: chainToTrig(ctx.prefixSpec) }),
  },
  {
    id: 'bead-undo-to-here',
    label: 'Discard every bead after this one',
    icon: '↺',
    scope: 'bead',
    // Frontier doesn't need an "undo to here" — it's already the end.
    applicable: (_b, ctx) => !!ctx?.bead && ctx.beadIdx < (ctx.totalBeads - 1),
    plan: (_b, ctx) => ({ kind: 'undo-to', beadIdx: ctx.beadIdx }),
  },
];

// ---------------------------------------------------------------------------
// Public surface.
// ---------------------------------------------------------------------------

export const INTENTS = {
  entity: ENTITY_INTENTS,
  bundle: BUNDLE_INTENTS,
  bead:   BEAD_INTENTS,
};

export function entityIntentsFor(item) {
  return ENTITY_INTENTS.filter((i) => i.applicable(item));
}

export function bundleIntentsFor(bundle, ctx) {
  return BUNDLE_INTENTS.filter((i) => i.applicable(bundle, ctx));
}

export function beadIntentsFor(bead, ctx) {
  return BEAD_INTENTS.filter((i) => i.applicable(bead, ctx));
}
