// =============================================================================
// kgx/lib/node-flow.mjs — shared substrate for the node-flow demos
// (currently /kgx/pivcab/ and /kgx/daisychain/; future /kgx/beads/, etc.).
//
// The page-specific UI layers stay in each page's <script type="module">.
// What's here is the engine: typed entity sets, set algebra backed by a
// compact bloom filter, and a handful of pure utilities every page needs.
//
// Loaded directly by the browser via:
//   import { Bundle, Bloom, commonsThumb, … } from '/kgx/lib/node-flow.mjs';
// =============================================================================

// -----------------------------------------------------------------------------
// Bloom filter — compact set-membership with tunable false-positive rate.
// Uint32Array bit field; FNV-1a + Murmur-mix double hash + Kirsch-Mitzenmacher
// linear combination for the k probes. Small (≤ ~30 KB for 10k items at p=0.5%)
// and fast — designed for set algebra on bundles that may not fit in working
// memory in their entirety.
// -----------------------------------------------------------------------------
export class Bloom {
  constructor(expectedItems = 1000, falsePositiveRate = 0.01) {
    // m = -n ln(p) / (ln 2)^2 ;  k = (m/n) ln 2
    const m = Math.ceil(-expectedItems * Math.log(falsePositiveRate) / (Math.LN2 ** 2));
    this.m = Math.max(64, m);
    this.k = Math.max(2, Math.round((this.m / expectedItems) * Math.LN2));
    this.bits = new Uint32Array(Math.ceil(this.m / 32));
    this.n = 0;
  }
  _h1(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    }
    return h >>> 0;
  }
  _h2(s) {
    let h = this._h1(s);
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return (h ^ (h >>> 16)) >>> 0;
  }
  add(s) {
    const h1 = this._h1(s), h2 = this._h2(s);
    for (let i = 0; i < this.k; i++) {
      const b = (h1 + i * h2) % this.m;
      this.bits[b >>> 5] |= (1 << (b & 31));
    }
    this.n++;
    return this;
  }
  has(s) {
    const h1 = this._h1(s), h2 = this._h2(s);
    for (let i = 0; i < this.k; i++) {
      const b = (h1 + i * h2) % this.m;
      if (!(this.bits[b >>> 5] & (1 << (b & 31)))) return false;
    }
    return true;
  }
  static from(items, p = 0.01) {
    const bf = new Bloom(items.length || 1, p);
    for (const x of items) bf.add(String(x));
    return bf;
  }
}

// -----------------------------------------------------------------------------
// Bundle — a typed entity set. Wraps an items[] (each carrying a `.uri`) plus
// a memoised id Set and a lazy bloom. Static union / intersect / difference
// give the design's edge-on-the-DAG semantics; the bloom skips hash-table
// probes when one of the inputs is large enough that random `has` calls hurt.
// -----------------------------------------------------------------------------
export class Bundle {
  constructor(items, type = 'human', label = 'set') {
    this.items = items;
    this.type = type;
    this.label = label;
    this._idSet = null;
    this._bloom = null;
  }
  get ids() {
    if (!this._idSet) this._idSet = new Set(this.items.map((i) => i.uri));
    return this._idSet;
  }
  get bloom() {
    if (!this._bloom) this._bloom = Bloom.from([...this.ids], 0.005);
    return this._bloom;
  }
  get size() { return this.items.length; }

  static union(a, b) {
    const seen = new Set();
    const out = [];
    for (const x of [...a.items, ...b.items]) {
      if (!seen.has(x.uri)) { seen.add(x.uri); out.push(x); }
    }
    return new Bundle(out, a.type, `${a.label} ∪ ${b.label}`);
  }
  static intersect(a, b) {
    // Always probe the smaller bundle's bloom from the larger bundle's
    // iteration — false positives still get caught by the exact ids Set,
    // but the bloom skips the cache miss when the answer is clearly "no".
    const [small, large] = a.size <= b.size ? [a, b] : [b, a];
    const smallBloom = small.bloom, smallIds = small.ids;
    const out = [];
    for (const x of large.items) {
      if (smallBloom.has(x.uri) && smallIds.has(x.uri)) out.push(x);
    }
    return new Bundle(out, a.type, `${a.label} ∩ ${b.label}`);
  }
  static difference(a, b) {
    const bBloom = b.bloom, bIds = b.ids;
    const out = a.items.filter((x) => !(bBloom.has(x.uri) && bIds.has(x.uri)));
    return new Bundle(out, a.type, `${a.label} ∖ ${b.label}`);
  }
}

// -----------------------------------------------------------------------------
// Tiny utilities every node-flow page uses.
// -----------------------------------------------------------------------------

export function httpsify(u) {
  return String(u || '').replace(/^http:\/\//, 'https://');
}

// Wikimedia Commons Special:FilePath URLs accept a `?width=N` query parameter
// that returns a server-resized thumbnail. For other hosts, just return the
// URL as-is (https-upgraded). Keeps tile rendering fast on mobile.
export function commonsThumb(url, w = 220) {
  if (!url) return '';
  const v = httpsify(url);
  if (/commons\.wikimedia\.org\/wiki\/Special:FilePath\//i.test(v)) {
    return v + (v.includes('?') ? '&' : '?') + 'width=' + w;
  }
  return v;
}

// WKT "POINT(lon lat)" → { lat, lon } | null. Lenient about whitespace.
// (Wikidata wdt:P625 via QLever returns WKT literals.)
export function parsePoint(s) {
  const m = String(s || '').match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
  if (!m) return null;
  const lon = +m[1], lat = +m[2];
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  return { lat, lon };
}

// Minimum-viable HTML escape for text we splat into innerHTML.
export function escapeHTML(s) {
  return String(s ?? '').replace(/[<>&"]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
}

// SPARQL VALUES clause from a list of Wikidata-style URIs. Filters out
// anything that doesn't look like a QID URI, dedupes, prefixes with `wd:`.
//
// Throws on empty result rather than emit `VALUES ?x { }`, which is invalid
// SPARQL 1.1 and would surface as a parser error from the engine — burying
// the actual cause (a bundle that lost all its QIDs through filtering).
// Callers that legitimately handle empty bundles should guard upstream.
export function valuesQids(items) {
  const qs = (items || [])
    .map((x) => (typeof x === 'string' ? x : x?.uri))
    .map((u) => (u && typeof u === 'string' && u.match(/Q\d+$/) || [])[0])
    .filter(Boolean);
  const uniq = [...new Set(qs)];
  if (!uniq.length) {
    throw new Error(`valuesQids: 0 Wikidata QIDs from ${items?.length ?? 0} item(s) — bundle has no Q-URIs`);
  }
  return uniq.map((q) => `wd:${q}`).join(' ');
}
