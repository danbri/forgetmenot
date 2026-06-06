// Unit tests for the SHACL checker glue — browser/shacl-check.js.
// Loads the rebuilt schemarama bundle into globalThis.schemarama (the glue
// reads it from there), then exercises parse / validateStore / check offline.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Expose the bundle as globalThis.schemarama for the glue (which is browser-shaped).
const code = readFileSync(new URL('../../browser/third_party/schemarama.bundle.min.js', import.meta.url), 'utf8');
const sb = { window: {}, self: {}, console, process, TextEncoder, TextDecoder, URL, setTimeout, clearTimeout, btoa, atob };
sb.globalThis = sb; vm.createContext(sb);
vm.runInContext(code + ';globalThis.__s = schemarama;', sb);
globalThis.schemarama = sb.__s;

const { parse, validateStore, check } = await import('../../browser/shacl-check.js');

const SHAPES_MAXCOUNT = `@prefix sh: <http://www.w3.org/ns/shacl#> . @prefix ex: <http://ex/> .
ex:PaperShape a sh:NodeShape ; sh:targetClass ex:Paper ;
  sh:property [ sh:path ex:precededBy ; sh:maxCount 1 ; sh:message "at most one preceding paper" ] .`;

test('validateStore surfaces the focus node and the offending values', async () => {
  const store = await parse(`@prefix ex: <http://ex/> .
    ex:p1 a ex:Paper ; ex:precededBy ex:a , ex:b .
    ex:p2 a ex:Paper ; ex:precededBy ex:c .`);
  const res = await validateStore(store, SHAPES_MAXCOUNT);
  assert.equal(res.conforms, false);
  assert.equal(res.failures.length, 1);
  const f = res.failures[0];
  assert.equal(f.focus, 'http://ex/p1');                 // which entity failed
  assert.equal(f.path, 'http://ex/precededBy');
  assert.deepEqual(new Set(f.values), new Set(['http://ex/a', 'http://ex/b'])); // the two papers
  assert.equal(f.severity, 'error');
});

test('clean data conforms', async () => {
  const res = await validateStore(
    await parse(`@prefix ex: <http://ex/> . ex:p a ex:Paper ; ex:precededBy ex:a .`),
    SHAPES_MAXCOUNT);
  assert.equal(res.conforms, true);
  assert.equal(res.failures.length, 0);
});

test('sh:Warning maps to warning severity; minCount breach has empty values', async () => {
  const res = await validateStore(
    await parse(`@prefix ex: <http://ex/> . ex:x a ex:T .`),
    `@prefix sh: <http://www.w3.org/ns/shacl#> . @prefix ex: <http://ex/> .
     ex:S a sh:NodeShape ; sh:targetClass ex:T ;
       sh:property [ sh:path ex:n ; sh:minCount 1 ; sh:severity sh:Warning ; sh:message "needs n" ] .`);
  assert.equal(res.conforms, false);
  assert.equal(res.failures[0].severity, 'warning');
  assert.equal(res.failures[0].focus, 'http://ex/x');
  assert.deepEqual(res.failures[0].values, []);          // nothing present at the path
});

test('check() extracts via an injected fetch, then validates', async () => {
  globalThis.fetch = async () => ({ ok: true, status: 200,
    text: async () => `@prefix ex: <http://ex/> . ex:p1 a ex:Paper ; ex:precededBy ex:a , ex:b .` });
  const res = await check('CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }', SHAPES_MAXCOUNT, { endpoint: 'http://x/sparql' });
  assert.equal(res.failures.length, 1);
  assert.equal(res.failures[0].focus, 'http://ex/p1');
});
