// Browser entry. Re-exports the same lib/ modules so a page can do:
//
//   <script type="module">
//   import * as parl from './parl.js';
//   const r = await parl.members.search({ name: 'Smith', house: 'Commons' });
//   console.log(r);
//   </script>
//
// Note on CORS: not every Parliament endpoint sends
// Access-Control-Allow-Origin. Calls to those endpoints will fail
// from a browser unless you proxy them. See docs/getting_started.md
// for the proxy options.
export * from '../lib/facilities/index.mjs';
export * as http from '../lib/http.mjs';
