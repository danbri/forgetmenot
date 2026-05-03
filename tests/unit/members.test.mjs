// Unit tests for lib/facilities/members.mjs.
// Covers the pure helpers added for the URL-bulk-crawl flow.
// Network-using helpers (search, getById, contact) are tested in
// integration/ with a stub fetch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summariseHit, urlsFor } from '../../lib/facilities/members.mjs';

test('summariseHit flattens a Search.items[] entry', () => {
  const hit = {
    value: {
      id: 4514,
      nameDisplayAs: 'Sir Keir Starmer',
      nameListAs: 'Starmer, Sir Keir',
      gender: 'M',
      latestParty: { id: 15, name: 'Labour', abbreviation: 'Lab' },
      latestHouseMembership: {
        membershipFrom: 'Holborn and St Pancras',
        membershipFromId: 4140,
        house: 1,
        membershipStartDate: '2015-05-07T00:00:00',
        membershipEndDate: null,
      },
      thumbnailUrl: 'https://members-api.parliament.uk/api/Members/4514/Thumbnail',
    },
  };
  const s = summariseHit(hit);
  assert.equal(s.id, 4514);
  assert.equal(s.name, 'Sir Keir Starmer');
  assert.equal(s.party, 'Labour');
  assert.equal(s.partyAbbr, 'Lab');
  assert.equal(s.house, 'Commons');
  assert.equal(s.constituency, 'Holborn and St Pancras');
  assert.equal(s.gender, 'M');
});

test('summariseHit also accepts a getById response shape', () => {
  // getById returns { value: {...} } directly (no .items wrap).
  const member = {
    value: {
      id: 1,
      nameDisplayAs: 'Test',
      latestParty: { id: 9, name: 'Independent', abbreviation: 'Ind' },
      latestHouseMembership: { house: 2 },
    },
  };
  const s = summariseHit(member);
  assert.equal(s.id, 1);
  assert.equal(s.house, 'Lords');
});

test('urlsFor reshapes a /Contact response into URL buckets', async () => {
  // Stub the global fetch with a fixed payload mirroring the real
  // shape of /Members/{id}/Contact (see snapshot in
  // third_party/data/members for live examples).
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    value: [
      { type: 'Parliamentary office', isWebAddress: false,
        line1: 'House of Commons', line5: 'London', postcode: 'SW1A 0AA',
        phone: '020 7219 4426', email: 'mp@parliament.uk' },
      { type: 'Website', isWebAddress: true, line1: 'https://example.org/' },
      { type: 'X (formerly Twitter)', isWebAddress: true, line1: 'https://twitter.com/x' },
      { type: 'Facebook', isWebAddress: true, line1: 'https://facebook.com/x' },
    ],
  }), { headers: { 'content-type': 'application/json' } });

  try {
    const u = await urlsFor(4514);
    assert.equal(u.id, 4514);
    assert.equal(u.websites.length, 1);
    assert.equal(u.websites[0].url, 'https://example.org/');
    assert.equal(u.social.length, 2);
    assert.deepEqual(u.social.map((s) => s.type).sort(), ['Facebook', 'X (formerly Twitter)']);
    assert.deepEqual(u.emails, ['mp@parliament.uk']);
    assert.deepEqual(u.phones, ['020 7219 4426']);
    assert.equal(u.offices.length, 1);
    assert.equal(u.offices[0].postcode, 'SW1A 0AA');
  } finally {
    globalThis.fetch = realFetch;
  }
});
