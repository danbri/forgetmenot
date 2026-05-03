// Archival metadata for HTTP fetches.
//
// Goal: capture enough about every HTTP/S transaction that an
// external party can verify what we fetched, when, with which
// headers, and that the body is bit-for-bit what we claim — without
// requiring them to trust our parsed output. The format is
// intentionally aligned with the WARC/Wayback world without being
// a WARC writer (we store JSON for developer ergonomics; an
// optional WARC exporter can be added later from these records).
//
// What every record contains (one record per HTTP transaction,
// including each redirect leg):
//
//   * record_id            — stable urn:uuid for this transaction
//   * concurrent_to        — request and response share an id; the
//                            outer caller can group them
//   * request.method, .url, .headers (as sent), .started_at (ISO)
//   * response.status, .url (final URL after this leg's redirect),
//                            .headers (as received), .finished_at,
//                            .elapsed_ms, .ttfb_ms (first-byte),
//                            .content_length, .content_type
//   * body_digests         — array of "<algo>:<hex>" entries. We
//                            record SHA-1 (Wayback CDX legacy),
//                            SHA-256 (current WARC standard),
//                            SHA-512 (longer same-family), and
//                            SHA3-256 (NIST post-quantum-ready
//                            alt) by default. The format is
//                            self-describing so future verifiers
//                            don't have to guess the algorithm.
//   * crawler              — { name, version, repo } so the record
//                            is pin-citable
//
// Why multiple hashes: the user explicitly asked us to record
// "shaxyz where xyz>256 - whatever will be adopted after sha256".
// There is no single anointed successor to SHA-256 today (BLAKE3
// has the most momentum but isn't in Node's stdlib and isn't
// formally standardised; SHA3 is NIST-blessed but slower than
// SHA-2; SHA-512 is incrementally stronger same-family). Recording
// all four future-proofs us against any one being deprecated.
// New algorithms can be appended without breaking existing
// readers — they parse `<algo>:<hex>` and skip what they don't
// know.

import { createHash, randomUUID } from 'node:crypto';
import { VERSION } from './http.mjs';

// Algorithm identifiers we record by default. Names are aligned
// with both Node's `crypto.createHash` argument and the IETF
// hash-algorithm registry where possible.
//
//   sha1     — IETF/IANA "sha-1". Wayback CDX uses base32-of-sha1
//              by historical convention. We emit lower-case hex
//              which is unambiguous and easy to verify.
//   sha256   — WARC-Payload-Digest standard (sha-256).
//   sha512   — Same family, longer; cheap insurance.
//   sha3-256 — NIST FIPS-202; an alt family in case SHA-2 is
//              ever found weaker than expected.
//
// You can extend this list per call. We intentionally do NOT
// include MD5 (broken) or BLAKE3 (no Node-stdlib implementation
// at the time of writing).
export const DEFAULT_DIGEST_ALGOS = ['sha1', 'sha256', 'sha512', 'sha3-256'];

// Compute a self-describing digest string `<algo>:<hex>` for a
// Buffer / Uint8Array / string. The algorithm name is preserved
// verbatim so consumers can route by algorithm without parsing
// magic bytes.
export function digest(body, algo) {
  const h = createHash(algo);
  if (typeof body === 'string') h.update(body, 'utf8');
  else if (body instanceof Uint8Array) h.update(body);
  else if (body && typeof body.byteLength === 'number') h.update(new Uint8Array(body));
  else if (body == null) {/* empty */}
  else h.update(String(body), 'utf8');
  return `${algo}:${h.digest('hex')}`;
}

// Compute the default panel of digests for a body. Returns an
// array of `<algo>:<hex>` strings. Cheap (~0.5 ms per algo per MB)
// even though we hash the same body four times — keeping each
// algorithm independent makes the resulting record parseable by
// any verifier that knows even one of the algorithms.
export function digests(body, algos = DEFAULT_DIGEST_ALGOS) {
  return algos.map((a) => digest(body, a));
}

// Fingerprint identifying THIS crawler in every archival record.
// Pinned by package version so a record can be linked back to a
// reproducible build.
export const CRAWLER_FINGERPRINT = Object.freeze({
  name: 'forgetmenot',
  version: VERSION,
  repo: 'https://github.com/danbri/forgetmenot',
});

// Build one archival record from a captured fetch. All inputs
// come from the fetch wrapper (see captureFetch below). We never
// guess: every header recorded was actually sent or received.
//
// Inputs:
//   request   — { method, url, headers (sent), started_at }
//   response  — { status, url (final), headers (received), finished_at, ttfb_ms,
//                 content_length, content_type, body }
//   options   — { algos?: [...], extra?: {...} }
//
// Note on headers: `headers` for requests are exactly what the
// HTTP layer set (NOT what `fetch` may or may not have inserted
// internally — Node's undici may add Accept-Encoding etc.; we
// capture only what we explicitly attached). For responses we
// capture every header the runtime exposed to us (Object.fromEntries
// over the Headers iterator).
export function buildRecord(request, response, options = {}) {
  const algos = options.algos || DEFAULT_DIGEST_ALGOS;
  const recordId = `urn:uuid:${randomUUID()}`;
  const concurrentTo = options.concurrentTo || recordId;
  const startedMs = Date.parse(request.started_at);
  const finishedMs = Date.parse(response.finished_at);
  const elapsedMs = Number.isFinite(startedMs) && Number.isFinite(finishedMs)
    ? finishedMs - startedMs
    : null;

  return {
    record_id: recordId,
    concurrent_to: concurrentTo,
    crawler: CRAWLER_FINGERPRINT,
    request: {
      method: request.method,
      url: request.url,
      headers: redactHeaders(request.headers),
      started_at: request.started_at,
    },
    response: {
      status: response.status,
      url: response.url,
      headers: redactHeaders(response.headers),
      finished_at: response.finished_at,
      elapsed_ms: elapsedMs,
      ttfb_ms: response.ttfb_ms ?? null,
      content_length: response.content_length ?? null,
      content_type: response.content_type ?? null,
    },
    body: response.body == null ? null : {
      bytes: byteLengthOf(response.body),
      digests: digests(response.body, algos),
    },
    extra: options.extra || undefined,
  };
}

// Header redaction. We don't ship credentials in records: anything
// that looks like an authorization-bearing header is replaced by
// `[REDACTED]` while still surfacing its presence (so reviewers
// can see we sent SOMETHING in that slot, just not what). This
// matters for cases where a record is later published or shared.
const REDACTED_HEADERS = new Set([
  'authorization', 'proxy-authorization',
  'cookie', 'set-cookie',
  'x-api-key', 'api-key',
]);

function redactHeaders(h) {
  if (!h) return {};
  const out = {};
  for (const [k, v] of Object.entries(h)) {
    const key = String(k).toLowerCase();
    out[key] = REDACTED_HEADERS.has(key) ? '[REDACTED]' : v;
  }
  return out;
}

function byteLengthOf(body) {
  if (body == null) return 0;
  if (body instanceof Uint8Array) return body.byteLength;
  if (body && typeof body.byteLength === 'number') return body.byteLength;
  if (typeof body === 'string') return Buffer.byteLength(body, 'utf8');
  return Buffer.byteLength(String(body), 'utf8');
}

// Convenience helper for callers that know they're fetching once
// and want a single record back. Provides a wrapper around the
// global `fetch` that captures everything needed to build a record.
//
// Returns:
//   { response: <fetch response-like wrapper>, record: <archival record> }
//
// This DOES read the body fully (so the digests can be computed).
// If you only want headers, use captureFetchHead.
export async function captureFetch(url, init = {}, options = {}) {
  const fetchImpl = options.fetch || globalThis.fetch;
  const headers = init.headers || {};
  const startedAt = new Date();
  const ttfbMark = startedAt.getTime();
  const res = await fetchImpl(url, { ...init });
  const ttfbMs = Date.now() - ttfbMark;
  const buf = new Uint8Array(await res.arrayBuffer());
  const finishedAt = new Date();

  const responseHeaders = {};
  for (const [k, v] of res.headers) responseHeaders[k] = v;

  const record = buildRecord(
    {
      method: init.method || 'GET',
      url,
      headers,
      started_at: startedAt.toISOString(),
    },
    {
      status: res.status,
      url: res.url || url,
      headers: responseHeaders,
      finished_at: finishedAt.toISOString(),
      ttfb_ms: ttfbMs,
      content_length: buf.byteLength,
      content_type: responseHeaders['content-type'] || null,
      body: buf,
    },
    options,
  );
  return { response: res, body: buf, record };
}

// JSONL (one record per line) is what the sites crawler appends to
// its per-site `archive.jsonl`. Stable line-ordered append so
// existing records are preserved across runs.
export function recordToJsonLine(record) {
  return JSON.stringify(record) + '\n';
}
