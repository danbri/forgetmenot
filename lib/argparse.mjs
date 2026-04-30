// Tiny stdlib-only argv parser. No alternatives needed for the
// patterns this CLI uses.
//
// Returns { _: [positional...], opts: {...} }.
//
//   --foo bar      → opts.foo = 'bar'
//   --foo=bar      → opts.foo = 'bar'
//   --no-foo       → opts.foo = false
//   --foo          → opts.foo = true   (when next arg is missing or another flag)
//   -h             → opts.h = true
//   pos1 pos2      → _: ['pos1', 'pos2']
//   --             → everything after is positional verbatim
//
// Option values that look like negative numbers (`--top -5`) ARE
// captured as values rather than as flags, but not when they look
// like another --flag. This is a pragmatic compromise; it covers the
// common cases used by these APIs.

export function parseArgs(argv) {
  const out = { _: [], opts: {} };
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];

    if (a === '--') {
      // Everything after `--` is positional.
      for (i++; i < argv.length; i++) out._.push(argv[i]);
      break;
    }

    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      let key, val;
      if (eq >= 0) {
        key = a.slice(2, eq);
        val = a.slice(eq + 1);
      } else {
        key = a.slice(2);
        // --no-foo → opts.foo = false
        if (key.startsWith('no-')) {
          out.opts[key.slice(3)] = false;
          i++;
          continue;
        }
        const next = argv[i + 1];
        if (next === undefined || (next.startsWith('--') && next.length > 2)) {
          val = true;
        } else {
          val = next;
          i++;
        }
      }
      // Repeated flags accumulate into an array.
      if (key in out.opts) {
        const cur = out.opts[key];
        out.opts[key] = Array.isArray(cur) ? [...cur, val] : [cur, val];
      } else {
        out.opts[key] = val;
      }
      i++;
      continue;
    }

    if (a.startsWith('-') && a.length > 1) {
      // Single-letter flag (or cluster). For our CLI we only need single
      // shorts (`-h`, `-v`); set each to true.
      for (const ch of a.slice(1)) out.opts[ch] = true;
      i++;
      continue;
    }

    out._.push(a);
    i++;
  }
  return out;
}

// Small camel-case helper: convert kebab-case keys to camelCase so
// `--member-id 4514` can map to a `memberId` property without the
// caller having to write both forms.
export function kebabToCamel(s) {
  return s.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
}

export function camelizeOpts(opts) {
  const out = {};
  for (const [k, v] of Object.entries(opts)) {
    out[kebabToCamel(k)] = v;
  }
  return out;
}

// Convenience: pull recognised keys, leave the rest in `extra`.
export function pick(opts, keys) {
  const known = {};
  const extra = {};
  for (const [k, v] of Object.entries(opts)) {
    if (keys.includes(k)) known[k] = v;
    else extra[k] = v;
  }
  return [known, extra];
}
