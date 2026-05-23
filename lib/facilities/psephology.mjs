// Psephology — local Postgres database of UK Parliament election
// results, maintained by the House of Commons Library and published
// as daily SQL dumps at github.com/ukparliament/psephology.
//
// Spin the database up with `bash scripts/psephology-up.sh`; this
// module is a thin SQL passthrough that shells out to `psql`. We
// deliberately avoid a runtime `pg` dependency — the lib stays
// zero-dependency like the rest of `lib/facilities/`.
//
// All queries are run as user `postgres` against database
// `psephology` on the local host. If you need a different host /
// user, pass `--pg-uri postgresql://user:pass@host:port/db`.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dumpCache = resolve(repoRoot, 'third_party/data/psephology');
const DB_DEFAULT = 'psephology';

// Choose how to invoke psql:
//   1. If $PSEPHOLOGY_URI is set, use that as a connection string
//      (caller's responsibility to supply credentials).
//   2. Otherwise prefer the local-socket peer-auth path via
//      `sudo -n -u postgres psql -d psephology`, which is what the
//      spin-up script uses.
//   3. Failing that, fall back to TCP as `postgres@localhost`,
//      which will only work if the cluster is configured for
//      trust on localhost.
async function psql(sqlText, opts = {}) {
  const db = opts.database || DB_DEFAULT;
  const uri = opts.pgUri || process.env.PSEPHOLOGY_URI;

  let cmd, args;
  if (uri) {
    cmd = 'psql';
    args = [uri, '-tAc', sqlText];
  } else if (await sudoAvailable()) {
    cmd = 'sudo';
    args = ['-n', '-u', 'postgres', 'psql', '-d', db, '-tAc', sqlText];
  } else {
    cmd = 'psql';
    args = ['-h', 'localhost', '-U', 'postgres', '-d', db, '-tAc', sqlText];
  }
  try {
    const { stdout } = await exec(cmd, args,
      { maxBuffer: 64 * 1024 * 1024, timeout: 60_000 });
    return stdout;
  } catch (e) {
    const stderr = (e.stderr || '').toString().trim();
    throw new Error(`psql failed: ${stderr || e.message}`);
  }
}

let _sudoCached = null;
async function sudoAvailable() {
  if (_sudoCached !== null) return _sudoCached;
  try { await exec('sudo', ['-n', 'true'], { timeout: 2000 }); _sudoCached = true; }
  catch { _sudoCached = false; }
  return _sudoCached;
}

// Run a SQL string and return the rows as parsed JSON. We wrap the
// query in `json_agg(row_to_json(t))` inside psql so the return
// value is always a single JSON array — no need to parse psql's
// tabular output ourselves.
async function runJson(sql, opts = {}) {
  const wrapped = `SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)::text
                   FROM (${stripTrailingSemi(sql)}) t;`;
  const stdout = await psql(wrapped, opts);
  return JSON.parse(stdout.trim() || '[]');
}

function stripTrailingSemi(s) {
  return s.trim().replace(/;\s*$/, '');
}

// Public surface ---------------------------------------------------

export async function sql(query, opts = {}) {
  if (!query) throw new Error('sql: missing query');
  return runJson(query, opts);
}

export async function sqlFile(path, opts = {}) {
  const q = readFileSync(path, 'utf8');
  return runJson(q, opts);
}

export async function tables(opts = {}) {
  return runJson(`
    SELECT relname AS table,
           n_live_tup AS rows
    FROM   pg_stat_user_tables
    ORDER  BY n_live_tup DESC, relname
  `, opts);
}

export async function tableSchema(table, opts = {}) {
  return runJson(`
    SELECT column_name        AS name,
           data_type          AS type,
           is_nullable = 'YES' AS nullable,
           column_default     AS "default"
    FROM   information_schema.columns
    WHERE  table_schema = 'public' AND table_name = '${sanitiseIdent(table)}'
    ORDER  BY ordinal_position
  `, opts);
}

export async function generalElections(opts = {}) {
  return runJson(`
    SELECT ge.id,
           ge.polling_on,
           COUNT(e.*)                                       AS contested_seats,
           SUM(e.valid_vote_count)                          AS valid_votes,
           SUM(e.invalid_vote_count)                        AS invalid_votes
    FROM   general_elections ge
    LEFT   JOIN elections    e ON e.general_election_id = ge.id
                                AND NOT e.is_notional
    GROUP  BY ge.id, ge.polling_on
    ORDER  BY ge.polling_on DESC
  `, opts);
}

// Locate the most-recent dump file we have on disk.
export function dumpInfo() {
  if (!existsSync(dumpCache)) return { dir: dumpCache, dumps: [], latest: null };
  const all = readdirSync(dumpCache)
    // Only the canonical YYYY-MM-DD.sql dump files; ignore the
    // *.filtered.sql derivatives written by psephology-up.sh.
    .filter(f => /^\d{4}-\d{2}-\d{2}\.sql$/.test(f))
    .map(f => ({
      file: f,
      path: resolve(dumpCache, f),
      bytes: statSync(resolve(dumpCache, f)).size,
      mtime: statSync(resolve(dumpCache, f)).mtime.toISOString(),
    }))
    .sort((a, b) => a.file < b.file ? 1 : -1);
  return { dir: dumpCache, dumps: all, latest: all[0] || null };
}

// Sanity: refuse anything that looks like SQL injection in
// identifiers. Identifiers in this codebase only come from
// user-supplied table names; the rest is parameterised.
function sanitiseIdent(s) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(s)) throw new Error(`Invalid identifier: ${s}`);
  return s;
}
