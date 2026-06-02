// =============================================================================
// kgx/lib/engines.mjs — SparqlEngine class + registry
//
// Single small wrapper around `fetch(endpoint, query)` for any SPARQL 1.1
// HTTP endpoint. GET for small queries; POST (Content-Type:
// application/sparql-query, raw body) for queries that would exceed the
// conservative URL-length cap. Same shape as bin/kgx.mjs uses.
//
// Lifted to a library so the browser daisychain, the integrated studio,
// node tests, and the CLI all consume the same transport. Roles (the
// "Source Roles" design — primary / cross-check / adapter-evidence /
// weak) attach at the OP level, not the engine — different chains route
// the same engine for different evidential purposes — so they don't
// belong on these entries.
//
// Endpoint substitution: relative paths (`/kgx/query`, `/api/sparql`)
// resolve against the current page origin when running in the browser.
// In Node, `globalThis.location` is usually undefined; absolute URLs
// pass through unchanged, so the same class works in both.
// =============================================================================

const URL_LENGTH_THRESHOLD = 2048;   // POST when raw query exceeds this

function resolveEndpoint(endpoint) {
  // Absolute URL? pass through. Otherwise resolve against the page origin.
  if (/^[a-z]+:\/\//i.test(endpoint)) return endpoint;
  const base = (typeof globalThis !== 'undefined' && globalThis.location?.origin)
    ? globalThis.location.origin
    : 'http://invalid.local';  // sentinel; absolute URLs won't be relative
  return new URL(endpoint, base).toString();
}

export class SparqlEngine {
  constructor({ id, endpoint, label, kind = 'remote' }) {
    this.id = id;
    this.endpoint = endpoint;
    this.label = label;
    this.kind = kind;
  }

  async query(query, queryLabel = 'sparql') {
    if (this.kind !== 'remote') {
      throw new Error(`engine ${this.id}: kind=${this.kind} not implemented`);
    }
    const endpointUrl = resolveEndpoint(this.endpoint);
    const t0 = performance.now();
    let r;
    if (query.length > URL_LENGTH_THRESHOLD) {
      r = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/sparql-query',
          'Accept':       'application/sparql-results+json',
        },
        body: query,
      });
    } else {
      const u = new URL(endpointUrl);
      u.searchParams.set('query', query);
      r = await fetch(u.toString(), {
        headers: { 'Accept': 'application/sparql-results+json' },
      });
    }
    if (!r.ok) throw new Error(`${queryLabel}: HTTP ${r.status}`);
    const json = await r.json();
    const ms = Math.round(performance.now() - t0);
    return { json, query, endpoint: this.endpoint, engineId: this.id, ms, label: queryLabel };
  }
}

// Built-in registry — the engines the daisychain / pivcab / studio pages
// route through today. Browser-side endpoints (`/kgx/query`, `/api/sparql`)
// resolve against page origin; absolute endpoints pass through.
//
// Node tests construct their own engines pointing at absolute URLs so the
// resolveEndpoint() fallback is never exercised in node.
const QLEVER = 'https://qlever.dev/api/wikidata';

export const ENGINES = {
  'qlever-wikidata': new SparqlEngine({
    id: 'qlever-wikidata', endpoint: QLEVER, label: 'QLever ⇒ Wikidata',
  }),
  'fpkg': new SparqlEngine({
    id: 'fpkg', endpoint: '/kgx/query', label: 'FPKG (Oxigraph, server-side)',
  }),
  // The official UK Parliament SPARQL (the DDP store) — routed through
  // the fpkg proxy at /api/sparql per the demo's CLAUDE.md rule 3
  // (caching + TTL + OPL attribution header), even though the upstream
  // already sends CORS.
  'parl-sparql': new SparqlEngine({
    id: 'parl-sparql', endpoint: '/api/sparql', label: 'UK Parliament SPARQL (DDP)',
  }),
};

// Resolver: returns the registered engine for `id`, or throws.
export function engine(id) {
  const e = ENGINES[id];
  if (!e) throw new Error(`unknown engine: ${id}`);
  return e;
}
