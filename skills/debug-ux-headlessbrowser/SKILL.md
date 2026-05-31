---
name: debug-ux-headlessbrowser
description: Drive a deployed (or local) web app from this rootful Ubuntu container via the chrome-devtools MCP — to verify interactive UX (modal a11y, focus management, keyboard shortcuts, streamed renders, shadow-DOM state) that source-grep + unit tests can't see. Use whenever someone asks "does Escape actually close the modal", "does focus restore", "is the tile grid streaming smoothly", or "does the live deploy actually have my fix" and you need to drive a real Chromium rather than reason about it. Covers the install + shim recipe needed to make Chrome work as root in this container, the worked verification pattern (snapshot → click → evaluate → assert), and a real-bug case study (shadow-DOM focus restoration) that proves source-grep is not enough.
---

# debug-ux-headlessbrowser — verify interactive UX in a real browser

## When this matters

Source-grep ("the code mentions `setupModalA11y`, calls `addEventListener('keydown')`, has `disconnectedCallback`") proves the *wiring* is there. It does not prove the *behaviour* is right. The flagship case from this repo: the daisychain modal a11y helper grepped clean, deployed clean, and Escape *did* close the sheet — but focus restored to `<body>` instead of the trigger button, because `document.activeElement` returns the outermost custom-element host in nested shadow DOM, not the actual focused leaf. Only a real browser could catch this; jsdom and headless DOM harnesses don't reproduce it.

Reach for this skill when the question is interactive: modal keyboard contract, focus management, streamed render under scroll, shadow-DOM state, hover/active styles, `IntersectionObserver`, `requestAnimationFrame` batching, `MutationObserver`-driven cleanup, custom-element lifecycle (`connectedCallback` / `disconnectedCallback`).

## Capability check: does the chrome-devtools MCP work here yet?

```sh
# In your chat: call mcp__chrome-devtools__new_page with any URL.
# Three possible failure modes, in order of likelihood:
```

| Symptom | Cause | Fix |
|---|---|---|
| `Could not find Google Chrome executable for channel 'stable' at /opt/google/chrome/chrome` | Chrome isn't installed | install (below) |
| `Protocol error (Target.setDiscoverTargets): Target closed` | Chrome launches but the zygote refuses to run as root without `--no-sandbox` | install the shim (below) |
| `Missing X server to start the headful browser. Either set headless to true or use xvfb-run` | Shim forwards to `chrome-real` but doesn't force headless | shim must include `--headless=new` |
| `net::ERR_CERT_AUTHORITY_INVALID` | Headless Chrome without `--test-type` refuses the system CA bundle | add `--ignore-certificate-errors --test-type` |

## Install recipe (clean container)

```sh
# 1. Install Chrome from Google's .deb (apt deals with dependencies).
cd /tmp
wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
apt-get install -y /tmp/google-chrome-stable_current_amd64.deb
/opt/google/chrome/chrome --version       # sanity check

# 2. Install the shim. The MCP launches `/opt/google/chrome/chrome` with
#    no extra args. Wrap that binary so every invocation gets the flags it
#    needs to survive a rootful, X-less, headless container.
cd /opt/google/chrome
mv chrome chrome-real
cat > chrome <<'EOF'
#!/bin/sh
# Shim: force headless + sandbox-disabled. The MCP launches Chrome without
# --no-sandbox (fails as root) and tries headful (fails without X server).
# Force both flags here so MCP-launched Chrome works in this container.
exec /opt/google/chrome/chrome-real \
     --headless=new \
     --no-sandbox \
     --disable-dev-shm-usage \
     --disable-gpu \
     --ignore-certificate-errors \
     --test-type \
     "$@"
EOF
chmod +x chrome

# 3. Kill any stale Chrome that the MCP may have spawned during failed
#    earlier attempts. Without this, MCP keeps reusing a broken instance.
pkill -9 -f '/opt/google/chrome/chrome' 2>/dev/null
```

After the third step, call `mcp__chrome-devtools__new_page` from chat — it should return `## Pages` with the URL.

### Why these specific flags

- **`--headless=new`** — Chrome 109+ headless mode. The MCP defaults to headful (it wants to render). Without X11, headful crashes immediately. Forcing headless in the shim is cheaper than installing Xvfb (which also works — see below — but adds a process, a lock file, and a small startup window where the MCP can time out).
- **`--no-sandbox`** — the zygote refuses to run as root without it. Setting `PUPPETEER_DANGEROUS_NO_SANDBOX=true` would also work, *but* you can't change env vars on an MCP server that's already running. The shim is the only reliable injection point.
- **`--disable-dev-shm-usage`** — defensive; some container shm mounts are small (~64 MB).
- **`--disable-gpu`** — no GPU in this container.
- **`--ignore-certificate-errors --test-type`** — headless Chrome without `--test-type` actually rejects valid CA-signed certs (`ERR_CERT_AUTHORITY_INVALID`) for hosts it can't validate via its own bundle. `--test-type` flips it into a more permissive mode where `--ignore-certificate-errors` actually works.

### Alternative: Xvfb + headful

If you genuinely need headful Chrome (e.g. you're testing CSS that headless doesn't render the same way — fonts, GPU compositing), substitute the shim's `exec` line with:

```sh
exec xvfb-run --auto-servernum --server-args="-screen 0 1280x900x24" \
     /opt/google/chrome/chrome-real \
     --no-sandbox --disable-dev-shm-usage \
     --ignore-certificate-errors --test-type \
     "$@"
```

Caveats: Xvfb leaves `/tmp/.X*-lock` files; if Chrome crashes between calls you may need to `rm -f /tmp/.X*-lock /tmp/.X11-unix/X*` before the next `new_page`. Headless is simpler.

## Verification pattern: snapshot → act → evaluate → assert

The MCP tools fall into three buckets:

| Bucket | Tools | Use for |
|---|---|---|
| Discovery | `take_snapshot`, `list_pages`, `select_page` | Find the `uid` of the element you want to click |
| Interaction | `click`, `press_key`, `type_text`, `navigate_page`, `resize_page` | Drive the UI |
| Assertion | `evaluate_script`, `list_console_messages`, `take_screenshot` | Read state out |

A typical interaction loop:

```
take_snapshot                         → find uid=2_12 (the ⓘ button)
evaluate_script (save prevFocus)      → confirm focus is on the trigger
click uid=2_12                        → opens the modal
evaluate_script (read modal state)    → role=dialog? aria-modal=true? initial focus on close?
press_key Escape                      → keyboard contract
evaluate_script (read focus)          → focus restored to the trigger?
```

`take_snapshot` returns an accessibility-tree text dump with `uid` handles. Prefer it over screenshots — it's smaller, deterministic, and the `uid`s are stable across calls within the same snapshot. Re-snapshot after any state change that could re-render.

### Shadow-DOM interrogation

`document.activeElement` in nested shadow DOM returns the outermost custom-element host. To find the actually-focused leaf, walk down:

```js
function deepActiveElement() {
  let n = document.activeElement;
  while (n && n.shadowRoot && n.shadowRoot.activeElement) {
    n = n.shadowRoot.activeElement;
  }
  return n;
}
```

This is the test you'd run to *catch* a modal-focus bug, and also the production code you'd write to *fix* it. See the daisychain case study below for the full story.

### Probing custom-element internals

`evaluate_script` runs in the page's context with full DOM access including shadow roots:

```js
() => {
  const app   = document.querySelector('daisy-app');
  const bead  = app.shadowRoot.querySelector('daisy-bead');
  const sheet = document.querySelector('daisy-info-sheet');   // overlay
  return {
    sheet_open: !!sheet,
    sheet_role: sheet?.getAttribute('role'),
    sheet_focus: sheet?.shadowRoot.activeElement?.className,
    bead_inner_focus: bead?.shadowRoot.activeElement?.className,
  };
}
```

Use `JSON.stringify`-safe return values — the result is serialised. If you need to return a `Map` or a DOM node, project it into a plain object first.

## Worked example: catching a shadow-DOM focus-restoration bug

This is the real story from the daisychain UX-review verification pass. The fix had been:

1. shipped (commit `df8be8bc`),
2. source-grepped clean (`setupModalA11y` referenced 3×, `disconnectedCallback` defined 4×, the `role=dialog` + Escape contract textually present),
3. verified at the deploy level (curl + grep against `fpkg.fly.dev`).

All three checks passed. The bug only showed up in a real browser:

```js
// Open the info sheet, then check focus AFTER Escape closed it:
evaluate_script(() => {
  const trail = [];
  let n = document.activeElement;
  while (n) {
    trail.push(n.tagName + '.' + n.className);
    if (!n.shadowRoot?.activeElement) break;
    n = n.shadowRoot.activeElement;
  }
  return trail;
})
// → ["BODY"]
// Expected: ["DAISY-APP", "DAISY-BEAD", "BUTTON.info"]
```

Diagnosis: `setupModalA11y(host)` captured `prevFocus = document.activeElement` at modal-open time. In nested shadow DOM, this returned `<daisy-app>` (the outermost custom-element host), not the actual focused leaf. Refocusing a host that's not itself focusable (no `tabindex`, no `delegatesFocus`) is a no-op — focus falls to body.

Fix: walk down `shadowRoot.activeElement` to find the leaf before storing it. Three lines, one helper:

```js
function _deepActiveElement() {
  let n = document.activeElement;
  while (n && n.shadowRoot && n.shadowRoot.activeElement) n = n.shadowRoot.activeElement;
  return n;
}
// then: const prevFocus = _deepActiveElement();
```

Committed as `a8d1e0fb`. Same MCP loop re-confirmed focus restoration after redeploy.

**The lesson**: any test that grepped "is `prevFocus.focus()` called?" would pass. Only a real browser observed that the focus *target* was wrong.

## Operating rules

1. **Take a snapshot first.** Every interactive call (`click`, `type_text`) needs a `uid` from a recent snapshot. Re-snapshot after any state change that mutates the DOM.
2. **Always probe via `evaluate_script` after acting.** A click "succeeded" tells you the click event dispatched, not that the resulting state is correct. Read the post-state out and assert on it.
3. **Walk shadow roots explicitly.** `document.querySelector` doesn't cross shadow boundaries; you must hop via `host.shadowRoot.querySelector(...)`. If the app is web-components-heavy, expect 2–4 hops to reach an interactive control.
4. **Don't trust `document.activeElement` in shadow-DOM apps** — use `_deepActiveElement()`.
5. **Kill stale Chrome before changing the shim.** The MCP keeps a Chrome instance alive between calls; flag changes don't take effect until the next fresh launch.
6. **Verify the deploy is what you think it is** before reasoning about behaviour. Two quick checks:
   - `evaluate_script` for a string that's only in the new code (e.g. `'setupModalA11y'`, `'TILE_BATCH'`) — confirms the served HTML has your changes.
   - `list_console_messages` after navigation — surfaces load-time errors that snapshot can't.
7. **Keep test results inline.** `evaluate_script` returns JSON; project state into a plain object (`{ role, ariaModal, focusClass }`) rather than returning DOM nodes. Easier to assert on, smaller to round-trip.

## Caveats

- The `--ignore-certificate-errors --test-type` flag pair makes Chrome trust any TLS cert. Fine for verification against your own deploys; do not use this shim configuration for any actual browsing.
- Headless Chrome and headful Chrome can render differently for things tied to GPU compositing (subpixel rendering, `backdrop-filter`, some `will-change` transforms). If your verification target is a visual rendering bug, switch to the Xvfb + headful shim variant above.
- The MCP's `take_screenshot` returns the viewport; full-page rendering needs `fullPage: true`. Snapshots are usually more useful for verification than screenshots — and don't bloat the conversation.
- Snapshots get a fresh `uid` prefix each call (`1_`, `2_`, `3_`…). A `uid` from snapshot `2_*` is invalid after you take snapshot `3_*`. Re-snapshot before each `click` if state changed.

## When NOT to use this skill

- Reading the served HTML / inspecting source. `curl | grep` is faster.
- Confirming a deploy is live. `curl | grep` for a known new string in the served HTML.
- Unit-testing pure JS logic (helpers, parsers, query builders). Use Node directly.
- Anything Node-only (proxy logic, server.mjs behaviour). Drive it with `curl` against the server.

This skill earns its keep when the question is *interactive in a real browser*, and only then.
