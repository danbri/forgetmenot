// Unit tests for the Wayback client in lib/facilities/wayback.mjs.
// All HTTP is mocked via globalThis.fetch — no network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closest, captures, bestCapture, mementoUrl } from '../../lib/facilities/wayback.mjs';

function withStubFetch(handler, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = handler;
  return Promise.resolve(fn()).finally(() => { globalThis.fetch = real; });
}

test('mementoUrl uses the id_ modifier for raw archived bytes', () => {
  const u = mementoUrl('20260101000000', 'https://example.org/');
  assert.equal(u, 'https://web.archive.org/web/20260101000000id_/https://example.org/');
  // rawBytes:false suppresses the id_ modifier so Wayback can serve
  // its rewritten/banner-injected version (rare path; included for
  // operators who explicitly want it).
  const u2 = mementoUrl('20260101000000', 'https://example.org/', { rawBytes: false });
  assert.equal(u2, 'https://web.archive.org/web/20260101000000/https://example.org/');
});

test('closest() returns null when no snapshot is available', async () => {
  await withStubFetch(async () => new Response(JSON.stringify({ archived_snapshots: {} }),
    { headers: { 'content-type': 'application/json' } }), async () => {
    const r = await closest('https://example.org/');
    assert.equal(r, null);
  });
});

test('closest() returns a memento URL when a snapshot exists', async () => {
  await withStubFetch(async () => new Response(JSON.stringify({
    archived_snapshots: { closest: {
      available: true, status: '200', timestamp: '20250505121212',
      url: 'https://web.archive.org/web/20250505121212/https://example.org/',
    }},
  }), { headers: { 'content-type': 'application/json' } }), async () => {
    const r = await closest('https://example.org/');
    assert.equal(r.available, true);
    assert.equal(r.timestamp, '20250505121212');
    assert.equal(r.status, '200');
    assert.match(r.mementoUrl, /web\.archive\.org\/web\/20250505121212id_\/https:\/\/example\.org\/$/);
  });
});

test('captures() transposes the CDX response into objects', async () => {
  const cdx = [
    ['urlkey', 'timestamp', 'original', 'mimetype', 'statuscode', 'digest', 'length'],
    ['org,example)/', '20240101000000', 'https://example.org/', 'text/html', '200', 'A', '111'],
    ['org,example)/', '20250101000000', 'https://example.org/', 'text/html', '200', 'B', '222'],
  ];
  await withStubFetch(async () => new Response(JSON.stringify(cdx),
    { headers: { 'content-type': 'application/json' } }), async () => {
    const rows = await captures('https://example.org/', { from: 2024 });
    assert.equal(rows.length, 2);
    assert.equal(rows[0].timestamp, '20240101000000');
    assert.equal(rows[1].statuscode, '200');
  });
});

test('bestCapture() returns the most recent successful CDX row', async () => {
  // First call: closest() returns a 404. Second call: CDX list with
  // two 200s. Caller should pick the most recent (last row).
  let n = 0;
  await withStubFetch(async (url) => {
    n++;
    if (n === 1) {
      return new Response(JSON.stringify({
        archived_snapshots: { closest: {
          available: true, status: '404', timestamp: '20240101000000',
          url: 'https://web.archive.org/web/20240101000000/https://example.org/',
        }},
      }), { headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify([
      ['urlkey', 'timestamp', 'original', 'mimetype', 'statuscode', 'digest', 'length'],
      ['org,example)/', '20240501000000', 'https://example.org/', 'text/html', '200', 'A', '1'],
      ['org,example)/', '20260101000000', 'https://example.org/', 'text/html', '200', 'B', '2'],
    ]), { headers: { 'content-type': 'application/json' } });
  }, async () => {
    const r = await bestCapture('https://example.org/');
    assert.equal(r.timestamp, '20260101000000');
    assert.equal(r.status, '200');
  });
});
