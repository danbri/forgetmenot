// Unit tests for lib/waf-detect.mjs.
// Cover the documented detection signatures.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectWaf } from '../../lib/waf-detect.mjs';

test('detectWaf identifies Cloudflare from cf-ray header', () => {
  const r = detectWaf(403, { 'cf-ray': '8a1b2c3d-LHR', server: 'cloudflare' }, '');
  assert.equal(r.provider, 'cloudflare');
  assert.match(r.evidence, /cf-ray=8a1b2c3d-LHR/);
});

test('detectWaf identifies Cloudflare from body when headers are missing', () => {
  const body = '<html><title>Just a moment...</title><body>...</body></html>';
  const r = detectWaf(403, {}, body);
  assert.equal(r.provider, 'cloudflare');
  assert.match(r.evidence, /body match/);
});

test('detectWaf identifies AWS WAF', () => {
  const r = detectWaf(403, { 'x-amzn-requestid': 'abc-123' }, '');
  assert.equal(r.provider, 'aws-waf');
});

test('detectWaf identifies Akamai', () => {
  const r = detectWaf(403, { 'x-akamai-staging': 'EXP', server: 'AkamaiGHost' }, '');
  assert.equal(r.provider, 'akamai');
});

test('detectWaf falls back to "generic" for non-fingerprinted block pages', () => {
  const r = detectWaf(403, {}, '<html><body>Forbidden — access denied</body></html>');
  assert.equal(r.provider, 'generic');
});

test('detectWaf returns null provider on a clean 200', () => {
  const r = detectWaf(200, { 'content-type': 'text/html' }, '<html>fine</html>');
  assert.equal(r.provider, null);
});

test('detectWaf is null for status-only blocks (no headers/body)', () => {
  // No way to fingerprint without ANY signal; we report null and
  // keep the status for the registry to triage manually.
  const r = detectWaf(403, {}, '');
  assert.equal(r.provider, null);
  assert.equal(r.status, 403);
});
