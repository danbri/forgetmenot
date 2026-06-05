// Build entry for our Turtle-capable schemarama bundle.
// See scripts/build-schemarama-bundle.sh.
//
// Re-exports the upstream schemarama API and additionally exposes parseTurtle —
// present in upstream parser.js but NOT exported by core/index.js — so the
// public SHACL checker can validate Turtle (the format SPARQL CONSTRUCT and most
// RDF APIs emit by default; the upstream parseNQuads export rejects @prefix).
// Literal relative requires (NOT path.join) so webpack statically bundles them.
// Paths are relative to this file: scripts/schemarama-bundle/.
module.exports = Object.assign({}, require('../../third_party/schemarama/core/index.js'), {
  parseTurtle: require('../../third_party/schemarama/core/parser.js').parseTurtle,
});
