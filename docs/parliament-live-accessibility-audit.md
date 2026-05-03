# Accessibility audit: `demos/parliament-live`

- Subject: `demos/parliament-live/web/index.html` (single-page web app, hash-router)
- Standard: WCAG 2.2 Level A and AA
- Methodology: 8-phase JAWS testing flow from `skills/jaws-accessibility/references/jaws-audit-methodology.md`, adapted to a static-source review (no live JAWS / NVDA available in this environment).
- Auditor: structural review against `skills/jaws-accessibility/SKILL.md`. **Manual verification with JAWS + Chrome and NVDA + Firefox is still required** before claiming compliance.
- Date: 2026-05-03
- Source revision: `main` at the time of write-up

## Headline

The demo is **above-baseline accessibility-aware** for a prototype:
explicit contrast targets in CSS, `:focus-visible` styles, a real
skip link, `prefers-reduced-motion` honoured, dialog with
`aria-modal`, icon-only buttons consistently labelled, single
correctly-shaped polite live region, party-badge contrast
algorithmically verified, semantic `<header>` / `<nav>` / `<main>`
/ `<footer>` landmarks, sensible touch targets (44×44 for icons).

But it has **three Critical-severity SPA accessibility gaps** that
will fail real JAWS / NVDA testing on day one:

1. **No SPA title or focus management on route change.** Hash
   navigation never updates `document.title` and never moves focus
   to the new view's `<h1>`.
2. **`aria-hidden="true"` on a drawer that still contains
   focusable links and a button.** Classic "ghost elements" anti-
   pattern flagged in the skill's *Most frequent critical errors*.
3. **Login dialog does not trap focus.** Tab can escape the modal
   into the (visually-hidden) main app behind it.

Plus six lower-severity findings detailed below.

---

## Strengths (worth keeping)

| WCAG SC | Practice in the demo | Where |
|---|---|---|
| 1.4.3 Contrast (Minimum), 1.4.11 Non-text Contrast | Documented contrast targets in CSS comments; party badges run an actual `contrastRatio()` check at runtime and override the API's foreground when it falls below 4.5:1 | `:root` block; `partyColours()` ~700–740 |
| 1.4.13 Content on Hover or Focus, 2.4.7 Focus Visible, 2.4.11 Focus Not Obscured (Minimum, **new in 2.2**) | `:focus-visible` with 3 px gold outline + 2 px offset, never suppressed for keyboard | `:focus-visible` block ~46 |
| 2.3.3 Animation from Interactions | `prefers-reduced-motion` honoured globally; chamber bell animation explicitly silenced | `@media (prefers-reduced-motion)` ~73 |
| 2.4.1 Bypass Blocks | Real skip link (`a.skip-link → #root`) that becomes visible on focus | line 447 |
| 2.5.5 / 2.5.8 Target Size (**Minimum new in 2.2**) | Topbar icon controls explicitly 44×44 px | `.topbar button.icon, .topbar a.icon` ~96 |
| 4.1.3 Status Messages | One `<div id="sr-status" role="status" aria-live="polite">`, **empty in initial HTML**, content set with a `clear→set` delay so JAWS / NVDA re-announce repeats | `#sr-status` line 467; `announceSr()` ~994 |
| 1.3.1 Info and Relationships | Semantic landmarks (`<header role="banner">`, `<nav>`, `<main>`, `<footer>`); login uses `role="dialog" aria-modal="true"` with `aria-labelledby` and `aria-describedby` | lines 449, 471, 526, 528, 535 |
| 1.1.1 Non-text Content | All decorative SVG icons carry `aria-hidden="true" focusable="false"`; informative icon-only buttons have `aria-label` ("Open main menu", "Search members") | search topbar buttons ~450 |
| 3.3.7 Redundant Entry, 3.3.8 Accessible Authentication (**both new in 2.2**) | Password input has correct `autocomplete="current-password"`, `autocapitalize="off"`, `autocorrect="off"`; the local-storage token persistence avoids re-asking | login overlay ~535 |
| 1.4.10 Reflow, 1.4.4 Resize Text | `100dvh`, `max-width: 720px` body, fluid CSS, no horizontal overflow via `overflow-x:hidden` + `word-break:break-word` | `body` block |

---

## Findings

### Severity model

| Severity | Definition |
|---|---|
| Critical | Blocks access to core functionality; no workaround |
| Major | Significant barrier but a workaround exists |
| Moderate | Partial failure or degraded experience |
| Minor | Inconvenience; does not block functionality |

### Finding 1 — Critical · No SPA title or focus management on route change

- **WCAG SC**: 2.4.2 Page Titled (Level A); 2.4.3 Focus Order (Level A)
- **Page/Component**: every hash-routed view (`/`, `/search`, `/member/:id`, `/debate/:id`, `/division/:id`, etc.)
- **Element**: `dispatch()` and `window.addEventListener('hashchange', dispatch)` (`index.html` line 860)
- **Screen reader**: JAWS + Chrome and NVDA + Firefox both
- **Reproduction**:
  1. Load the demo home page. JAWS announces "FPKG · Forgetmeknot Palace".
  2. Open the drawer, choose **Members**. The route changes to `#/search`.
  3. JAWS does not re-announce the page; the document title stays "FPKG · Forgetmeknot Palace".
  4. Focus stays on the link the user just clicked, which is now under the closed drawer. Pressing Tab continues from wherever focus happened to be — usually below the new content.
- **Root cause**: `dispatch()` only calls `window.scrollTo` and renders into `#root`. It never sets `document.title` and never sets focus.
- **Fix** (concrete):
  ```js
  // routes table already carries `title:`. Use it, and bring focus to <h1>.
  await r.view(m, parseQuery(path), myGen);
  if (myGen !== routeGen) return;
  document.title = `${r.title} · FPKG`;
  const h1 = document.querySelector('main h1');
  if (h1) {
    if (!h1.hasAttribute('tabindex')) h1.setAttribute('tabindex', '-1');
    h1.focus({ preventScroll: true });
  }
  // Belt-and-braces announcement for AT users on routes that don't
  // produce an <h1> (e.g. error views).
  announceSr(`${r.title} loaded`);
  ```

### Finding 2 — Critical · "Ghost elements" in closed drawer

- **WCAG SC**: 4.1.2 Name, Role, Value (Level A); 1.3.1 Info and Relationships (Level A)
- **Page/Component**: `nav.drawer#drawer`
- **Element**: `<nav class="drawer" aria-hidden="true">` containing `<a class="item">` and `<button id="drawer-signout">` (lines 471, 522)
- **Screen reader**: JAWS — silently focusable but unannounced ghost links
- **Reproduction**:
  1. Load the demo. The drawer is closed (off-screen via `transform: translateX(-100%)`) and `aria-hidden="true"`.
  2. Tab past the topbar buttons. Focus is captured by the off-screen drawer items because they retain default `tabindex=0`.
  3. JAWS announces nothing for the drawer items because they are inside an `aria-hidden` subtree, but the keyboard focus ring is invisible (off-screen). Sighted keyboard users see focus disappear.
- **Root cause**: `aria-hidden="true"` on a container with focusable descendants — the canonical "Most frequent critical errors" entry in `SKILL.md`.
- **Fix** (modern, single-attribute):
  ```js
  function openDrawer() {
    drawerEl.classList.add('open'); scrimEl.classList.add('open');
    drawerEl.removeAttribute('inert');               // make focusable
    menuBtn.setAttribute('aria-expanded', 'true');
    drawerEl.querySelector('a.item, button')?.focus();
  }
  function closeDrawer() {
    drawerEl.classList.remove('open'); scrimEl.classList.remove('open');
    drawerEl.setAttribute('inert', '');              // not focusable, not in AT tree
    menuBtn.setAttribute('aria-expanded', 'false');
    menuBtn.focus();
  }
  ```
  Drop both `aria-hidden` toggles. The `inert` attribute (HTML, supported in all current browsers) does both jobs — removes from the AT tree AND from the focus order. Add `inert` initial attribute to the `<nav class="drawer">` markup.
- **Test**: Tab from the page top, ensure focus never enters the drawer until it is opened.

### Finding 3 — Critical · Login dialog does not trap focus

- **WCAG SC**: 2.4.3 Focus Order (Level A); ARIA Authoring Practices for `dialog`
- **Page/Component**: `#login` overlay
- **Element**: `<div class="login-overlay" id="login" role="dialog" aria-modal="true">` (line 535)
- **Screen reader**: both
- **Reproduction**:
  1. Load the demo with no auth. The login dialog opens and focus is set to the password input.
  2. Press Tab. Focus moves to the Unlock button.
  3. Press Tab again. Focus leaves the dialog and lands somewhere in the (now hidden) main app — possibly the skip link, possibly the menu button, depending on rendering order. JAWS may begin reading content the user shouldn't be able to interact with.
- **Root cause**: `aria-modal="true"` is a hint to AT, not an enforcement of focus. Browsers do not implement focus trapping for `<div role="dialog">`. The native `<dialog>.showModal()` does — and that's what we should use.
- **Fix (preferred — native)**:
  ```html
  <dialog id="login" aria-labelledby="login-title" aria-describedby="login-desc">
    …existing content…
  </dialog>
  ```
  ```js
  // Replace ad-hoc visibility with native modal:
  document.getElementById('login').showModal();
  // ESC handling, focus trap, and inert background are then free.
  ```
- **Fix (fallback — JS focus trap)** if you must keep the `<div>`:
  ```js
  const FOCUSABLE = 'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])';
  loginEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const f = [...loginEl.querySelectorAll(FOCUSABLE)];
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  ```

### Finding 4 — Major · Home view has no `<h1>`

- **WCAG SC**: 1.3.1 Info and Relationships (Level A); 2.4.6 Headings and Labels (Level AA)
- **Page/Component**: `viewHome` (default route `/`)
- **Element**: chamber cards use `<header><span class="label">Commons</span></header>`; the page never includes an `<h1>`. Search view (`#/search`) goes from no `<h1>` straight to `<h2>` ("Members"), and constituency view (`#/constituency/:id`) similarly skips.
- **Screen reader**: both
- **Reproduction**:
  1. Load the home page.
  2. JAWS: Insert + F6 to list headings. Result is a list starting at H2 with no top-level heading.
  3. Same for `#/search` and `#/constituency/<id>` after a route change.
- **Root cause**: chambers were styled with a `<header>` rather than a heading element; `viewSearch` doesn't emit a top-level page heading at all.
- **Fix**:
  - Promote the chamber labels to `<h2>` and add a `<h1 class="visually-hidden">What's on now</h1>` at the top of `viewHome`.
  - Add `el('h1', {}, 'Members')` at the top of `viewSearch` (visible — replaces the "Members" `<h2>` inside the search-result card).
  - Add `el('h1', {}, name)` at the top of `viewConstituency`.

### Finding 5 — Major · `aria-describedby` references two IDs on the password input

- **WCAG SC**: 4.1.2 Name, Role, Value (Level A); JAWS announcement quality
- **Element**: `<input id="login-pass" aria-describedby="login-err login-desc">` (line 546)
- **Screen reader**: JAWS reads both descriptions on focus, even when the error region is empty (whitespace `&nbsp;`). Users hear "Password edit. A small graph navigator over UK Parliament data…" — the long description plays every time the field is focused.
- **Reproduction**:
  1. Open login. Tab to password.
  2. JAWS reads label + the entire `#login-desc` paragraph. Re-focusing repeats it.
- **Root cause**: `aria-describedby` is verbose; combining it with a long help paragraph and an alert region in the same id list makes JAWS read everything.
- **Fix**: Reference only the error region from the input (`aria-describedby="login-err"`), and rely on the dialog's own `aria-describedby="login-desc"` for the long description, which is announced once on dialog focus.

### Finding 6 — Moderate · `role="alert"` AND `aria-live="assertive"` on the same element

- **WCAG SC**: 4.1.3 Status Messages (Level AA); SKILL "Most frequent critical errors" entry
- **Element**: `<div class="err" id="login-err" role="alert" aria-live="assertive">&nbsp;</div>` (line 548)
- **Screen reader**: JAWS and NVDA both have been observed double-announcing under this combination.
- **Fix**: Use one or the other. `role="alert"` already implies `aria-live="assertive"` and `aria-atomic="true"`. Drop the `aria-live` attribute:
  ```html
  <div class="err" id="login-err" role="alert">&nbsp;</div>
  ```

### Finding 7 — Moderate · Live region uses non-empty initial content (`&nbsp;`)

- **WCAG SC**: 4.1.3 Status Messages (Level AA)
- **Element**: same `#login-err` element above. The `&nbsp;` is intentional (preserves layout height) but JAWS may treat the live region as already-populated and ignore the first real update.
- **Fix**: Use CSS to reserve the height (`min-height: 1.4em`) and leave the element empty (`<div role="alert" id="login-err"></div>`). The empty-on-load rule is the SKILL's explicit guidance.

### Finding 8 — Moderate · Drawer closes on link click, but Sign-out also calls `boot()` which can re-open the login dialog without focus management

- **WCAG SC**: 2.4.3 Focus Order (Level A); 4.1.3 Status Messages (Level AA)
- **Element**: `#drawer-signout` click handler (~785)
- **Reproduction**: Click Sign out. The drawer closes, focus returns to the menu button (good), then `boot()` opens the login dialog and resets focus to the password field. Result: focus moves twice, JAWS may announce the menu button briefly before the dialog steals focus.
- **Fix**: Skip the `closeDrawer()`-triggered focus return when the next step is opening the login dialog.
- **Severity**: Moderate because the user is still able to authenticate; the issue is only the brief mis-announcement.

### Finding 9 — Minor · No `<html lang>` change for non-English content

- **WCAG SC**: 3.1.2 Language of Parts (Level AA)
- **Page/Component**: any view that surfaces content with embedded foreign-language member or constituency names (e.g. peers from Welsh / Scottish / Northern Irish constituencies, or names in Welsh).
- **Reproduction**: View a Welsh member's name with the JAWS English voice; pronunciation is incorrect.
- **Fix**: Where the API returns a language code with a name (rare), wrap with `lang="cy"` or similar. Otherwise note as a known limitation.

### Finding 10 — Minor · `meta name="theme-color"` only sets dark scheme

- **WCAG SC**: not strictly a WCAG criterion, but related to forced-colours behaviour and `prefers-color-scheme`.
- **Element**: `<meta name="theme-color" content="#0d0f12">`
- **Fix**: Provide a light-scheme fallback for users who flip the OS appearance and a `forced-colors` reset:
  ```html
  <meta name="theme-color" content="#0d0f12" media="(prefers-color-scheme: dark)">
  <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
  ```
  ```css
  @media (forced-colors: active) {
    :focus-visible { outline: 3px solid Highlight; }
    .skip-link { background: Canvas; color: CanvasText; }
  }
  ```

---

## Out-of-scope items the audit cannot determine from source

These need actual JAWS + Chrome and NVDA + Firefox sessions, ideally on a deployed `fly.io` build with real API responses:

1. **Live-region timing** — does `announceSr()`'s 30 ms re-set window actually trigger re-announcement on every JAWS / NVDA version? (The pattern is good; verification is empirical.)
2. **Dynamic table semantics** — the votes / divisions views build complex tables from API data; do they survive `Ctrl+Alt+Arrow` cell navigation?
3. **Reading order on the chamber card transitions** — when `bell-on` fires and the card changes content, is the experience comfortable for JAWS users?
4. **External-link behaviour** — links to `parliament.uk` and `parliamentlive.tv` open in the same tab without warning. WCAG does not require warnings, but consider `target="_blank" rel="noopener"` with a visually-hidden "(opens in new window)" suffix where appropriate.
5. **Login-pass `aria-describedby` ordering** — JAWS / NVDA may read either description first; verify and document the expected order.

---

## Suggested remediation order

1. **Critical batch first** — fix Findings 1, 2, 3 in a single PR. They are independent, small, and unblock the rest of the audit.
2. **Heading repairs** — Finding 4 in a small follow-up.
3. **Dialog tidy** — Findings 5 + 6 + 7 together; same component, same review surface.
4. **Polish** — Findings 8, 9, 10.
5. **Re-audit** with JAWS 2025 + Chrome and NVDA latest + Firefox; produce a finalised statement of conformance against WCAG 2.2 Level AA.

A statement of conformance should not be claimed before steps 1–3 are merged AND a real screen-reader pass has been completed.

---

## Methodology and citation

- Skill: <https://github.com/Ambitos-1995/jaws-accessibility-skill> (vendored at `skills/jaws-accessibility/`)
- WCAG 2.2 criteria reference: `skills/jaws-accessibility/references/wcag-22-criteria.md`
- 8-phase audit flow: `skills/jaws-accessibility/references/jaws-audit-methodology.md`
- JAWS / NVDA divergence notes: `skills/jaws-accessibility/references/jaws-nvda-compatibility.md`
- Source under review: `demos/parliament-live/web/index.html` at the repo's `main` HEAD on the audit date.
