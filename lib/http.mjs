// Shared HTTP layer. Works in Node 18+ and modern browsers.
// Uses only globals: fetch, URL, URLSearchParams, AbortController.

export const VERSION = '0.1.0';

export const DEFAULT_USER_AGENT =
  `forgetmenot/${VERSION} (+https://github.com/danbri/forgetmenot)`;

export const DEFAULTS = {
  userAgent: DEFAULT_USER_AGENT,
  timeoutMs: 30_000,
  retries: 2,
  retryBaseMs: 500,
};

export class HttpError extends Error {
  constructor(status, url, body, headers = null) {
    super(`HTTP ${status} ${url}`);
    this.name = 'HttpError';
    this.status = status;
    this.url = url;
    this.body = body;
    // Response headers as a plain object (lower-cased keys) when
    // available. Useful for downstream detection (e.g. WAF
    // fingerprinting in lib/waf-detect.mjs) without needing a
    // separate diagnostic request.
    this.headers = headers;
  }
}

// Build a full URL with query parameters. Drops keys whose value is
// undefined, null, or empty string. Arrays produce repeated params.
export function buildUrl(base, params = {}) {
  const url = new URL(base);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) {
      for (const item of v) {
        if (item === undefined || item === null || item === '') continue;
        url.searchParams.append(k, String(item));
      }
    } else {
      url.searchParams.append(k, String(v));
    }
  }
  return url.toString();
}

// Sleep helper (works in Node 18+ and browsers).
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// Single GET with timeout, retries on 5xx + network errors.
export async function get(base, params = {}, ctx = {}) {
  const url = buildUrl(base, params);
  return rawFetch(url, { method: 'GET' }, ctx);
}

// Single POST with form-urlencoded body (used by SPARQL).
export async function postForm(url, form, ctx = {}) {
  const body = new URLSearchParams(form).toString();
  return rawFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  }, ctx);
}

// Lower-level fetch helper. Accepts standard fetch init plus our ctx.
//
// Optional archival capture: if `ctx.archive.sink` is a function we
// build a structured per-fetch record (see lib/archival.mjs) for
// each attempt — including failed attempts and redirected legs —
// and pass it to the sink. The sink is responsible for deciding
// where to persist (a file appender, an in-memory array, …).
//   ctx.archive = { sink: (record) => void, algos?: ['sha1','sha256',...] }
// Capturing always reads the body fully (digests need it).
export async function rawFetch(url, init = {}, ctx = {}) {
  const userAgent = ctx.userAgent || DEFAULTS.userAgent;
  const timeoutMs = ctx.timeoutMs || DEFAULTS.timeoutMs;
  const retries = ctx.retries ?? DEFAULTS.retries;
  const accept = ctx.accept || 'application/json, text/json, */*';
  const fetchImpl = ctx.fetch || globalThis.fetch;
  const archiveSink = ctx.archive?.sink || null;
  const archiveAlgos = ctx.archive?.algos;

  if (typeof fetchImpl !== 'function') {
    throw new Error('No fetch implementation available. Node 18+ or browser required.');
  }

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);

    // Per-attempt archival capture variables.
    const startedAt = new Date();
    const reqStartedMs = startedAt.getTime();
    let ttfbMs = null;
    let captured;

    try {
      const headers = {
        Accept: accept,
        ...(init.headers || {}),
      };
      // User-Agent: settable in Node, ignored by browsers (they send their own).
      if (typeof process !== 'undefined' && process.versions?.node) {
        headers['User-Agent'] = userAgent;
      }

      const res = await fetchImpl(url, {
        ...init,
        headers,
        signal: ctx.signal || ac.signal,
        redirect: 'follow',
      });
      ttfbMs = Date.now() - reqStartedMs;
      clearTimeout(timer);

      const ct = res.headers.get('content-type') || '';

      // For archival we always need the body bytes regardless of
      // content type, so digests are over the actual transport bytes
      // (not a JSON-parsed shape). When archival is on we read the
      // body once as bytes, then re-decode for the typed return.
      let body;
      let bodyForDigest = null;
      if (archiveSink) {
        const buf = new Uint8Array(await res.arrayBuffer());
        bodyForDigest = buf;
        if (ct.includes('json') || (ct === '' && url.includes('.json'))) {
          const text = new TextDecoder().decode(buf);
          try { body = JSON.parse(text); } catch { body = text; }
        } else if (ct.includes('xml') || ct.includes('html') || ct.includes('text')) {
          body = new TextDecoder().decode(buf);
        } else {
          body = buf.buffer;
        }
      } else if (ct.includes('json') || (ct === '' && url.includes('.json'))) {
        body = await res.json().catch(async () => await safeText(res));
      } else if (ct.includes('xml') || ct.includes('html') || ct.includes('text')) {
        body = await res.text();
      } else {
        // Binary response — return as ArrayBuffer.
        body = await res.arrayBuffer();
      }

      // Build + emit archival record (success or non-2xx — caller
      // wanted the transaction recorded either way).
      if (archiveSink) {
        try {
          const A = await import('./archival.mjs');
          const record = A.buildRecord(
            { method: init.method || 'GET', url, headers, started_at: startedAt.toISOString() },
            {
              status: res.status,
              url: res.url || url,
              headers: Object.fromEntries(res.headers),
              finished_at: new Date().toISOString(),
              ttfb_ms: ttfbMs,
              content_length: bodyForDigest?.byteLength ?? null,
              content_type: ct || null,
              body: bodyForDigest,
            },
            { algos: archiveAlgos, extra: ctx.archive?.extra },
          );
          captured = record;
          archiveSink(record);
        } catch (e) {
          // Never let archival failure break the fetch path.
          if (ctx.archive?.onError) ctx.archive.onError(e);
        }
      }

      // Retry on 5xx
      if (res.status >= 500 && attempt < retries) {
        lastErr = new HttpError(res.status, url, typeof body === 'string' ? body : null);
        await sleep(DEFAULTS.retryBaseMs * (2 ** attempt));
        continue;
      }

      if (!res.ok) {
        // Capture response headers on the error so callers can
        // perform WAF / CDN fingerprinting without a separate
        // diagnostic request.
        throw new HttpError(res.status, url, body, Object.fromEntries(res.headers));
      }
      return { ok: true, status: res.status, url, body, headers: Object.fromEntries(res.headers), archive: captured };
    } catch (e) {
      clearTimeout(timer);
      // If archival was on and we never got a response (network/abort),
      // emit a record showing what we attempted.
      if (archiveSink && !captured) {
        try {
          const A = await import('./archival.mjs');
          const errStatus = e instanceof HttpError ? e.status : 0;
          const record = A.buildRecord(
            { method: init.method || 'GET', url, headers: { Accept: accept, 'User-Agent': userAgent, ...(init.headers || {}) }, started_at: startedAt.toISOString() },
            {
              status: errStatus,
              url,
              headers: {},
              finished_at: new Date().toISOString(),
              ttfb_ms: ttfbMs,
              content_length: 0,
              content_type: null,
              body: null,
            },
            { algos: archiveAlgos, extra: { error: e.message, ...(ctx.archive?.extra || {}) } },
          );
          archiveSink(record);
        } catch { /* swallow */ }
      }
      if (e instanceof HttpError && e.status < 500) throw e;
      lastErr = e;
      if (attempt < retries) {
        await sleep(DEFAULTS.retryBaseMs * (2 ** attempt));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

async function safeText(res) {
  try { return await res.text(); } catch { return null; }
}

// Convenience used when an endpoint returns binary (PDF, image) and the
// caller wants a Uint8Array.
export async function getBytes(url, params = {}, ctx = {}) {
  const r = await rawFetch(buildUrl(url, params), { method: 'GET' }, {
    ...ctx,
    accept: ctx.accept || 'application/octet-stream',
  });
  return new Uint8Array(r.body);
}
