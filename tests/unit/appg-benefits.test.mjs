// Regression test for benefits-panel parsing on real Register pages.
//
// Fixtures captured 2026-05-27 from the live publications.parliament.uk
// edition 260413 register. Expected values cross-checked against
// mysociety/appg-membership @ main on the same edition.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseGroup } from '../../lib/facilities/appg.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const load = (slug) => readFileSync(resolve(here, `../fixtures/appg-${slug}.htm`), 'utf8');

test('AI APPG — single in-kind benefit (Big Innovation Centre secretariat)', () => {
  const r = parseGroup(load('artificial-intelligence'));
  assert.equal(r.benefits.financial.length, 0);
  assert.equal(r.benefits.inKind.length, 1);
  const b = r.benefits.inKind[0];
  assert.equal(b.source, 'Big Innovation Centre');
  assert.match(b.description, /Secretariat/i);
  assert.match(b.description, /26\/01\/2026/);
  assert.equal(b.valueBand, '49,501-51,000');
  assert.equal(b.received, '26/01/2026');
  assert.equal(b.registered, '30/03/2026');
});

test('Blockchain APPG — single in-kind benefit (BBA secretariat)', () => {
  const r = parseGroup(load('blockchain-technologies'));
  assert.equal(r.benefits.inKind.length, 1);
  const b = r.benefits.inKind[0];
  assert.equal(b.source, 'British Blockchain Association');
  assert.equal(b.valueBand, '19,501-21,000');
});

test('DET APPG — in-kind benefit names Policy Connect with upstream funders', () => {
  const r = parseGroup(load('data-and-emerging-technologies'));
  assert.equal(r.benefits.inKind.length, 1);
  const b = r.benefits.inKind[0];
  assert.equal(b.source, 'Policy Connect');
  // The Description field carries the substantive disclosure: that the
  // secretariat is paid by ACCA, Open Data Institute and Zurich.
  assert.match(b.description, /ACCA/);
  assert.match(b.description, /Open Data Institute/);
  assert.match(b.description, /Zurich/);
  assert.equal(b.valueBand, '37,501-39,000');
});

test('Afrikan Reparations APPG — one financial AND one in-kind benefit', () => {
  // Mixed-type case: the group has both a financial donation (Common
  // Wealth, £2,500) and an in-kind conference contribution (Friends
  // House, £12,001-13,500). Tests that we don't lose either type.
  // (Note: mySociety's appg-membership dataset, used as our cross-check
  // oracle, captures only the financial row here; our scraper catches
  // both. Worth knowing if regressions appear in either direction.)
  const r = parseGroup(load('afrikan-reparations'));
  assert.equal(r.benefits.financial.length, 1);
  assert.equal(r.benefits.inKind.length, 1);

  assert.equal(r.benefits.financial[0].source, 'Common Wealth');
  assert.equal(r.benefits.financial[0].value, '2,500');

  assert.equal(r.benefits.inKind[0].source, 'Friends House');
  assert.equal(r.benefits.inKind[0].description, 'Conference');
  assert.equal(r.benefits.inKind[0].valueBand, '12,001-13,500');
});

test('Beer APPG — multiple financial benefits, no in-kind', () => {
  const r = parseGroup(load('beer'));
  assert.equal(r.benefits.inKind.length, 0);
  assert.ok(r.benefits.financial.length >= 5, 'at least 5 financial benefit rows');
  const abi = r.benefits.financial.find((x) => x.source === 'ABInBev');
  assert.ok(abi, 'expect ABInBev row');
  assert.equal(abi.value, '4,950');
  assert.equal(abi.received, '01/10/2025');
});
