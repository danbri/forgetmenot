// Unit tests for lib/identity-match.mjs.
// Pure-function coverage of normaliseName + the resolver against a
// stubbed Members API.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseName, resolveOfficer } from '../../lib/identity-match.mjs';

test('normaliseName strips honorifics and post-nominals', () => {
  const r1 = normaliseName('Dame Caroline Dinenage MP');
  assert.equal(r1.surname, 'Dinenage');
  assert.deepEqual(r1.firstNames, ['Caroline']);
  assert.equal(r1.titles[0], 'dame');

  const r2 = normaliseName('The Rt Hon Sir Keir Starmer KC MP');
  assert.equal(r2.surname, 'Starmer');
  assert.deepEqual(r2.firstNames, ['Keir']);

  const r3 = normaliseName('Lord Hunt of Kings Heath');
  assert.equal(r3.surname, 'Heath');
  assert.equal(r3.impliedHouse, 'Lords');
  // Stripped form preserves the locative — "Hunt of Kings Heath".
  // This is what we use as the Members API search query (the API
  // matches by full title for peers).
  assert.match(r3.stripped, /Hunt of Kings Heath/);

  const r4 = normaliseName('Baroness Neville-Rolfe');
  assert.equal(r4.surname, 'Neville-Rolfe');
  assert.equal(r4.impliedHouse, 'Lords');

  const r5 = normaliseName('');
  assert.equal(r5.surname, '');
});

// Helper: install a mock fetch that returns a canned Members API
// search response. The mock looks at the Name= query parameter so
// different test cases can drive different responses.
function withMembersFetch(byName, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = new URL(String(url));
    const name = u.searchParams.get('Name') || '';
    const items = byName[name] || [];
    return new Response(JSON.stringify({ totalResults: items.length, items: items.map((v) => ({ value: v })) }),
      { headers: { 'content-type': 'application/json' } });
  };
  return Promise.resolve(fn()).finally(() => { globalThis.fetch = real; });
}

const m = (id, name, party, house = 1, current = true) => ({
  id, nameDisplayAs: name, nameListAs: name, nameFullTitle: name,
  latestParty: { name: party, abbreviation: party.slice(0, 3) },
  latestHouseMembership: {
    house,
    membershipFrom: house === 1 ? 'Test' : null,
    membershipEndDate: current ? null : '2020-01-01T00:00:00',
    membershipStatus: { statusIsActive: current },
  },
});

test('resolveOfficer matches a single hit cleanly', async () => {
  await withMembersFetch({
    'Dinenage':                 [m(4008, 'Dame Caroline Dinenage', 'Conservative')],
    'Caroline Dinenage':        [m(4008, 'Dame Caroline Dinenage', 'Conservative')],
  }, async () => {
    const r = await resolveOfficer({ name: 'Dame Caroline Dinenage', party: 'Conservative', role: 'Chair' });
    assert.equal(r.status, 'matched');
    assert.equal(r.member.id, 4008);
    assert.equal(r.member.party, 'Conservative');
  });
});

test('resolveOfficer disambiguates by party + first-name token', async () => {
  // Two namesake peers + one MP. APPG records Kate Osamor as Labour Co-op
  // — current resolver should pick the Commons MP whose given name
  // includes "Kate".
  const ladyOsamor = m(4711, 'Baroness Osamor', 'Labour', 2);
  const kateOsamor = m(4515, 'Kate Osamor', 'Labour (Co-op)', 1);
  await withMembersFetch({
    'Osamor':       [ladyOsamor, kateOsamor],
    'Kate Osamor':  [kateOsamor, ladyOsamor],
  }, async () => {
    const r = await resolveOfficer({ name: 'Kate Osamor', party: 'Labour (Co-op)', role: 'Vice Chair' });
    assert.equal(r.status, 'matched');
    assert.equal(r.member.id, 4515);
    assert.equal(r.member.house, 'Commons');
  });
});

test('resolveOfficer disambiguates a peer with a locative title', async () => {
  // "Lord Hunt of Kings Heath" — surname-only ("Heath") returns
  // unrelated peers; full-name search returns the unique hit.
  await withMembersFetch({
    'Hunt of Kings Heath': [m(2024, 'Lord Hunt of Kings Heath', 'Labour', 2)],
    'Heath': [
      m(2380, 'Lord Cooper of Stockton Heath', 'Labour', 2),
      m(2024, 'Lord Hunt of Kings Heath', 'Labour', 2),
      m(5022, 'Baroness Ramsey of Wall Heath', 'Labour', 2),
    ],
  }, async () => {
    const r = await resolveOfficer({ name: 'Lord Hunt of Kings Heath', party: 'Labour', role: 'Co-Chair' });
    assert.equal(r.status, 'matched');
    assert.equal(r.member.id, 2024);
  });
});

test('resolveOfficer reports ambiguous on genuine same-name collision', async () => {
  // Two Lord Harlechs, both Conservative peers, both inactive.
  // No signal can distinguish them — must report ambiguous.
  await withMembersFetch({
    'Harlech': [
      m(2677, 'Lord Harlech', 'Conservative', 2, false),
      m(4928, 'Lord Harlech', 'Conservative', 2, false),
    ],
    'Lord Harlech': [
      m(2677, 'Lord Harlech', 'Conservative', 2, false),
      m(4928, 'Lord Harlech', 'Conservative', 2, false),
    ],
  }, async () => {
    const r = await resolveOfficer({ name: 'Lord Harlech', party: 'Conservative', role: 'Officer' });
    assert.equal(r.status, 'ambiguous');
    assert.equal(r.candidates.length, 2);
  });
});

test('resolveOfficer reports no_candidates when search returns nothing', async () => {
  await withMembersFetch({}, async () => {
    const r = await resolveOfficer({ name: 'Mx Nobody', party: 'Labour', role: 'Officer' });
    assert.equal(r.status, 'no_candidates');
  });
});
