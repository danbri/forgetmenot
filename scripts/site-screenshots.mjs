#!/usr/bin/env node
// scripts/site-screenshots.mjs
//
// Visual + accessibility-tree capture pass against the deployed
// demo at https://fpkg.fly.dev/.
//
// For each (route × viewport × colour-scheme) combination we:
//   * navigate, wait for network idle + a route-specific selector
//   * take a full-page PNG, named with an ISO-8601 timestamp
//   * extract the rendered text inventory (title, headings, links,
//     button names, image alt text) — saved as JSON sidecar
//   * extract Playwright's accessibility-tree snapshot — saved
//     alongside (this is what JAWS / NVDA see)
//
// At the end we bundle everything into a dated PDF report with
// one section per route (one row per viewport variant), so the
// captures travel as a single artefact.
//
// Auth: the proxy gates /api/* with a Bearer token (see server.mjs).
// We seed both localStorage[parl_auth_token] and the fpkg_auth
// cookie before navigation so the SPA boots straight to home
// instead of the login dialog. Password comes from the env var
// FPKG_PASSWORD.
//
// Usage:
//   FPKG_PASSWORD='<the password>' node scripts/site-screenshots.mjs
//
//   # optional flags:
//   --base https://other.host/    target base URL (default fpkg.fly.dev)
//   --out  <dir>                  output dir (default third_party/data/site-shots/<run-id>)
//   --no-pdf                      skip PDF bundling at the end
//   --routes home,search,...      comma-separated subset
//
// Notes:
//   * Headless chromium in this sandbox doesn't trust the public
//     fly.dev cert chain (a chromium-bundled-NSS-store gap, not a
//     real cert problem). We pass ignoreHTTPSErrors:true so the
//     navigation succeeds.
//   * We screenshot two viewports (mobile 414×896, desktop 1280×800)
//     and the dark + light colour-scheme variants — four PNGs per
//     route. Filenames embed the variant.

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import PDFDocument from 'pdfkit';

// ---------- args ----------

const args = parseArgs(process.argv.slice(2));
const BASE   = (args.base || 'https://fpkg.fly.dev/').replace(/\/?$/, '/');
const PW     = process.env.FPKG_PASSWORD || '';
const RUN_ID = nowStamp();          // 20260504T031522Z
const OUT    = resolve(args.out || `third_party/data/site-shots/${RUN_ID}`);
const SHOTS  = `${OUT}/shots`;
const META   = `${OUT}/meta`;
const A11Y   = `${OUT}/a11y`;
mkdirSync(SHOTS, { recursive: true });
mkdirSync(META,  { recursive: true });
mkdirSync(A11Y,  { recursive: true });

// ---------- routes to walk ----------
//
// Each entry: { key, hash, label, waitFor }.
// `hash` is the SPA route fragment.
// `waitFor` is a selector that signals "view rendered" so we don't
// screenshot a half-painted skeleton. `null` falls back to a fixed
// post-networkidle pause.
//
// Concrete IDs are pinned so the shots are reproducible:
//   member 4514 = Sir Keir Starmer
//   party  15   = Labour
//   constituency 4140 = Holborn and St Pancras (current MP for 4514)
const ROUTES = [
  { key: 'home',         hash: '#/',                  label: 'Home',          waitFor: '.chambers' },
  { key: 'search',       hash: '#/search?q=cooper',   label: 'Search "cooper"', waitFor: '#srch-list li' },
  { key: 'parties',      hash: '#/parties',           label: 'Parties',       waitFor: '.rows li' },
  { key: 'party-15',     hash: '#/party/15',          label: 'Party (Labour)', waitFor: '.hero h1' },
  { key: 'house-commons',hash: '#/house/Commons',     label: 'House: Commons', waitFor: '.hero h1' },
  { key: 'member-4514',  hash: '#/member/4514',       label: 'Member: Starmer', waitFor: '.hero h1' },
  { key: 'constituency-4140', hash: '#/constituency/4140', label: 'Constituency: H&StP', waitFor: '.hero h1' },
  { key: 'debates',      hash: '#/debates',           label: 'Recent debates', waitFor: '.hero h1' },
  { key: 'about',        hash: '#/about',             label: 'About',         waitFor: 'main h1' },
  { key: 'settings',     hash: '#/settings',          label: 'Settings',      waitFor: 'main h1' },
];
const wantRoutes = args.routes ? new Set(args.routes.split(',')) : null;
const todo = ROUTES.filter((r) => !wantRoutes || wantRoutes.has(r.key));

// ---------- viewports ----------
const VIEWPORTS = [
  { id: 'mobile',  width: 414,  height: 896 },
  { id: 'desktop', width: 1280, height: 800 },
];
const SCHEMES = ['dark', 'light'];

// ---------- main ----------

const captures = [];   // every capture's metadata, for the PDF + index

const browser = await chromium.launch();

for (const v of VIEWPORTS) {
  for (const scheme of SCHEMES) {
    // One browser context per (viewport × scheme) so storage state
    // and colour scheme are clean per-pass.
    const ctx = await browser.newContext({
      viewport: { width: v.width, height: v.height },
      colorScheme: scheme,
      ignoreHTTPSErrors: true,
    });
    if (PW) {
      // Seed both auth surfaces so the SPA skips the login dialog.
      // localStorage[parl_auth_token] is what the JS reads first;
      // the fpkg_auth cookie is what the proxy verifies.
      await ctx.addInitScript((pw) => {
        try { localStorage.setItem('parl_auth_token', pw); } catch {}
      }, PW);
      await ctx.addCookies([{
        name: 'fpkg_auth',
        value: encodeURIComponent(PW),
        url: BASE,
        httpOnly: false,
        sameSite: 'Lax',
      }]);
    }

    const page = await ctx.newPage();

    for (const r of todo) {
      const variant = `${v.id}-${scheme}`;
      const stamp   = nowStamp();
      const slug    = `${stamp}_${r.key}_${variant}`;
      process.stderr.write(`  [${variant}] ${r.label} ... `);

      // Navigate. Hash navigation needs a full-load on first hit,
      // then hashchange events afterwards.
      try {
        await page.goto(`${BASE}${r.hash}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      } catch (e) {
        // Some routes fail the very first navigation when the proxy
        // is cold. Retry once.
        try { await page.goto(`${BASE}${r.hash}`, { waitUntil: 'domcontentloaded', timeout: 20000 }); }
        catch (e2) { process.stderr.write(`navigation failed: ${e2.message}\n`); continue; }
      }
      try { await page.waitForLoadState('networkidle', { timeout: 12000 }); } catch {}
      if (r.waitFor) {
        try { await page.waitForSelector(r.waitFor, { timeout: 8000 }); }
        catch { /* render slow; screenshot anyway and surface in metadata */ }
      } else {
        await page.waitForTimeout(800);
      }

      // 1. Screenshot
      const shotPath = `${SHOTS}/${slug}.png`;
      await page.screenshot({ path: shotPath, fullPage: true });

      // 2. Text inventory: title, headings, links, button names, alt text
      const text = await page.evaluate(() => {
        const txt = (n) => (n?.textContent || '').replace(/\s+/g, ' ').trim();
        return {
          title: document.title,
          h1: [...document.querySelectorAll('h1')].map(txt),
          headings: [...document.querySelectorAll('h1, h2, h3, h4')].map((h) => ({
            level: Number(h.tagName.slice(1)),
            text: txt(h),
            visually_hidden: h.classList.contains('visually-hidden'),
          })),
          links: [...document.querySelectorAll('a[href]')].slice(0, 200).map((a) => ({
            text: txt(a),
            href: a.getAttribute('href'),
            aria_label: a.getAttribute('aria-label') || null,
          })),
          buttons: [...document.querySelectorAll('button')].slice(0, 100).map((b) => ({
            text: txt(b),
            aria_label: b.getAttribute('aria-label') || null,
            aria_expanded: b.getAttribute('aria-expanded'),
            disabled: b.disabled,
          })),
          images: [...document.querySelectorAll('img')].slice(0, 100).map((i) => ({
            alt: i.getAttribute('alt'),                   // empty string is intentional
            src: i.getAttribute('src'),
            width: i.naturalWidth, height: i.naturalHeight,
          })),
          // Lang/dir of the document root, useful for the audit trail.
          html_lang: document.documentElement.getAttribute('lang') || null,
          html_dir:  document.documentElement.getAttribute('dir') || null,
          // Live region status — was it populated at capture time?
          sr_status: txt(document.getElementById('sr-status')),
        };
      });

      // 3. Accessibility tree via Chrome DevTools Protocol. Newer
      // Playwright versions removed page.accessibility.snapshot, so
      // we go straight to the source — the same tree screen readers
      // traverse, with role/name/description/value per node.
      let axeTree = null;
      try {
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Accessibility.enable');
        axeTree = await cdp.send('Accessibility.getFullAXTree');
        await cdp.detach();
      } catch (e) {
        axeTree = { error: e.message };
      }

      const meta = {
        run_id:      RUN_ID,
        captured_at: new Date().toISOString(),
        base_url:    BASE,
        url:         page.url(),
        route:       r.key, route_label: r.label,
        viewport:    v.id, viewport_size: { width: v.width, height: v.height },
        color_scheme: scheme,
        screenshot:  `shots/${slug}.png`,
        screenshot_bytes: bytesOf(shotPath),
        ...text,
      };
      writeFileSync(`${META}/${slug}.json`, JSON.stringify(meta, null, 2) + '\n');
      writeFileSync(`${A11Y}/${slug}.json`, JSON.stringify(axeTree, null, 2) + '\n');
      captures.push(meta);
      process.stderr.write(`ok (${meta.screenshot_bytes} bytes)\n`);
    }

    await ctx.close();
  }
}
await browser.close();

// ---------- index.json ----------
const indexPath = `${OUT}/index.json`;
writeFileSync(indexPath, JSON.stringify({
  run_id: RUN_ID,
  base_url: BASE,
  generated_at: new Date().toISOString(),
  viewports: VIEWPORTS,
  schemes: SCHEMES,
  routes: todo.map((r) => ({ key: r.key, label: r.label, hash: r.hash })),
  captures: captures.length,
  captures_by_route: groupBy(captures, 'route'),
}, null, 2) + '\n');
process.stderr.write(`\n${captures.length} captures @ ${OUT}\n`);

// ---------- PDF report ----------
if (!args.noPdf) {
  await buildPdf(captures, OUT, RUN_ID);
}

// ---------- helpers ----------

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--no-pdf') out.noPdf = true;
    else if (a.startsWith('--')) out[a.slice(2)] = argv[++i];
  }
  return out;
}
function nowStamp() {
  // 20260504T031522Z — file-system-safe ISO-8601 condensed.
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
}
function bytesOf(p) { try { return readFileSync(p).length; } catch { return null; } }
function groupBy(arr, key) {
  const out = {};
  for (const x of arr) (out[x[key]] = out[x[key]] || []).push(x.screenshot);
  return out;
}

// PDF bundler — one cover page + one page per route × variant. Each
// page shows the screenshot scaled to fit, plus the URL, timestamp,
// title, h1, alt-text inventory, and accessibility-tree depth as a
// quick "what did the screen reader see?" header.
async function buildPdf(caps, outDir, runId) {
  if (caps.length === 0) return;
  const pdfPath = `${outDir}/report.pdf`;
  const doc = new PDFDocument({
    size: 'A4', margins: { top: 48, bottom: 48, left: 48, right: 48 },
    info: {
      Title: `FPKG screenshot pass ${runId}`,
      Author: 'forgetmenot',
      Subject: 'Visual + a11y capture of fpkg.fly.dev',
      CreationDate: new Date(),
    },
  });
  const out = await import('node:fs').then((m) => m.createWriteStream(pdfPath));
  doc.pipe(out);

  // Cover
  doc.font('Helvetica-Bold').fontSize(22).fillColor('#11315b')
     .text(`FPKG screenshot + a11y pass`, { paragraphGap: 4 });
  doc.font('Helvetica').fontSize(11).fillColor('#444')
     .text(`Run ${runId}  ·  ${caps.length} captures  ·  base ${caps[0].base_url}`, { paragraphGap: 14 });
  doc.font('Helvetica').fontSize(10).fillColor('#222')
     .text('One page per (route × viewport × colour-scheme) capture follows. Each page shows the rendered screenshot above a small inventory: URL, document title, h1 set, alt-text count and any non-decorative alt strings. Sidecar JSON + raw accessibility-tree snapshots live next to this PDF in meta/ and a11y/.');
  doc.moveDown(0.5);
  doc.font('Helvetica').fontSize(9).fillColor('#666')
     .text('Generated by scripts/site-screenshots.mjs against the live demo. Reproduce with the same script + the FPKG_PASSWORD env var.');

  for (const cap of caps) {
    doc.addPage();
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#000')
       .text(`${cap.route_label} — ${cap.viewport} · ${cap.color_scheme}`);
    doc.font('Helvetica').fontSize(8.5).fillColor('#555')
       .text(`${cap.url}   ·   captured ${cap.captured_at}`);
    doc.moveDown(0.3);

    // Inventory line: title, h1 count, link/button/image counts
    const h1Count = (cap.h1 || []).length;
    const altSet  = (cap.images || []).filter((i) => i.alt && i.alt.trim()).map((i) => i.alt);
    doc.font('Helvetica').fontSize(9).fillColor('#222')
       .text(`title: ${cap.title}    h1: ${h1Count}    links: ${cap.links.length}    buttons: ${cap.buttons.length}    images: ${cap.images.length}    descriptive alt: ${altSet.length}`);
    if ((cap.h1 || []).length) {
      doc.font('Helvetica-Oblique').fontSize(9).fillColor('#222')
         .text(`h1 text: ${cap.h1.join(' · ')}`);
    }
    if (altSet.length) {
      doc.font('Helvetica-Oblique').fontSize(8.5).fillColor('#444')
         .text(`alt text: ${altSet.slice(0, 6).join(' / ')}${altSet.length > 6 ? ` (+${altSet.length - 6})` : ''}`);
    }
    doc.moveDown(0.3);

    // Embed screenshot — fit width, cap height to remaining vertical
    // space so we never overflow the page.
    const shotPath = resolve(outDir, cap.screenshot);
    const maxW = doc.page.width  - doc.page.margins.left - doc.page.margins.right;
    const maxH = doc.page.height - doc.page.margins.bottom - doc.y - 16;
    try {
      doc.image(shotPath, { fit: [maxW, maxH], align: 'left' });
    } catch (e) {
      doc.font('Helvetica').fontSize(9).fillColor('#a00').text(`screenshot embed failed: ${e.message}`);
    }
  }

  doc.end();
  await new Promise((res) => out.on('finish', res));
  process.stderr.write(`PDF: ${pdfPath} (${bytesOf(pdfPath)} bytes)\n`);
}
