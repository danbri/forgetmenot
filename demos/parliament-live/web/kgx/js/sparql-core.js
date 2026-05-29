// sparql-core.js — framework-free SPARQL execution + result rendering.
//
// Extracted from kgx/playground.html so every kgx client (playground,
// studio, future labs) shares one engine instead of copy-pasting it.
// Loads with a plain <script> tag and attaches to window.SparqlCore.
//
// Public surface (all on window.SparqlCore):
//   execute(endpoint, query)      -> Promise<{ ok, text, json, ms, bytes,
//                                              status, error, portableNote }>
//   render(container, res, opts)  -> draws into a DOM element
//   toCsv(json) / downloadBlob()  -> export helpers
//   permalink(base, query, epId)  -> shareable URL string
//
// `endpoint` is an object: { id, url, ... } from endpoints.json. `url`
// may be relative (proxied) or absolute.
//
// Depends optionally on window.wikidataPortable (kgx/js/wikidata-portable.js)
// to rewrite Blazegraph-only SERVICE wikibase:label into portable SPARQL
// when talking to a non-official-Wikidata endpoint. vis-network is loaded
// lazily from a CDN only when a #defaultView:Graph query is rendered.
(function () {
  'use strict';

  // ---- small helpers --------------------------------------------------------

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function isImageUri(href) {
    return /\.(?:jpe?g|png|gif|webp|svg)(?:$|\?)/i.test(href)
        || /commons\.wikimedia\.org\/wiki\/Special:FilePath\//i.test(href);
  }

  // wdt:P18 binds http:// Commons URLs; on an https:// page the browser
  // blocks them as mixed content. Rewrite img src to https:// (the link
  // href can stay as-is — following it is a top-level navigation).
  function httpsify(href) {
    return String(href).replace(/^http:\/\//, 'https://');
  }

  // ---- request --------------------------------------------------------------

  async function execute(endpoint, query) {
    if (!endpoint) return { ok: false, error: 'no endpoint selected' };
    var portableNote = '';
    // Rewrite Blazegraph-isms when the target isn't the official Wikidata.
    if (window.wikidataPortable && endpoint.id !== 'wikidata') {
      var rw = window.wikidataPortable(query);
      if (rw.changed) {
        query = rw.query;
        portableNote = ' · rewrote SERVICE wikibase:label → '
          + rw.optionalsInjected + ' OPTIONAL rdfs:label';
      }
    }
    var url = new URL(endpoint.url, window.location.href).toString();
    var useGet = query.length < 1500;
    var accept = 'application/sparql-results+json';
    var t0 = performance.now();
    var r;
    try {
      if (useGet) {
        var u = new URL(url);
        u.searchParams.set('query', query);
        r = await fetch(u.toString(), { headers: { accept: accept } });
      } else {
        r = await fetch(url, {
          method: 'POST',
          headers: { accept: accept, 'content-type': 'application/x-www-form-urlencoded' },
          body: 'query=' + encodeURIComponent(query),
        });
      }
    } catch (e) {
      return {
        ok: false,
        error: 'fetch error: ' + (e && e.message ? e.message : String(e))
          + '\n(endpoint may lack CORS headers — try the proxied copy if one exists)',
        ms: Math.round(performance.now() - t0),
        portableNote: portableNote,
      };
    }
    var ms = Math.round(performance.now() - t0);
    var text = await r.text();
    var bytes = text.length;
    if (!r.ok) {
      return {
        ok: false, status: r.status, ms: ms, bytes: bytes, portableNote: portableNote,
        error: 'HTTP ' + r.status + '\n' + text,
      };
    }
    var json = null;
    try { json = JSON.parse(text); } catch (_) { /* CONSTRUCT/DESCRIBE turtle, etc. */ }
    return { ok: true, status: r.status, text: text, json: json, ms: ms, bytes: bytes, portableNote: portableNote };
  }

  // ---- result shaping -------------------------------------------------------

  // WDQS-style: when results have both ?x and ?xLabel, render them as one
  // merged column (label primary, URI behind a small badge).
  function planLabelMerge(vars) {
    var set = new Set(vars);
    var labelOf = {};
    var skip = new Set();
    vars.forEach(function (v) {
      var cand = v + 'Label';
      if (set.has(cand) && v !== cand) { labelOf[v] = cand; skip.add(cand); }
    });
    return { displayVars: vars.filter(function (v) { return !skip.has(v); }), labelOf: labelOf };
  }

  function parseDirectives(query) {
    var out = {};
    var lines = String(query || '').split('\n').slice(0, 25);
    lines.forEach(function (line) {
      var m = line.match(/^\s*#\s*defaultView\s*:\s*([A-Za-z][A-Za-z0-9_-]*)/);
      if (m) out.defaultView = m[1];
    });
    return out;
  }

  function renderBinding(b, opts) {
    opts = opts || {};
    if (!b) return '';
    if (b.type === 'uri') {
      var href = b.value;
      if (opts.asImage && isImageUri(href)) {
        return '<a href="' + esc(href) + '" target="_blank" rel="noopener">'
          + '<img class="img-thumb" loading="lazy" alt="" src="' + esc(httpsify(href)) + '"></a>';
      }
      var short = href.length > 80 ? '…' + href.slice(-77) : href;
      return '<span class="uri"><a href="' + esc(href) + '" target="_blank" rel="noopener">' + esc(short) + '</a></span>';
    }
    if (b.type === 'literal' || b.type === 'typed-literal') {
      var tag = '';
      if (b.datatype) {
        tag = ' <span class="lit-tag">^^' + esc(b.datatype.replace(/^.*[#/]/, '')) + '</span>';
      } else if (b['xml:lang']) {
        tag = ' <span class="lit-tag">@' + esc(b['xml:lang']) + '</span>';
      }
      return esc(b.value) + tag;
    }
    if (b.type === 'bnode') return '<em>_:' + esc(b.value) + '</em>';
    return esc(JSON.stringify(b));
  }

  function renderMergedCell(uriBinding, labelBinding) {
    if (!uriBinding) return labelBinding ? renderBinding(labelBinding) : '';
    var label = labelBinding ? esc(labelBinding.value) : null;
    if (uriBinding.type !== 'uri') return renderBinding(uriBinding);
    var href = uriBinding.value;
    var short = href.replace(/^.*[\/#]/, '');
    var labelHtml = label ? '<div class="lbl">' + label + '</div>' : '';
    return labelHtml + '<a class="uri-badge" href="' + esc(href) + '" target="_blank" rel="noopener">' + esc(short) + '</a>';
  }

  function pickImageVar(vars, rows) {
    var named = vars.find(function (v) { return /(?:^|[A-Za-z])(?:image|img|pic|thumb|photo)$/i.test(v); });
    if (named) return named;
    return vars.find(function (v) {
      return rows.every(function (r) { return r[v] && r[v].type === 'uri' && isImageUri(r[v].value); });
    }) || null;
  }

  function pickLabelVar(vars, omit) {
    var lab = vars.find(function (v) { return /Label$/.test(v); });
    if (lab && lab !== omit) return lab;
    return vars.find(function (v) { return v !== omit; }) || null;
  }

  // ---- table ----------------------------------------------------------------

  var _sortState = null; // { var, dir }

  function sortRows(rows, sortVar, dir) {
    return rows.slice().sort(function (a, b) {
      var av = a[sortVar] ? a[sortVar].value : '';
      var bv = b[sortVar] ? b[sortVar].value : '';
      var an = parseFloat(av), bn = parseFloat(bv);
      if (!isNaN(an) && !isNaN(bn) && String(an) === av && String(bn) === bv) return (an - bn) * dir;
      return av.localeCompare(bv) * dir;
    });
  }

  function renderTable(rj) {
    var vars = (rj.head && rj.head.vars) || [];
    var rows = (rj.results && rj.results.bindings) || [];
    if (!rows.length) return '<div class="empty">No rows.</div>';
    var plan = planLabelMerge(vars);
    var displayVars = plan.displayVars, labelOf = plan.labelOf;

    var imageCols = new Set();
    displayVars.forEach(function (v) {
      if (/(?:^|[A-Za-z])(?:image|img|pic|thumb|photo)$/i.test(v)) imageCols.add(v);
      else if (rows.every(function (r) { return r[v] && r[v].type === 'uri' && isImageUri(r[v].value); })) imageCols.add(v);
    });

    if (_sortState && vars.indexOf(_sortState.var) !== -1) rows = sortRows(rows, _sortState.var, _sortState.dir);

    var ths = displayVars.map(function (v) {
      var arrow = _sortState && _sortState.var === v ? (_sortState.dir > 0 ? ' ▲' : ' ▼') : '';
      return '<th data-sort="' + esc(v) + '">' + esc(v) + arrow + '</th>';
    }).join('');

    var trs = rows.map(function (row) {
      var tds = displayVars.map(function (v) {
        if (labelOf[v]) return '<td>' + renderMergedCell(row[v], row[labelOf[v]]) + '</td>';
        return '<td>' + renderBinding(row[v], imageCols.has(v) ? { asImage: true } : {}) + '</td>';
      }).join('');
      return '<tr>' + tds + '</tr>';
    }).join('');

    return '<table><thead><tr>' + ths + '</tr></thead><tbody>' + trs + '</tbody></table>';
  }

  function attachSortHandlers(wrap, parsed) {
    wrap.querySelectorAll('th[data-sort]').forEach(function (th) {
      th.addEventListener('click', function () {
        var v = th.getAttribute('data-sort');
        _sortState = (_sortState && _sortState.var === v)
          ? { var: v, dir: -_sortState.dir } : { var: v, dir: 1 };
        wrap.innerHTML = renderTable(parsed);
        attachSortHandlers(wrap, parsed);
      }, { once: true });
    });
  }

  // ---- image grid -----------------------------------------------------------

  function renderImageGrid(rj) {
    var vars = (rj.head && rj.head.vars) || [];
    var rows = (rj.results && rj.results.bindings) || [];
    if (!rows.length) return '<div class="empty">No rows.</div>';
    var imgVar = pickImageVar(vars, rows);
    if (!imgVar) return '<div class="empty">defaultView:ImageGrid set but no image-shaped column found. Falling back to table.</div>' + renderTable(rj);
    var labVar = pickLabelVar(vars, imgVar);
    var detailVar = vars.find(function (v) { return v !== imgVar && v !== labVar; }) || null;
    var tiles = rows.map(function (r) {
      var img = r[imgVar];
      if (!img || img.type !== 'uri' || !isImageUri(img.value)) return '';
      var label = labVar && r[labVar] ? esc(r[labVar].value) : '';
      var detail = detailVar && r[detailVar] ? '<div class="grid-detail">' + esc(String(r[detailVar].value).slice(0, 60)) + '</div>' : '';
      return '<a class="grid-tile" href="' + esc(img.value) + '" target="_blank" rel="noopener">'
        + '<img class="grid-img" loading="lazy" alt="" src="' + esc(httpsify(img.value)) + '">'
        + '<div class="grid-label">' + label + '</div>' + detail + '</a>';
    }).join('');
    return '<div class="grid">' + tiles + '</div>';
  }

  // ---- bar chart (pure SVG) -------------------------------------------------

  function renderBarChart(rj, container) {
    var vars = (rj.head && rj.head.vars) || [];
    var rows = (rj.results && rj.results.bindings) || [];
    if (!rows.length) { container.innerHTML = '<div class="empty">No rows.</div>'; return; }
    var numVar = vars.find(function (v) { return rows.every(function (r) { return r[v] && !isNaN(parseFloat(r[v].value)); }); });
    var labVar = vars.find(function (v) { return v !== numVar; }) || vars[0];
    if (!numVar) { container.innerHTML = '<div class="empty">defaultView:BarChart needs a numeric column.</div>'; return; }
    var data = rows.map(function (r) { return { label: r[labVar] ? r[labVar].value : '', n: parseFloat(r[numVar].value) }; });
    var max = Math.max.apply(null, data.map(function (d) { return d.n; }).concat([1]));
    var w = 600, rowH = 26, padL = 180, padR = 60, padT = 8;
    var h = padT * 2 + data.length * rowH;
    var trim = function (s) { return s.length > 28 ? s.slice(0, 25) + '…' : s; };
    var bars = data.map(function (d, i) {
      var y = padT + i * rowH + 4;
      var bw = ((w - padL - padR) * d.n) / max;
      var labelText = trim(d.label.replace(/^.*[\/#]/, ''));
      return '<text x="' + (padL - 6) + '" y="' + (y + 13) + '" text-anchor="end" font-size="11" fill="#1a1a1a">' + esc(labelText) + '</text>'
        + '<rect x="' + padL + '" y="' + y + '" width="' + bw + '" height="' + (rowH - 8) + '" fill="#2a4f76" rx="2"></rect>'
        + '<text x="' + (padL + bw + 4) + '" y="' + (y + 13) + '" font-size="11" fill="#4a4a4a">' + esc(d.n.toLocaleString()) + '</text>';
    }).join('');
    container.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" style="width:100%;height:auto;background:white;border:1px solid var(--rule);border-radius:6px;">' + bars + '</svg>';
  }

  // ---- graph (lazy vis-network) ---------------------------------------------

  var _visPromise = null;
  function loadVisNetwork() {
    if (_visPromise) return _visPromise;
    _visPromise = new Promise(function (resolve, reject) {
      if (window.vis && window.vis.Network) { resolve(); return; }
      var css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://unpkg.com/vis-network/styles/vis-network.css';
      document.head.appendChild(css);
      var s = document.createElement('script');
      s.src = 'https://unpkg.com/vis-network/standalone/umd/vis-network.min.js';
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('failed to load vis-network')); };
      document.head.appendChild(s);
    });
    return _visPromise;
  }

  function renderGraph(rj, container) {
    var vars = (rj.head && rj.head.vars) || [];
    var rows = (rj.results && rj.results.bindings) || [];
    if (!rows.length) { container.innerHTML = '<div class="empty">No edges.</div>'; return; }
    if (vars.indexOf('source') === -1 || vars.indexOf('target') === -1) {
      container.innerHTML = '<div class="empty">defaultView:Graph needs ?source and ?target columns. Showing as table.</div>'
        + '<div class="tablewrap">' + renderTable(rj) + '</div>';
      return;
    }
    var nodes = new Map(), edges = [];
    rows.forEach(function (r) {
      var s = r.source && r.source.value, t = r.target && r.target.value;
      if (!s || !t) return;
      if (!nodes.has(s)) nodes.set(s, { id: s, label: (r.sourceLabel && r.sourceLabel.value) || s.replace(/^.*[\/#]/, ''), image: r.sourceImage && httpsify(r.sourceImage.value) });
      if (!nodes.has(t)) nodes.set(t, { id: t, label: (r.targetLabel && r.targetLabel.value) || t.replace(/^.*[\/#]/, ''), image: r.targetImage && httpsify(r.targetImage.value) });
      edges.push({ from: s, to: t, label: r.edgeLabel ? r.edgeLabel.value : undefined });
    });
    var nodeArr = Array.from(nodes.values()).map(function (n) {
      return n.image ? Object.assign({}, n, { shape: 'circularImage', size: 22 }) : Object.assign({}, n, { shape: 'dot', size: 14 });
    });
    container.innerHTML = '<div class="graph-host" id="graph-host"></div>'
      + '<p class="grid-detail" style="margin-top:6px;padding:0 4px;">' + nodeArr.length + ' nodes · ' + edges.length + ' edges · tap a node to centre, pinch to zoom</p>';
    loadVisNetwork().then(function () {
      var host = document.getElementById('graph-host');
      new window.vis.Network(host,
        { nodes: new window.vis.DataSet(nodeArr), edges: new window.vis.DataSet(edges) },
        {
          nodes: { font: { size: 12 }, borderWidth: 1 },
          edges: { arrows: 'to', smooth: { type: 'continuous' }, font: { size: 10 } },
          physics: { stabilization: { iterations: 80 }, barnesHut: { gravitationalConstant: -3000 } },
          interaction: { hover: true, dragNodes: true, zoomView: true },
        });
    }).catch(function (e) {
      container.innerHTML = '<div class="err">' + esc(e.message) + '</div>';
    });
  }

  // ---- exports --------------------------------------------------------------

  function toCsv(rj) {
    var vars = (rj.head && rj.head.vars) || [];
    var rows = (rj.results && rj.results.bindings) || [];
    var escCell = function (s) { return /[",\n]/.test(s) ? '"' + String(s).replace(/"/g, '""') + '"' : s; };
    var out = [vars.join(',')];
    rows.forEach(function (r) { out.push(vars.map(function (v) { return escCell(r[v] ? r[v].value : ''); }).join(',')); });
    return out.join('\n');
  }

  function downloadBlob(filename, mime, text) {
    var blob = new Blob([text], { type: mime });
    var u = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = u; a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 0);
  }

  function permalink(base, query, endpointId) {
    var u = new URL(base || window.location.href);
    u.hash = '#q=' + encodeURIComponent(query) + '&e=' + encodeURIComponent(endpointId || '');
    return u.toString();
  }

  // ---- top-level render -----------------------------------------------------
  //
  // opts:
  //   query         the query text (for #defaultView directive scan)
  //   onCsv/onJson  override download (else built-in)
  //   onPermalink   click handler for the Permalink button
  //   showRaw       include collapsible Raw JSON (default true)
  function render(container, res, opts) {
    opts = opts || {};
    _sortState = null;
    container.innerHTML = '';

    if (!res.ok || res.error) {
      var div = document.createElement('div');
      div.className = 'err';
      div.textContent = res.error || ('HTTP ' + (res.status || '?'));
      container.appendChild(div);
      return;
    }

    var parsed = res.json;
    if (parsed && parsed.boolean !== undefined) {
      var d = document.createElement('div');
      d.className = 'ask ' + (parsed.boolean ? 't' : 'f');
      d.textContent = parsed.boolean ? 'true' : 'false';
      container.appendChild(d);
      return;
    }

    if (parsed && parsed.head && parsed.results) {
      var nrows = parsed.results.bindings.length;
      var header = document.createElement('div');
      header.className = 'res-head';
      header.innerHTML =
        '<span class="res-count">' + nrows.toLocaleString() + ' row' + (nrows === 1 ? '' : 's') + '</span>'
        + '<span class="res-time">' + res.ms + ' ms · ' + (res.bytes || 0).toLocaleString() + ' bytes' + (res.portableNote || '') + '</span>'
        + '<span class="res-actions">'
        + '<button class="res-btn" data-act="csv">CSV</button>'
        + '<button class="res-btn" data-act="json">JSON</button>'
        + (opts.onPermalink ? '<button class="res-btn" data-act="link">Permalink</button>' : '')
        + '</span>';
      container.appendChild(header);

      var wrap = document.createElement('div');
      var directives = parseDirectives(opts.query || '');
      if (directives.defaultView === 'ImageGrid') {
        wrap.className = 'gridwrap'; wrap.innerHTML = renderImageGrid(parsed); container.appendChild(wrap);
      } else if (directives.defaultView === 'Graph') {
        wrap.className = 'graphwrap'; container.appendChild(wrap); renderGraph(parsed, wrap);
      } else if (directives.defaultView === 'BarChart') {
        wrap.className = 'barwrap'; container.appendChild(wrap); renderBarChart(parsed, wrap);
      } else {
        wrap.className = 'tablewrap'; wrap.innerHTML = renderTable(parsed); container.appendChild(wrap);
        attachSortHandlers(wrap, parsed);
      }

      header.querySelector('[data-act="csv"]').onclick = opts.onCsv || function () { downloadBlob('sparql-results.csv', 'text/csv', toCsv(parsed)); };
      header.querySelector('[data-act="json"]').onclick = opts.onJson || function () { downloadBlob('sparql-results.json', 'application/json', JSON.stringify(parsed, null, 2)); };
      var linkBtn = header.querySelector('[data-act="link"]');
      if (linkBtn && opts.onPermalink) linkBtn.onclick = opts.onPermalink;

      if (opts.showRaw !== false) {
        var det = document.createElement('details');
        det.innerHTML = '<summary>Raw JSON (' + (res.bytes || 0).toLocaleString() + ' bytes)</summary><pre class="raw"></pre>';
        det.querySelector('pre').textContent = JSON.stringify(parsed, null, 2);
        container.appendChild(det);
      }
      return;
    }

    // Plain JSON that isn't SPARQL-results-shaped (e.g. the Parliament
    // parameterised-query browser returns bare arrays), or Turtle from
    // CONSTRUCT/DESCRIBE. Show verbatim.
    var pre = document.createElement('pre');
    pre.className = 'raw';
    pre.textContent = parsed ? JSON.stringify(parsed, null, 2) : res.text;
    container.appendChild(pre);
  }

  window.SparqlCore = {
    execute: execute,
    render: render,
    toCsv: toCsv,
    downloadBlob: downloadBlob,
    permalink: permalink,
    esc: esc,
  };
})();
