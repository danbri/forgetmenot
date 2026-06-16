import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSearchQuery } from '../../lib/facilities/skosdex.mjs';

test('bare term is auto-scoped to the English label fields by default', () => {
  assert.equal(
    buildSearchQuery('ocean'),
    'prefLabel_en:(ocean) OR altLabel_en:(ocean)',
  );
});

test('multi-word bare term is scoped as a whole per field', () => {
  assert.equal(
    buildSearchQuery('social housing'),
    'prefLabel_en:(social housing) OR altLabel_en:(social housing)',
  );
});

test('--lang any searches the language-mixed label fields', () => {
  assert.equal(
    buildSearchQuery('ocean', { lang: 'any' }),
    'prefLabel:(ocean) OR altLabel:(ocean)',
  );
});

test('--lang fr scopes to the French label fields', () => {
  assert.equal(
    buildSearchQuery('océan', { lang: 'fr' }),
    'prefLabel_fr:(océan) OR altLabel_fr:(océan)',
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
