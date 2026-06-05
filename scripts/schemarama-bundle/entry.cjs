// Build entry for our Turtle-capable schemarama bundle.
// See scripts/build-schemarama-bundle.sh.
//
// Re-exports the upstream schemarama API and additionally exposes:
//  - parseTurtle: present in upstream parser.js but NOT exported by
//    core/index.js — needed so the SHACL checker can validate Turtle (what
//    SPARQL CONSTRUCT/DESCRIBE emits; the upstream parseNQuads rejects @prefix).
//  - SHACLValidator: the raw rdf-validate-shacl validator. schemarama's wrapper
//    drops sh:focusNode and sh:value from each result, so our glue runs the raw
//    validator instead and keeps them — letting the UI name the offending
//    entity/value, not just the constraint. (rdf-validate-shacl resolves from
//    the submodule's node_modules via webpack resolve.modules.)
// Literal relative requires (NOT path.join) so webpack statically bundles them.
module.exports = Object.assign({}, require('../../third_party/schemarama/core/index.js'), {
  parseTurtle: require('../../third_party/schemarama/core/parser.js').parseTurtle,
  SHACLValidator: require('rdf-validate-shacl'),
});
