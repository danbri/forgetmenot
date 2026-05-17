// Ordnance Survey OpenData (the no-auth-required subset).
// Base: https://api.os.uk/downloads/v1
//
// Tier-3 third-party. Operator: Ordnance Survey. Free, no API key
// required for these "OS OpenData" downloads (separate from the
// keyed OS Data Hub APIs — see notes below).
//
// What's wrapped:
//   /products                       — list every OS OpenData product
//   /products/{id}                  — one product's metadata + version
//   /products/{id}/downloads        — available formats / areas / sizes
//   /products/{id}/downloads/{file} — direct download URL (302 to file)
//
// What's NOT wrapped (keyed APIs — separate facility once we have a key):
//   /search/names/v1                — OS Names API
//   /features/v1                    — OS Features API
//   /maps/raster/v1, /maps/vector/v1, /maps/api/v1
import { get, getBytes } from '../http.mjs';

const BASE = 'https://api.os.uk/downloads/v1';

// Headline products useful for Parliament joins:
//   BoundaryLine      — every UK admin boundary (constituency, ward, council,
//                       civil parish) as shapefile / GeoPackage / GML / etc.
//   CodePointOpen     — postcode unit centroids (GB only)
//   OpenNames         — gazetteer (placename → coords)
//   OpenUPRN          — every Unique Property Reference Number
//   OpenRoads, OpenRivers, OpenGreenspace, OpenZoomstack — basemap layers

// List every product in the OS OpenData catalogue.
// Pass `filter` to substring-match against id/name client-side.
export async function products(opts = {}, ctx = {}) {
  const r = await get(`${BASE}/products`, {}, ctx);
  const list = Array.isArray(r.body) ? r.body : [];
  if (opts.filter) {
    const f = String(opts.filter).toLowerCase();
    return list.filter((p) =>
      (p.id || '').toLowerCase().includes(f) ||
      (p.name || '').toLowerCase().includes(f),
    );
  }
  return list;
}

// One product's metadata: name, description, version, versionDate,
// data formats, supply formats, licence URL.
export async function product(id, ctx = {}) {
  const r = await get(`${BASE}/products/${encodeURIComponent(id)}`, {}, ctx);
  return r.body;
}

// List available downloads for a product. Each entry has
// `{ format, area, size, fileName, url }`. Sizes can be large
// (Boundary-Line GPK is 800+ MB).
export async function downloads(id, ctx = {}) {
  const r = await get(`${BASE}/products/${encodeURIComponent(id)}/downloads`, {}, ctx);
  return Array.isArray(r.body) ? r.body : [];
}

// Build the direct-download URL for one file (the API returns
// 302 → the actual file URL when fetched). Use `download()` to
// actually pull the bytes; this just gives you the URL string.
export function downloadUrl(id, fileName) {
  return `${BASE}/products/${encodeURIComponent(id)}/downloads/${encodeURIComponent(fileName)}?redirect`;
}

// Download a product file. Returns the response body as bytes
// (Uint8Array). Caller should pipe to disk for large files.
//
// Warning: many OS products are hundreds of MB. Consider streaming
// via the underlying http.mjs `getBytes` + a Writable stream rather
// than buffering in memory for >100 MB downloads.
export async function download(id, fileName, ctx = {}) {
  return getBytes(downloadUrl(id, fileName), {}, ctx);
}

// Notes for the calling agent: the OS Data Hub also publishes keyed
// APIs (OS Names, OS Features, OS Maps, OS Vector Tile) at the same
// host. Those need a free API key from osdatahub.os.uk and are NOT
// wrapped here — we cover the no-key-required downloads only.
