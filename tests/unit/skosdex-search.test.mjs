import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSearchQuery } from '../../lib/facilities/skosdex.mjs';

test('bare term is auto-scoped to the label fields', () => {
  assert.equal(
    buildSearchQuery('ocean'),
    'prefLabel:(ocean) OR altLabel:(ocean)',
  );
});

test('multi-word bare term is scoped as a whole per field', () => {
  assert.equal(
    buildSearchQuery('social housing'),
    'prefLabel:(social housing) OR altLabel:(social housing)',
  );
});

test('field-scoped query passes through verbatim', () => {
  assert.equal(buildSearchQuery('prefLabel:climate'), 'prefLabel:climate');
});

test('boolean / wildcard queries pass through verbatim', () => {
  assert.equal(buildSearchQuery('climate AND policy'), 'climate AND policy');
  assert.equal(buildSearchQuery('clima*'), 'clima*');
  assert.equal(buildSearchQuery('"carbon capture"'), '"carbon capture"');
});

test('--raw-q disables auto-scoping', () => {
  assert.equal(buildSearchQuery('ocean', { rawQ: true }), 'ocean');
});

test('--field selects the label fields', () => {
  assert.equal(buildSearchQuery('ocean', { field: 'exactLabel' }), 'exactLabel:(ocean)');
  assert.equal(
    buildSearchQuery('ocean', { field: 'prefLabel, altLabel ,definition' }),
    'prefLabel:(ocean) OR altLabel:(ocean) OR definition:(ocean)',
  );
});

test('empty query becomes match-all', () => {
  assert.equal(buildSearchQuery(''), '*:*');
  assert.equal(buildSearchQuery(undefined), '*:*');
});
