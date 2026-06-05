// Webpack config for the Turtle-capable schemarama bundle.
// Invoked by scripts/build-schemarama-bundle.sh from inside the submodule's
// core/ dir (so webpack, loaders and plugins resolve from its node_modules).
const path = require('path');
const CORE = path.resolve(__dirname, '../../third_party/schemarama/core');
const NodePolyfillPlugin = require(path.join(CORE, 'node_modules/node-polyfill-webpack-plugin'));

module.exports = {
  mode: 'production',
  entry: path.resolve(__dirname, 'entry.cjs'),
  resolve: { modules: [path.join(CORE, 'node_modules')], fallback: { fs: false } },
  plugins: [new NodePolyfillPlugin()],
  output: {
    filename: 'schemarama.bundle.min.js',
    path: path.resolve(__dirname, '../../browser/third_party'),
    library: 'schemarama',
  },
};
