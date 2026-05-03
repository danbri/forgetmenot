// End-to-end integration test for archival capture inside rawFetch.
// We install a stub fetch and verify that the per-fetch record
// emitted to the sink contains everything the archival contract
// promises: timestamps, headers (request + response), digests in
// the documented multi-algorithm panel, and the crawler fingerprint.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { rawFetch } from '../../lib/http.mjs';
import { DEFAULT_DIGEST_ALGOS } from '../../lib/archival.mjs';

test('rawFetch with ctx.archive.sink emits a complete record per attempt', async () => {
  const captured = [];

  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => new Response('hello world', {
    status: 200,
    headers: { 'content-type': 'text/plain', 'x-trace-id': 'test-trace-42' },
  });

  try {
    const r = await rawFetch('https://example.org/x', { method: 'GET' }, {
      retries: 0,
      accept: 'text/plain',
      archive: { sink: (rec) => captured.push(rec) },
    });
    assert.equal(r.ok, true);
    assert.equal(r.body, 'hello world');
    assert.equal(captured.length, 1);

    const rec = captured[0];

    // Identification + crawler attribution
    assert.match(rec.record_id, /^urn:uuid:/);
    assert.equal(rec.crawler.name, 'forgetmenot');

    // Request side: method, URL, headers exactly as the HTTP layer set
    assert.equal(rec.request.method, 'GET');
    assert.equal(rec.request.url, 'https://example.org/x');
    assert.equal(rec.request.headers.accept, 'text/plain');
    assert.match(rec.request.headers['user-agent'], /forgetmenot/);
    assert.match(rec.request.started_at, /^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d/);

    // Response side: status, content-type, finished_at, ttfb, headers
    assert.equal(rec.response.status, 200);
    assert.equal(rec.response.content_type, 'text/plain');
    assert.equal(rec.response.headers['x-trace-id'], 'test-trace-42');
    assert.match(rec.response.finished_at, /^20\d\d/);
    assert.ok(typeof rec.response.elapsed_ms === 'number');
    assert.ok(rec.response.elapsed_ms >= 0);

    // Body digests: every default algorithm is present, formatted as
    // <algo>:<hex>. SHA-256 of "hello world" has a known reference
    // value we can pin.
    assert.equal(rec.body.bytes, 11);
    for (const algo of DEFAULT_DIGEST_ALGOS) {
      assert.ok(rec.body.digests.some((d) => d.startsWith(algo + ':')),
                `digest for ${algo} should be present`);
    }
    const sha256 = rec.body.digests.find((d) => d.startsWith('sha256:'));
    assert.equal(sha256,
      'sha256:b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('rawFetch records archival even when the response is non-2xx', async () => {
  const captured = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('forbidden', {
    status: 403, headers: { 'content-type': 'text/plain' },
  });
  try {
    await rawFetch('https://example.org/forbidden', {}, {
      retries: 0, archive: { sink: (rec) => captured.push(rec) },
    }).catch(() => null);
    assert.equal(captured.length, 1);
    assert.equal(captured[0].response.status, 403);
    assert.ok(captured[0].body.bytes > 0);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('rawFetch records archival on network error too', async () => {
  const captured = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new TypeError('connection refused'); };
  try {
    await rawFetch('https://example.org/dead', {}, {
      retries: 0, archive: { sink: (rec) => captured.push(rec) },
    }).catch(() => null);
    assert.equal(captured.length, 1);
    assert.equal(captured[0].response.status, 0);
    assert.equal(captured[0].extra?.error, 'connection refused');
  } finally {
    globalThis.fetch = realFetch;
  }
});
