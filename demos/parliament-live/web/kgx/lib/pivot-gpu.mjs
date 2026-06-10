// =============================================================================
// kgx/lib/pivot-gpu.mjs — GPU pivot renderer (WebGPU preferred, WebGL2
// fallback) with a hidden picking pass for hover hit-testing.
//
// Why this exists: the DOM pivot stage (one button + img per item, retargeted
// via CSS transforms) holds 60fps on a 5k-item bundle. For chains in the
// 50k+ range we need to render via instanced point sprites against a shared
// texture atlas — one draw call instead of N DOM nodes. The transitions stay
// visually equivalent (per-instance transform interpolated between frames),
// but a single 4K atlas + an instance buffer beats the compositor at scale.
//
// Architecture:
//
//   gpuPivotCapabilities()     → { webgpu, webgl2, recommended }
//   PivotAtlas                 → packs N thumbnails into a single canvas /
//                                 texture; emits { canvas, slices } where
//                                 slices is Map<itemKey, {x, y, w, h}> in
//                                 pixel coords on the atlas
//   gridAtlasLayout(n, opts)   → pure: returns { atlasW, atlasH, cols, rows,
//                                 cellW, cellH }. Used by PivotAtlas and by
//                                 the build-time atlas cache (see follow-up).
//   PivotRenderer              → owns the WebGL2 / WebGPU pipeline. draw(),
//                                 setAtlas(), pick(x, y), destroy().
//
// Cached-atlas contract (build-time, follow-up commit):
//   The chain's seed-stable items (LIBRARY entries, recent-sis, …) produce
//   a deterministic atlas keyed by digest(sorted itemKeys). At deploy time
//   we build `/kgx/atlas/<digest>.png` + `.json` (the slices map). The page
//   tries the cached path first; falls back to runtime build in a worker.
//   See `/api/atlas/` route stub in server.mjs.
//
// The lib stays DOM-free (factories take an HTMLCanvasElement). Tests pin
// the pure layout math; the GPU plumbing is exercised in-browser only.
// =============================================================================

// ---------------------------------------------------------------------------
// Capability detection.
//
// We prefer WebGPU when available — it's a more modern API and lifts the
// per-draw fixed cost. But Safari is still rolling it out (17.4+ is the
// first stable shipment, on by default in 18+; the 17.x range had it
// behind a flag), so WebGL2 stays the default fallback. Both run the same
// pipeline conceptually; the renderer abstracts over them.
// ---------------------------------------------------------------------------

export function gpuPivotCapabilities() {
  const webgl2 = typeof document !== 'undefined' && (() => {
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2');
      return !!gl;
    } catch { return false; }
  })();
  const webgpu = typeof navigator !== 'undefined' && !!navigator.gpu;
  return {
    webgl2,
    webgpu,
    recommended: webgpu ? 'webgpu' : (webgl2 ? 'webgl2' : 'none'),
  };
}

// ---------------------------------------------------------------------------
// gridAtlasLayout — pure. Pack N equally-sized cells into a near-square
// atlas no larger than maxSide. Returns null when N exceeds capacity so
// callers can split into multiple atlases (texture array slot).
// ---------------------------------------------------------------------------

export function gridAtlasLayout(n, opts = {}) {
  const cellW   = opts.cellW   || 48;
  const cellH   = opts.cellH   || 48;
  const maxSide = opts.maxSide || 4096;
  if (n <= 0) return { atlasW: 0, atlasH: 0, cols: 0, rows: 0, cellW, cellH, capacity: 0 };
  const cols = Math.min(Math.floor(maxSide / cellW), Math.ceil(Math.sqrt(n)));
  if (cols <= 0) return null;
  const rows = Math.ceil(n / cols);
  if (rows * cellH > maxSide) return null;     // overflow — caller splits
  // Round atlas dimensions up to the next power-of-two for older drivers
  // that prefer it; modern WebGL2 doesn't require it but doesn't penalise it.
  const atlasW = nextPow2(cols * cellW);
  const atlasH = nextPow2(rows * cellH);
  return { atlasW, atlasH, cols, rows, cellW, cellH, capacity: cols * rows };
}
function nextPow2(n) { let p = 1; while (p < n) p <<= 1; return p; }

// Maximum items in a single atlas at the chosen cell size. Above this,
// PivotAtlas would need to split into multiple atlases (sampled via a
// texture array or a per-instance atlasIdx attribute).
export function maxItemsPerAtlas(opts = {}) {
  const layout = gridAtlasLayout(1 << 20, opts);  // try with a huge n
  // gridAtlasLayout returns null on overflow; if it didn't, capacity is the
  // ceiling. Re-run with a small n to compute the ceiling:
  const cellW   = opts.cellW   || 48;
  const cellH   = opts.cellH   || 48;
  const maxSide = opts.maxSide || 4096;
  const cols = Math.floor(maxSide / cellW);
  const rows = Math.floor(maxSide / cellH);
  return cols * rows;
}

// ---------------------------------------------------------------------------
// PivotAtlas — fetches images and paints them into a single 2D canvas at
// fixed cell positions. The canvas becomes the GL texture; slices[key]
// tells the renderer where in the atlas each item's image lives.
//
// Item shape: { key, imageUrl } where key is the stable identity (we use
// item.uri || 'label:<text>') and imageUrl is the resolved URL.
//
// Failed loads — broken image URL, CORS error, 404 — fall through to a
// placeholder cell (solid accent fill) so the layout doesn't shift around
// the missing slot. This is the "fail loud but don't crash" behaviour
// CLAUDE.md rule 11 asks for: the cell is visibly the placeholder colour,
// not a real image, so users can tell the data was missing.
// ---------------------------------------------------------------------------

const PLACEHOLDER_RGB = [177, 144, 96];  // accent-ish tan; visible against white

export class PivotAtlas {
  constructor(items, opts = {}) {
    this.items = items;
    this.opts  = opts;
    this.canvas = null;
    this.slices = new Map();
    this.layout = null;
  }

  async build() {
    if (typeof document === 'undefined') {
      throw new Error('PivotAtlas.build() needs a DOM (document.createElement)');
    }
    const layout = gridAtlasLayout(this.items.length, this.opts);
    if (!layout) throw new Error(`PivotAtlas: ${this.items.length} items exceeds single-atlas capacity at the chosen cell size (call maxItemsPerAtlas() to size — multi-atlas support is a follow-up)`);
    this.layout = layout;

    const canvas = document.createElement('canvas');
    canvas.width = layout.atlasW;
    canvas.height = layout.atlasH;
    const ctx = canvas.getContext('2d', { willReadFrequently: false });

    // Concurrent loads, capped so we don't open 5000 sockets at once. A
    // small AbortController per item bounds the wait at WORK_TIMEOUT_MS
    // — slow upstreams produce placeholders, not hangs.
    const PARALLEL = 16, WORK_TIMEOUT_MS = 6000;
    let nextIdx = 0;
    const slotOf = (i) => ({
      x: (i % layout.cols) * layout.cellW,
      y: Math.floor(i / layout.cols) * layout.cellH,
    });
    const drawPlaceholder = (i) => {
      const { x, y } = slotOf(i);
      ctx.fillStyle = `rgb(${PLACEHOLDER_RGB.join(',')})`;
      ctx.fillRect(x, y, layout.cellW, layout.cellH);
    };
    const drawImage = async (i) => {
      const { key, imageUrl } = this.items[i];
      const slot = slotOf(i);
      this.slices.set(key, { x: slot.x, y: slot.y, w: layout.cellW, h: layout.cellH });
      if (!imageUrl) { drawPlaceholder(i); return; }
      try {
        const img = await loadImage(imageUrl, WORK_TIMEOUT_MS);
        ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight,
                           slot.x, slot.y, layout.cellW, layout.cellH);
      } catch {
        drawPlaceholder(i);
      }
    };
    const workers = Array.from({ length: PARALLEL }, async () => {
      while (true) {
        const i = nextIdx++;
        if (i >= this.items.length) return;
        await drawImage(i);
      }
    });
    await Promise.all(workers);
    this.canvas = canvas;
    return { canvas, slices: this.slices, layout };
  }
}

function loadImage(src, timeoutMs) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => { img.src = ''; reject(new Error('timeout')); }, timeoutMs);
    img.onload  = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); reject(new Error('load')); };
    img.src = src;
  });
}

// ---------------------------------------------------------------------------
// PivotRenderer — WebGL2 instanced quads sampling a shared atlas.
//
// Per-instance attribute buffer carries [x, y, scale, slotX, slotY, slotW,
// slotH, id] — eight floats per item. id is the slot index, used by the
// picking pass to encode 24-bit ids as RGB so a 1×1 readback under the
// cursor returns the hit item.
//
// The same code path covers transitions: the JS side interpolates each
// item's (x, y, scale) between layouts and re-uploads the per-instance
// buffer each frame during the transition; otherwise we draw the static
// buffer untouched.
// ---------------------------------------------------------------------------

const RENDER_VS = `#version 300 es
in vec2 a_corner;            // [0,0]..[1,1] per-vertex unit quad
in vec4 a_xys;               // x, y, scale, _pad
in vec4 a_uvs;               // slotX, slotY, slotW, slotH (atlas pixels)
in float a_id;               // 24-bit id encoded later in RGB
uniform vec2 u_view;         // viewport size in CSS px
uniform vec2 u_offset;       // scroll offset in CSS px
uniform vec2 u_atlasSize;    // atlas px
uniform float u_zoom;
out vec2 v_uv;
flat out float v_id;
void main() {
  vec2 pos = vec2(a_xys.x, a_xys.y) * u_zoom - u_offset;
  float side = 24.0 * a_xys.z * u_zoom;
  vec2 v = pos + a_corner * side;
  vec2 ndc = (v / u_view) * 2.0 - 1.0;
  ndc.y = -ndc.y;
  gl_Position = vec4(ndc, 0.0, 1.0);
  v_uv = (a_uvs.xy + a_corner * a_uvs.zw) / u_atlasSize;
  v_id = a_id;
}`;

const RENDER_FS = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_atlas;
out vec4 outColor;
void main() {
  outColor = texture(u_atlas, v_uv);
}`;

const PICK_FS = `#version 300 es
precision mediump float;
flat in float v_id;
out vec4 outColor;
void main() {
  // Encode the 24-bit instance id as RGB so a hidden-framebuffer readback
  // recovers it: red = lowest 8 bits, green = next 8, blue = top 8.
  float id = v_id;
  float r = mod(id, 256.0);            id = floor(id / 256.0);
  float g = mod(id, 256.0);            id = floor(id / 256.0);
  float b = mod(id, 256.0);
  outColor = vec4(r / 255.0, g / 255.0, b / 255.0, 1.0);
}`;

export class PivotRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error('PivotRenderer: WebGL2 not available');
    this.gl = gl;
    this.atlas = { texture: null, width: 1, height: 1 };
    this.instanceCount = 0;
    this.instances = null;
    this._initPipeline();
    this._initPickFB();
  }

  _initPipeline() {
    const gl = this.gl;
    this.renderProg = makeProgram(gl, RENDER_VS, RENDER_FS);
    this.pickProg   = makeProgram(gl, RENDER_VS, PICK_FS);
    // Per-vertex unit quad (two triangles).
    const corners = new Float32Array([0, 0,  1, 0,  0, 1,  0, 1,  1, 0,  1, 1]);
    this.vaoR = makeVAO(gl, this.renderProg, corners);
    this.vaoP = makeVAO(gl, this.pickProg,   corners);
  }

  _initPickFB() {
    const gl = this.gl;
    this.pickFB = gl.createFramebuffer();
    this.pickTex = gl.createTexture();
    this.pickW = 0; this.pickH = 0;
  }

  setAtlas({ canvas, layout }) {
    const gl = this.gl;
    if (!this.atlas.texture) this.atlas.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.atlas.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.atlas.width  = layout.atlasW;
    this.atlas.height = layout.atlasH;
  }

  // instances: Float32Array layout per item:
  //   [x, y, scale, 0,  slotX, slotY, slotW, slotH,  id, 0, 0, 0]
  // (12 floats — last 3 pad keep stride aligned). count is item count.
  setInstances(instances, count) {
    const gl = this.gl;
    const stride = 12 * 4;
    gl.bindVertexArray(this.vaoR);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vaoR._instBuf);
    gl.bufferData(gl.ARRAY_BUFFER, instances, gl.DYNAMIC_DRAW);
    gl.bindVertexArray(this.vaoP);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vaoP._instBuf);
    gl.bufferData(gl.ARRAY_BUFFER, instances, gl.DYNAMIC_DRAW);
    this.instanceCount = count;
    this.instances = instances;
    void stride;
  }

  draw({ viewW, viewH, offsetX, offsetY, zoom }) {
    const gl = this.gl;
    if (this.canvas.width !== viewW)  this.canvas.width  = viewW;
    if (this.canvas.height !== viewH) this.canvas.height = viewH;
    gl.viewport(0, 0, viewW, viewH);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!this.instanceCount || !this.atlas.texture) return;
    gl.useProgram(this.renderProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlas.texture);
    gl.uniform1i(this.renderProg.u_atlas, 0);
    gl.uniform2f(this.renderProg.u_view, viewW, viewH);
    gl.uniform2f(this.renderProg.u_offset, offsetX, offsetY);
    gl.uniform2f(this.renderProg.u_atlasSize, this.atlas.width, this.atlas.height);
    gl.uniform1f(this.renderProg.u_zoom, zoom);
    gl.bindVertexArray(this.vaoR);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.instanceCount);
  }

  // Read back the instance id under (px, py) — returns -1 on miss.
  pick({ viewW, viewH, offsetX, offsetY, zoom, px, py }) {
    const gl = this.gl;
    // Resize the picking framebuffer's attached texture if needed.
    if (this.pickW !== viewW || this.pickH !== viewH) {
      gl.bindTexture(gl.TEXTURE_2D, this.pickTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, viewW, viewH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.pickFB);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.pickTex, 0);
      this.pickW = viewW; this.pickH = viewH;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.pickFB);
    gl.viewport(0, 0, viewW, viewH);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.pickProg);
    gl.uniform2f(this.pickProg.u_view, viewW, viewH);
    gl.uniform2f(this.pickProg.u_offset, offsetX, offsetY);
    gl.uniform2f(this.pickProg.u_atlasSize, this.atlas.width, this.atlas.height);
    gl.uniform1f(this.pickProg.u_zoom, zoom);
    gl.bindVertexArray(this.vaoP);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.instanceCount);
    const buf = new Uint8Array(4);
    gl.readPixels(px, viewH - py - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (buf[3] === 0) return -1;
    return buf[0] | (buf[1] << 8) | (buf[2] << 16);
  }

  destroy() {
    const gl = this.gl;
    if (this.atlas.texture) gl.deleteTexture(this.atlas.texture);
    if (this.pickTex) gl.deleteTexture(this.pickTex);
    if (this.pickFB)  gl.deleteFramebuffer(this.pickFB);
    if (this.vaoR)    gl.deleteVertexArray(this.vaoR);
    if (this.vaoP)    gl.deleteVertexArray(this.vaoP);
    if (this.renderProg) gl.deleteProgram(this.renderProg);
    if (this.pickProg)   gl.deleteProgram(this.pickProg);
  }
}

// ---------------------------------------------------------------------------
// WebGL helpers — small inline so the renderer is self-contained.
// ---------------------------------------------------------------------------

function makeShader(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    throw new Error(`shader compile: ${log}\n--- source ---\n${src}`);
  }
  return sh;
}
function makeProgram(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, makeShader(gl, gl.VERTEX_SHADER,   vs));
  gl.attachShader(p, makeShader(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error('program link: ' + gl.getProgramInfoLog(p));
  }
  p.a_corner   = gl.getAttribLocation(p, 'a_corner');
  p.a_xys      = gl.getAttribLocation(p, 'a_xys');
  p.a_uvs      = gl.getAttribLocation(p, 'a_uvs');
  p.a_id       = gl.getAttribLocation(p, 'a_id');
  p.u_view     = gl.getUniformLocation(p, 'u_view');
  p.u_offset   = gl.getUniformLocation(p, 'u_offset');
  p.u_atlasSize = gl.getUniformLocation(p, 'u_atlasSize');
  p.u_zoom     = gl.getUniformLocation(p, 'u_zoom');
  p.u_atlas    = gl.getUniformLocation(p, 'u_atlas');
  return p;
}
function makeVAO(gl, p, corners) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  // Static per-vertex corners.
  const cornerBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf);
  gl.bufferData(gl.ARRAY_BUFFER, corners, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(p.a_corner);
  gl.vertexAttribPointer(p.a_corner, 2, gl.FLOAT, false, 0, 0);
  // Dynamic per-instance attribute buffer (12 floats stride).
  const instBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
  const STRIDE = 12 * 4;
  if (p.a_xys >= 0) {
    gl.enableVertexAttribArray(p.a_xys);
    gl.vertexAttribPointer(p.a_xys, 4, gl.FLOAT, false, STRIDE, 0);
    gl.vertexAttribDivisor(p.a_xys, 1);
  }
  if (p.a_uvs >= 0) {
    gl.enableVertexAttribArray(p.a_uvs);
    gl.vertexAttribPointer(p.a_uvs, 4, gl.FLOAT, false, STRIDE, 16);
    gl.vertexAttribDivisor(p.a_uvs, 1);
  }
  if (p.a_id >= 0) {
    gl.enableVertexAttribArray(p.a_id);
    gl.vertexAttribPointer(p.a_id, 1, gl.FLOAT, false, STRIDE, 32);
    gl.vertexAttribDivisor(p.a_id, 1);
  }
  vao._instBuf = instBuf;
  return vao;
}
