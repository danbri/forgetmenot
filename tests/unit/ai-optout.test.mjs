// Unit tests for the AI opt-out signal helpers in sites.mjs.
// These cover the documented position from the comments next to
// parseAiTxt / parseNoAi: we always RECORD the publisher's stance,
// and only refuse to fetch when the operator passes strictAiOptOut.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAiTxt, parseNoAi } from '../../lib/facilities/sites.mjs';

test('parseAiTxt accepts the ai.txt format (User-Agent / Disallow)', () => {
  const txt = `
    # AI training opt-out for example.org
    User-Agent: *
    Disallow: /private
    Disallow: /members-only

    User-Agent: GPTBot
    Disallow: /
  `;
  const r = parseAiTxt(txt);
  assert.deepEqual(r.disallow, ['/private', '/members-only']);
  assert.match(r.raw, /AI training opt-out/);
});

test('parseNoAi reads <meta name="robots" content="noai"> and X-Robots-Tag', () => {
  const html = '<html><head><meta name="robots" content="noindex, noai"></head></html>';
  const r1 = parseNoAi(html);
  assert.equal(r1.flags.noai, true);
  assert.equal(r1.flags.noindex, true);
  assert.equal(r1.flags.nofollow, false);

  // X-Robots-Tag header parsed identically.
  const r2 = parseNoAi('<html></html>', 'noai, noimageai');
  assert.equal(r2.flags.noai, true);
  assert.equal(r2.flags.noimageai, true);

  // Combined.
  const r3 = parseNoAi('<meta name="robots" content="nofollow">', 'noai');
  assert.equal(r3.flags.nofollow, true);
  assert.equal(r3.flags.noai, true);
});

test('parseNoAi returns no flags on plain HTML', () => {
  const r = parseNoAi('<html><body>nothing here</body></html>');
  assert.equal(r.flags.noai, false);
  assert.equal(r.flags.noindex, false);
  assert.deepEqual(r.tags, []);
});
