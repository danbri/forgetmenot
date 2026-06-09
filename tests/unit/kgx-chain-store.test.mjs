// Pure unit tests for the chain-store SPARQL helpers. No live Oxigraph
// dependency — the helpers are string assembly + bindings parsing.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  flowIriOfTrig, buildSaveUpdate, buildListQuery, parseChainList, buildLoadQuery,
} from '../../demos/parliament-live/web/kgx/lib/chain-store.mjs';
import { chainToTrig } from '../../demos/parliament-live/web/kgx/lib/trig.mjs';

const flatSpec = {
  title: 'Demo chain',
  steps: [
    { kind: 'starter', id: 'uk-mps-1900' },
    { kind: 'op', op: 'sitting' },
  ],
};

test('flowIriOfTrig — extracts the urn:kgx:flow IRI a manifest carries', () => {
  const trig = chainToTrig(flatSpec);
  const iri = flowIriOfTrig(trig);
  assert.ok(/^urn:kgx:flow:/.test(iri), `expected urn:kgx:flow:…, got ${iri}`);
});

test('flowIriOfTrig — null on a manifest without one (defensive)', () => {
  assert.equal(flowIriOfTrig('@prefix dct: <http://purl.org/dc/terms/> .'), null);
  assert.equal(flowIriOfTrig(''),   null);
  assert.equal(flowIriOfTrig(null), null);
});

test('buildSaveUpdate — produces DROP SILENT + INSERT DATA into the correct GRAPH', () => {
  const trig = chainToTrig(flatSpec);
  const upd  = buildSaveUpdate(trig);
  const flow = flowIriOfTrig(trig);
  assert.match(upd, /^PREFIX kgx:/m,             'must hoist the @prefix lines to SPARQL PREFIX form');
  assert.match(upd, new RegExp(`DROP SILENT GRAPH <${flow}>`),
    'must DROP the graph first so re-save is a clean replace');
  assert.match(upd, new RegExp(`INSERT DATA \\{\\s*GRAPH <${flow}>`),
    'must INSERT DATA into the same named graph');
  // The manifest's dct:title triple should survive into the inner block.
  assert.match(upd, /dct:title "Demo chain"/);
  assert.doesNotMatch(upd, /^@prefix/m, 'no stray @prefix lines should remain in the update');
});

test('buildSaveUpdate — throws when there is no flow IRI', () => {
  assert.throws(() => buildSaveUpdate('not a trig manifest'),
    /no urn:kgx:flow: IRI in manifest/);
});

test('buildSaveUpdate — throws when the TriG body is malformed', () => {
  // Only the prefix block, no graph body. The save would write nothing,
  // so we'd rather error than silently no-op.
  const bad = chainToTrig(flatSpec).replace(/\{[\s\S]*\}/, '');
  assert.throws(() => buildSaveUpdate(bad),
    /TriG body must end with <flowIri> \{ \.\.\. \}/);
});

test('buildListQuery — a SPARQL SELECT keyed on the flow IRI prefix', () => {
  const q = buildListQuery();
  assert.match(q, /SELECT \?flow \?title \?id \?ts/);
  assert.match(q, /STRSTARTS\(STR\(\?flow\), "urn:kgx:flow:"\)/,
    'filter must scope to chain graphs, ignoring any other named graphs');
  assert.match(q, /ORDER BY DESC\(\?ts\) \?title/,
    'newest first; title as tiebreaker for chains without a ts');
});

test('parseChainList — pulls plain {flowIri,title,id,ts} from bindings', () => {
  const bindings = [
    { flow: { value: 'urn:kgx:flow:1' }, title: { value: 'A' }, id: { value: 'a-id' }, ts: { value: '2026-01-01' } },
    { flow: { value: 'urn:kgx:flow:2' }, title: { value: 'B' } },
  ];
  const out = parseChainList(bindings);
  assert.deepEqual(out, [
    { flowIri: 'urn:kgx:flow:1', title: 'A', id: 'a-id', ts: '2026-01-01' },
    { flowIri: 'urn:kgx:flow:2', title: 'B', id: null,   ts: null },
  ]);
});

test('parseChainList — survives empty + null inputs', () => {
  assert.deepEqual(parseChainList(null), []);
  assert.deepEqual(parseChainList([]),   []);
});

test('buildLoadQuery — CONSTRUCT all triples in the named graph', () => {
  const flow = 'urn:kgx:flow:abc-123';
  const q = buildLoadQuery(flow);
  assert.match(q, new RegExp(`GRAPH <${flow}>`));
  assert.match(q, /CONSTRUCT \{ \?s \?p \?o \}/);
});

test('buildLoadQuery — refuses non-flow IRIs', () => {
  assert.throws(() => buildLoadQuery('http://example.org/foo'),
    /not a flow IRI/);
});
