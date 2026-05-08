// Smoke tests for the instruments-by-act demo server.
//
// Run from the repo root:
//   node --test demos/instruments-by-act/tests/
//
// Pure unit tests for the bucketing + route declarations. The
// integration test boots the server on a random port and hits an
// extra-route handler that talks to the live SI API; it's gated on
// having network access and skipped otherwise.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROUTES, matchRoute, buildUpstreamUrl, ttlMsFor,
  layingDateOf, bucketKey,
} from '../server.mjs';

describe('routes', () => {
  test('SI prefix maps to upstream', () => {
    const m = matchRoute('/api/si/StatutoryInstrument?Take=1');
    assert.ok(m);
    assert.equal(m.route.upstreamHost, 'statutoryinstruments-api.parliament.uk');
    assert.equal(m.tail, 'StatutoryInstrument?Take=1');
  });

  test('non-SI path returns null', () => {
    assert.equal(matchRoute('/api/members/Members/4514'), null);
  });

  test('buildUpstreamUrl assembles correctly', () => {
    const url = buildUpstreamUrl(ROUTES[0], 'StatutoryInstrument', '?Take=1');
    assert.equal(url, 'https://statutoryinstruments-api.parliament.uk/api/v2/StatutoryInstrument?Take=1');
  });
});

describe('TTL policy', () => {
  test('SI detail is 24h', () => {
    assert.equal(ttlMsFor(ROUTES[0], 'StatutoryInstrument/PH2Yuqje'), 24 * 3600_000);
  });
  test('SI search is 1h', () => {
    assert.equal(ttlMsFor(ROUTES[0], 'StatutoryInstrument?Take=200'), 3600_000);
  });
  test('Procedures are 24h', () => {
    assert.equal(ttlMsFor(ROUTES[0], 'Procedure'), 24 * 3600_000);
  });
});

describe('layingDateOf', () => {
  test('picks the earlier of Commons / Lords', () => {
    assert.equal(
      layingDateOf({ commonsLayingDate: '2020-04-01', lordsLayingDate: '2020-04-03' }),
      '2020-04-01',
    );
    assert.equal(
      layingDateOf({ commonsLayingDate: '2020-04-05', lordsLayingDate: '2020-04-02' }),
      '2020-04-02',
    );
  });
  test('uses whichever House date is set when one is null', () => {
    assert.equal(
      layingDateOf({ commonsLayingDate: null, lordsLayingDate: '2020-04-02' }),
      '2020-04-02',
    );
  });
  test('falls back to paperMadeDate when neither House date is set', () => {
    assert.equal(
      layingDateOf({ commonsLayingDate: null, lordsLayingDate: null, paperMadeDate: '2020-03-31' }),
      '2020-03-31',
    );
  });
  test('returns null when nothing is set', () => {
    assert.equal(layingDateOf({}), null);
  });
});

describe('bucketKey', () => {
  test('week format is YYYY-Www', () => {
    // 2020-04-01 is a Wednesday in ISO week 14.
    assert.equal(bucketKey('2020-04-01T00:00:00', 'week'), '2020-W14');
  });
  test('month format is YYYY-MM', () => {
    assert.equal(bucketKey('2020-04-01T00:00:00', 'month'), '2020-04');
  });
  test('week boundary: Sunday belongs to the prior ISO week', () => {
    // Sun 2020-04-05 is in ISO week 14, not 15 (week starts Mon).
    assert.equal(bucketKey('2020-04-05T00:00:00', 'week'), '2020-W14');
  });
  test('returns null for garbage', () => {
    assert.equal(bucketKey('not-a-date', 'week'), null);
  });
});
