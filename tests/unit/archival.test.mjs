// Unit tests for lib/archival.mjs.
// Cover: digest format, multi-algo panel, redaction, record shape.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  digest, digests, buildRecord, recordToJsonLine,
  DEFAULT_DIGEST_ALGOS, CRAWLER_FINGERPRINT,
} from '../../lib/archival.mjs';

test('digest() emits self-describing <algo>:<hex> format', () => {
  // Known reference values from a public NIST/Wikipedia source so
  // a reviewer can independently verify these constants.
  // SHA-1("abc")    = a9993e364706816aba3e25717850c26c9cd0d89d
  // SHA-256("abc")  = ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
  assert.equal(digest('abc', 'sha1'),   'sha1:a9993e364706816aba3e25717850c26c9cd0d89d');
  assert.equal(digest('abc', 'sha256'), 'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('digest() handles empty + Uint8Array + ArrayBuffer bodies', () => {
  assert.equal(digest('', 'sha256'), 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(digest(new Uint8Array([0x61, 0x62, 0x63]), 'sha256'),
               'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  const ab = new Uint8Array([0x61, 0x62, 0x63]).buffer;
  assert.equal(digest(ab, 'sha256'),
               'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('digests() returns the documented multi-algo panel', () => {
  const out = digests('abc');
  assert.equal(out.length, DEFAULT_DIGEST_ALGOS.length);
  // Algorithm prefix preserved; format is <algo>:<hex>
  for (const e of out) assert.match(e, /^(sha1|sha256|sha512|sha3-256):[0-9a-f]+$/);
  assert.ok(out.some((e) => e.startsWith('sha1:')));
  assert.ok(out.some((e) => e.startsWith('sha256:')));
  assert.ok(out.some((e) => e.startsWith('sha512:')));
  assert.ok(out.some((e) => e.startsWith('sha3-256:')));
});

test('buildRecord() captures all required archival fields', () => {
  const rec = buildRecord(
    {
      method: 'GET',
      url: 'https://example.com/x',
      headers: { 'User-Agent': 'forgetmenot/test', Accept: 'text/html' },
      started_at: '2026-05-03T08:00:00.000Z',
    },
    {
      status: 200,
      url: 'https://example.com/x',
      headers: { 'content-type': 'text/html', server: 'nginx' },
      finished_at: '2026-05-03T08:00:00.500Z',
      ttfb_ms: 100,
      content_length: 3,
      content_type: 'text/html',
      body: 'abc',
    },
  );
  // Identification
  assert.match(rec.record_id, /^urn:uuid:[0-9a-f-]+$/);
  assert.equal(rec.concurrent_to, rec.record_id);
  assert.deepEqual(rec.crawler, CRAWLER_FINGERPRINT);
  // Request
  assert.equal(rec.request.method, 'GET');
  assert.equal(rec.request.url, 'https://example.com/x');
  assert.equal(rec.request.headers['user-agent'], 'forgetmenot/test');
  assert.equal(rec.request.headers['accept'], 'text/html');
  // Response
  assert.equal(rec.response.status, 200);
  assert.equal(rec.response.elapsed_ms, 500);
  assert.equal(rec.response.ttfb_ms, 100);
  assert.equal(rec.response.content_length, 3);
  // Body digests
  assert.equal(rec.body.bytes, 3);
  assert.ok(rec.body.digests.find((d) => d.startsWith('sha256:ba7816')));
});

test('buildRecord() redacts Cookie / Authorization headers', () => {
  const rec = buildRecord(
    {
      method: 'GET',
      url: 'https://example.com/',
      headers: {
        Authorization: 'Bearer secret-token',
        Cookie: 'session=abc123',
        'X-Api-Key': 'k-12345',
        Accept: 'text/html',
      },
      started_at: '2026-05-03T08:00:00.000Z',
    },
    {
      status: 200, url: 'https://example.com/',
      headers: { 'set-cookie': 'foo=bar' },
      finished_at: '2026-05-03T08:00:00.001Z',
      content_length: 0, content_type: 'text/html', body: '',
    },
  );
  // Sensitive request headers blanked but presence is recorded.
  assert.equal(rec.request.headers.authorization, '[REDACTED]');
  assert.equal(rec.request.headers.cookie, '[REDACTED]');
  assert.equal(rec.request.headers['x-api-key'], '[REDACTED]');
  // Non-sensitive headers preserved.
  assert.equal(rec.request.headers.accept, 'text/html');
  // Response Set-Cookie also redacted (sometimes contains tokens).
  assert.equal(rec.response.headers['set-cookie'], '[REDACTED]');
});

test('recordToJsonLine() emits a single newline-terminated JSON line', () => {
  const rec = buildRecord(
    { method: 'GET', url: 'https://example.com/', headers: {}, started_at: '2026-05-03T08:00:00.000Z' },
    { status: 200, url: 'https://example.com/', headers: {}, finished_at: '2026-05-03T08:00:00.001Z',
      content_length: 0, content_type: null, body: '' },
  );
  const line = recordToJsonLine(rec);
  assert.ok(line.endsWith('\n'));
  assert.equal(line.split('\n').filter(Boolean).length, 1);
  // Round-trips.
  const parsed = JSON.parse(line);
  assert.equal(parsed.record_id, rec.record_id);
});
