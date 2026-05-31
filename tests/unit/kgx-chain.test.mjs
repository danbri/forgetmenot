// Live end-to-end test for the kgx chain runner.
//
// Runs `kgx chain replay` against the parallax-hk fixture, which hits QLever
// (https://qlever.dev/api/wikidata) three times to walk: HK skyscrapers →
// architects (P84) → other works (^P84). The recording carries a content
// hash per bead; replay re-runs each step and asserts the hash matches.
//
// Policy: "Live fetch + content hash" (user direction).
//   - HASH MISMATCH → real test failure. Either Wikidata drifted (re-record
//     deliberately) or the chain runner broke. Investigate.
//   - NETWORK ERROR → t.skip, not failure. QLever is occasionally unreachable
//     and we don't want CI to flake on infrastructure outside the repo's
//     control. Visible in the test output so the loss of coverage is loud.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const KGX        = path.join(__dirname, '..', '..', 'bin', 'kgx.mjs');
const RECORDING  = path.join(__dirname, '..', 'fixtures', 'kgx', 'parallax-hk.kgx.recorded.json');

// Treat as a network problem if any of these appear in the output. Otherwise
// the test really did fail (hash mismatch / nonzero exit on a clean run).
const NETWORK_HINTS = /HTTP 5\d\d|HTTP 000|ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|getaddrinfo|fetch failed|network/i;

test('chain replay: parallax-hk reproduces the recorded hashes', async (t) => {
  let stdout = '', code = 0;
  try {
    stdout = execFileSync('node', [KGX, 'chain', 'replay', '-f', RECORDING], {
      encoding: 'utf8',
      timeout: 60_000,
    });
  } catch (e) {
    stdout = e.stdout?.toString() || '';
    const stderr = e.stderr?.toString() || '';
    code = e.status ?? 1;
    if (NETWORK_HINTS.test(stdout + stderr)) {
      t.skip(`QLever unreachable — skipping live test (${stderr.split('\n')[0] || 'network error'})`);
      return;
    }
    // fall through with code !== 0 and stdout populated; assertions below
    // will surface the actual report
  }

  const report = JSON.parse(stdout);
  assert.equal(report.ok, true, `chain replay reported ok=false:\n${stdout}`);
  assert.equal(code, 0,        `chain replay exited ${code}:\n${stdout}`);

  // The three beads are pinned — name + hash.
  const want = ['hk-skyscrapers', 'architects', 'works_by'];
  assert.deepEqual(report.beads.map((b) => b.id), want);
  for (const b of report.beads) {
    assert.equal(b.ok, true, `bead ${b.id} hash mismatch: got ${b.now.hash}, want ${b.want.hash}`);
  }
});
