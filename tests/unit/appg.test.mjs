// Unit tests for lib/facilities/appg.mjs.
// Covers parseGroup() against a fixture taken verbatim from the
// 23 Feb 2026 Register publication.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { parseGroup, contentsUrl, groupUrl, pdfUrl } from '../../lib/facilities/appg.mjs';

const here = dirname(fileURLToPath(import.meta.url));

test('URL builders are stable for a given edition', () => {
  assert.equal(contentsUrl('260112'), 'https://publications.parliament.uk/pa/cm/cmallparty/260112/contents.htm');
  assert.equal(pdfUrl('260112'),      'https://publications.parliament.uk/pa/cm/cmallparty/260112/register-260112.pdf');
  assert.equal(groupUrl('africa', '260112'),
               'https://publications.parliament.uk/pa/cm/cmallparty/260112/africa.htm');
});

test('parseGroup extracts title, purpose, category, officers, AGM, benefits', () => {
  const html = readFileSync(resolve(here, '../fixtures/appg-group.htm'), 'utf8');
  const r = parseGroup(html);

  // Header / classification fields
  assert.match(r.title,    /Internet, Communications and Technology/i);
  assert.match(r.subject,  /Internet, Communications and Technology/i);
  assert.match(r.purpose,  /parliamentarians from all parties/i);
  assert.equal(r.category, 'Subject Group');

  // Officers — exact role + party for at least the chair
  const chair = r.officers.find((o) => /Chair/.test(o.role));
  assert.ok(chair, 'should find a Chair');
  assert.equal(chair.name, 'Dame Caroline Dinenage');
  assert.equal(chair.party, 'Conservative');

  // AGM section parsed
  assert.equal(r.agm.date, '10/02/2026');
  assert.equal(r.agm.incomeExpenditureApproved, 'Yes');

  // At least one financial benefit recovered
  assert.ok(Array.isArray(r.benefits.financial));
  assert.ok(r.benefits.financial.length > 0, 'expect financial benefits');
});
