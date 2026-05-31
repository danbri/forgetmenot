// =============================================================================
// kgx/lib/sparql-validate.mjs — defensive SPARQL string checks
//
// Single source of truth for "this SPARQL string is going to fail in an
// avoidable way before it leaves the page / CLI". Importable from both the
// browser (via /kgx/lib/sparql-validate.mjs) and node (via relative path
// from bin/kgx.mjs and tests/).
//
// All exports are pure string-in / void-or-throw — no fetch, no DOM. The
// validators are conservative: they error only on patterns that are
// unambiguously wrong, not on patterns that merely look suspicious. This
// keeps the wire-them-into-every-execution policy safe.
// =============================================================================

// SPARQL 1.1 §18.2.4.4: the target of an `(expr AS ?alias)` clause must not
// be a variable that is already bound in the WHERE body of the same SELECT.
// Strict engines (QLever, used by query.wikidata.org's QLever mirror)
// reject the query with HTTP 400; permissive engines (Stardog,
// api.parliament.uk/sparql) silently accept the same query. That asymmetry
// is exactly how a latent collision survives until it hits the strict
// endpoint — the bug that surfaced on fpkg.fly.dev as
//   replay failed at op rel-pivot: rel:works_by:default(18): HTTP 400
// for `(SAMPLE(?coord) AS ?coord)` paired with `?b wdt:P625 ?coord`
// (fixed in commit 123ad3e7).
//
// Wire this into every SPARQL-execution code path so future template
// authors can't ship the same class of bug regardless of which engine
// they target.
//
// Limitations of the string-based check (sufficient for the flat SELECTs
// this app issues; swap for a real SPARQL parser if these bite):
//   - Doesn't descend into subqueries; checks against the outermost
//     `WHERE { ... }` block only.
//   - Treats SPARQL keywords as case-insensitive but variable names as
//     case-sensitive (matches the spec).
//   - Does NOT flag aliases that appear only in ORDER BY / GROUP BY /
//     HAVING — those are valid post-projection references.
export function assertNoAliasCollisions(query, label = 'sparql') {
  const aliasMatches = [...query.matchAll(/\bAS\s+\?(\w+)\b/gi)];
  if (!aliasMatches.length) return;

  const whereStart = query.search(/\bWHERE\s*\{/i);
  if (whereStart < 0) return;
  const open = query.indexOf('{', whereStart);
  let depth = 0, end = -1;
  for (let i = open; i < query.length; i++) {
    if (query[i] === '{') depth++;
    else if (query[i] === '}' && --depth === 0) { end = i; break; }
  }
  if (end < 0) return;
  const whereBody = query.slice(open + 1, end);

  const seen = new Set();
  for (const m of aliasMatches) {
    const a = m[1];
    if (seen.has(a)) continue;
    seen.add(a);
    if (new RegExp(`\\?${a}\\b`).test(whereBody)) {
      throw new Error(
        `[${label}] SPARQL alias ?${a} also appears in the WHERE body — ` +
        `SPARQL 1.1 §18.2.4.4 forbids reusing an AS-target name there ` +
        `(strict engines like QLever return HTTP 400). ` +
        `Rename the WHERE-body variable to a distinct name.`,
      );
    }
  }
}
