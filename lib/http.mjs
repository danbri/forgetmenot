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
  constructor(status, url, body) {
    super(`HTTP ${status} ${url}`);
    this.name = 'HttpError';
    this.status = status;
    this.url = url;
    this.body = body;
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
export async function rawFetch(url, init = {}, ctx = {}) {
  const userAgent = ctx.userAgent || DEFAULTS.userAgent;
  const timeoutMs = ctx.timeoutMs || DEFAULTS.timeoutMs;
  const retries = ctx.retries ?? DEFAULTS.retries;
  const accept = ctx.accept || 'application/json, text/json, */*';
  const fetchImpl = ctx.fetch || globalThis.fetch;

  if (typeof fetchImpl !== 'function') {
    throw new Error('No fetch implementation available. Node 18+ or browser required.');
  }

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);

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
      clearTimeout(timer);

      // Retry on 5xx
      if (res.status >= 500 && attempt < retries) {
        lastErr = new HttpError(res.status, url, await safeText(res));
        await sleep(DEFAULTS.retryBaseMs * (2 ** attempt));
        continue;
      }

      const ct = res.headers.get('content-type') || '';
      let body;
      if (ct.includes('json') || (ct === '' && url.includes('.json'))) {
        body = await res.json().catch(async () => await safeText(res));
      } else if (ct.includes('xml') || ct.includes('html') || ct.includes('text')) {
        body = await res.text();
      } else {
        // Binary response — return as ArrayBuffer.
        body = await res.arrayBuffer();
      }

      if (!res.ok) {
        throw new HttpError(res.status, url, body);
      }
      return { ok: true, status: res.status, url, body, headers: Object.fromEntries(res.headers) };
    } catch (e) {
      clearTimeout(timer);
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
