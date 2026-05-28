// wikidata-portable.js
//
// Rewrite Wikidata's Blazegraph-flavoured SPARQL into vanilla SPARQL 1.1
// so the same query runs on QLever, OpenLink Virtuoso, DBpedia, or any
// other standards-compliant endpoint — not just query.wikidata.org.
//
// Transformations:
//
//   SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
//     → removed. For every ?xxxLabel in the SELECT, an OPTIONAL clause
//       is injected inside the outer WHERE that binds rdfs:label of
//       ?xxx with an "@en" language filter.
//
//   PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
//     → injected at the top if not already present, but only when
//       we needed to inject at least one OPTIONAL clause.
//
// Conversion is always safe: the rewritten query is a strict subset of
// what wikibase:label does (it doesn't try to fetch altLabels, schema:
// descriptions, or qualifier-language fallback), but it produces the
// same ?xxxLabel binding in every common case.
//
// Returns { query, changed, optionalsInjected } so callers can show
// the user when a rewrite happened.

(function (root) {
  function wikidataPortable(query) {
    const out = { query, changed: false, optionalsInjected: 0 };
    if (!/SERVICE\s+wikibase:label/i.test(query)) return out;

    // Strip the SERVICE wikibase:label clause. Greedy non-{ match is
    // enough because the label-service body never nests braces.
    let q = query.replace(/SERVICE\s+wikibase:label\s*\{[^}]*\}\s*/gi, '');

    // Find ?xxxLabel vars used in the SELECT projection. We look at
    // the projection list specifically because labels can appear in
    // ORDER BY / GROUP BY without being projected — those are user
    // bindings, leave them alone.
    const selectMatch = q.match(/SELECT\s+(?:DISTINCT\s+)?(.+?)\s+WHERE/is);
    const labelBases = new Set();
    if (selectMatch) {
      const vars = selectMatch[1].match(/\?\w+Label\b/g) || [];
      for (const v of vars) labelBases.add(v.slice(1, -5));
    }

    if (labelBases.size === 0) {
      // SERVICE clause was there but no ?xxxLabel projected. Treat as a
      // no-op rewrite (the user probably meant something specific).
      out.query = q;
      out.changed = true;
      return out;
    }

    // Build OPTIONAL clauses, one per label base.
    const optionals = [...labelBases]
      .map((b) => `  OPTIONAL { ?${b} rdfs:label ?${b}Label . FILTER (lang(?${b}Label) = "en") }`)
      .join('\n');

    // Inject just before the outer WHERE's closing brace. Brace-walk
    // to find it correctly when there are nested patterns.
    const whereStart = q.match(/WHERE\s*\{/i);
    if (whereStart) {
      let i = whereStart.index + whereStart[0].length;
      let depth = 1;
      while (i < q.length && depth > 0) {
        const c = q[i];
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) break; }
        i++;
      }
      if (i < q.length) {
        q = q.slice(0, i) + '\n' + optionals + '\n' + q.slice(i);
      }
    }

    // Make sure rdfs is declared. Append after the last existing PREFIX
    // for cleanliness; if there are no PREFIXes at all, prepend.
    if (!/PREFIX\s+rdfs\s*:/i.test(q)) {
      const lastPrefix = [...q.matchAll(/^PREFIX\s+\w+\s*:\s*<[^>]+>\s*$/gim)].pop();
      const decl = 'PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>';
      if (lastPrefix) {
        const end = lastPrefix.index + lastPrefix[0].length;
        q = q.slice(0, end) + '\n' + decl + q.slice(end);
      } else {
        q = decl + '\n' + q;
      }
    }

    out.query = q;
    out.changed = true;
    out.optionalsInjected = labelBases.size;
    return out;
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { wikidataPortable };
  else root.wikidataPortable = wikidataPortable;
})(typeof window !== 'undefined' ? window : globalThis);
