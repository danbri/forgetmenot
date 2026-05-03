#!/usr/bin/env node
// scripts/appg-report.mjs
//
// Render `third_party/data/appg/analysis.json` into a single
// self-contained PDF report. Uses PDFKit purely for layout
// primitives (text, lines, rectangles, fillColor) — no extra
// chart libraries; bar charts are drawn directly. Keeps the report
// reproducible with one `npm install` and no external services.
//
// Usage:
//   node scripts/appg-report.mjs [analysis.json] [out.pdf]
//
// Sections:
//   1. Cover + headline numbers
//   2. APPG-size distribution (officers per group)
//   3. Top 25 MPs by APPG officerships
//   4. Party composition of officer roles
//   5. Cross-party analysis: party-pair frequency, most cross-party APPGs
//   6. Co-officership network: top 25 MP–MP pairs with shared APPGs
//   7. Methodology + caveats
//
// Charts are intentionally simple (sortable horizontal bars,
// labelled). The aim is a sober "data dossier" PDF, not infoviz.

import { readFileSync, createWriteStream, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import PDFDocument from 'pdfkit';

const inPath  = resolve(process.argv[2] || 'third_party/data/appg/analysis.json');
const outPath = resolve(process.argv[3] || 'third_party/data/appg/report.pdf');
mkdirSync(dirname(outPath), { recursive: true });

const A = JSON.parse(readFileSync(inPath, 'utf8'));

// -------- party colour palette (UK political colour codes, dimmed) --------
const PARTY_COLOR = {
  Labour: '#dd2222', 'Labour (Co-op)': '#bb1f6e',
  Conservative: '#0063ba', 'Liberal Democrat': '#fdbb30',
  'Scottish National Party': '#fff95d', SNP: '#fff95d',
  'Plaid Cymru': '#3f8428',
  Green: '#6ab023', 'Green Party': '#6ab023',
  'Democratic Unionist Party': '#d46a4c', DUP: '#d46a4c',
  'Sinn Féin': '#326760',
  Crossbench: '#777777', 'Non-affiliated': '#999999',
  'Independent': '#444444', 'Reform UK': '#12b6cf',
  'Bishops': '#7f3f7f',
  Other: '#aaaaaa', Unknown: '#bbbbbb',
};
const partyColor = (p) => PARTY_COLOR[p] || PARTY_COLOR.Other;

// -------- pdf setup --------
const doc = new PDFDocument({
  size: 'A4', margins: { top: 60, bottom: 60, left: 56, right: 56 },
  info: {
    Title: 'UK APPG analysis',
    Author: 'forgetmenot',
    Subject: `All-Party Parliamentary Groups, Register edition ${A.edition}`,
    Keywords: 'APPG, UK Parliament, social network analysis',
    CreationDate: new Date(),
  },
});
doc.pipe(createWriteStream(outPath));

const PAGE_W = doc.page.width;
const PAGE_H = doc.page.height;
const M = doc.page.margins;
const W  = PAGE_W - M.left - M.right;     // body width

// Reusable helpers — wrappers around PDFKit so the section code reads cleanly.
//
// PDFKit's `text()` honours `doc.x` as the left edge for the
// paragraph being laid out, and our chart helpers leave `doc.x`
// somewhere inside the chart's column when they finish. The
// `flow()` helper resets `doc.x` to the body's left margin AND
// pins the wrap width to the full body width — so prose paragraphs
// always lay out across the page regardless of what came before.
function flow() { doc.x = M.left; }
function title(s) { flow(); doc.font('Helvetica-Bold').fontSize(20).fillColor('#000').text(s, { width: W, paragraphGap: 6 }); }
function h2(s)    { flow(); doc.moveDown(0.6); doc.font('Helvetica-Bold').fontSize(13).fillColor('#000').text(s, { width: W, paragraphGap: 3 }); }
function p(s, opts = {}) {
  flow();
  doc.font('Helvetica').fontSize(10).fillColor('#222').text(s, { width: W, paragraphGap: 4, ...opts });
}
function caption(s) { flow(); doc.font('Helvetica-Oblique').fontSize(8.5).fillColor('#555').text(s, { width: W, paragraphGap: 6 }); }
function pageBreakIfNeeded(spaceNeeded) {
  if (doc.y + spaceNeeded > PAGE_H - M.bottom) doc.addPage();
}

// Horizontal bar chart. items: [{label, value, color?}]. width is the
// drawing width; barHeight controls density. Always renders the
// numeric value to the right of each bar, label to the left.
function hbar(items, opts = {}) {
  const x0 = M.left;
  const labelW = opts.labelWidth ?? 170;
  const valueW = opts.valueWidth ?? 32;
  const gap    = opts.gap ?? 4;
  const barH   = opts.barHeight ?? 14;
  const totalH = items.length * (barH + gap);
  pageBreakIfNeeded(totalH + 16);
  const top = doc.y;
  const max = Math.max(1, ...items.map((it) => it.value));
  const barAreaW = W - labelW - valueW - 8;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const y = top + i * (barH + gap);
    // Label
    doc.font('Helvetica').fontSize(9).fillColor('#222')
       .text(it.label, x0, y + (barH - 9) / 2, { width: labelW, ellipsis: true });
    // Bar
    const w = (it.value / max) * barAreaW;
    doc.rect(x0 + labelW + 6, y, w, barH).fillColor(it.color || '#235ba8').fill();
    // Value
    doc.font('Helvetica').fontSize(9).fillColor('#222')
       .text(String(it.value), x0 + labelW + 6 + w + 4, y + (barH - 9) / 2,
             { width: valueW, lineBreak: false });
  }
  doc.y = top + totalH + 6;
  doc.fillColor('#000');
}

// Histogram bar chart from {bin: count} object. bins ordered numeric.
function histogram(obj, opts = {}) {
  const bins = Object.keys(obj).map(Number).sort((a, b) => a - b);
  const items = bins.map((b) => ({ label: String(b), value: obj[b], color: opts.color }));
  hbar(items, { labelWidth: 28, valueWidth: 36, barHeight: 12, gap: 3, ...opts });
}

// Stat card row. items: [{label, value}].
function statCards(items) {
  const x0 = M.left, top = doc.y;
  const cardW = (W - 12 * (items.length - 1)) / items.length;
  for (let i = 0; i < items.length; i++) {
    const x = x0 + i * (cardW + 12);
    doc.rect(x, top, cardW, 50).fillColor('#f0f3f8').fill();
    doc.fillColor('#235ba8').font('Helvetica-Bold').fontSize(20)
       .text(String(items[i].value), x + 10, top + 6, { width: cardW - 20, lineBreak: false });
    doc.fillColor('#222').font('Helvetica').fontSize(9)
       .text(items[i].label, x + 10, top + 30, { width: cardW - 20 });
  }
  doc.y = top + 60;
}

// Two-column table for short label/value pairs.
function table(rows, opts = {}) {
  const colA = opts.colA ?? 250;
  pageBreakIfNeeded(rows.length * 14 + 8);
  const x0 = M.left, top = doc.y;
  for (let i = 0; i < rows.length; i++) {
    const y = top + i * 14;
    if (i % 2 === 0) doc.rect(x0 - 4, y - 1, W + 8, 14).fillColor('#fafafa').fill();
    doc.fillColor('#222').font('Helvetica').fontSize(9)
       .text(rows[i][0], x0, y + 1, { width: colA, lineBreak: false, ellipsis: true });
    doc.font('Helvetica').fontSize(9)
       .text(String(rows[i][1]), x0 + colA, y + 1, { width: W - colA, lineBreak: false, ellipsis: true });
  }
  doc.y = top + rows.length * 14 + 6;
  doc.fillColor('#000');
}

// ---------- Cover ----------
doc.font('Helvetica-Bold').fontSize(26).fillColor('#11315b')
   .text('All-Party Parliamentary Groups', { paragraphGap: 4 });
doc.font('Helvetica').fontSize(13).fillColor('#444')
   .text(`A statistical and social-network audit of the UK Parliament Register, edition ${A.edition}`,
         { paragraphGap: 24 });

statCards([
  { label: 'APPGs in register',         value: A.totals.groups },
  { label: 'Officer roles',             value: A.totals.officers },
  { label: 'Distinct MPs / peers',      value: A.total_unique_mps_resolved },
  { label: 'Co-officer pairs',          value: A.total_pairs },
]);

p(`The Register of All-Party Parliamentary Groups names roughly four officers per group: a Chair (or Co-Chairs), a Treasurer, and a small number of Vice-Chairs / Officers. This report ingests every APPG in edition ${A.edition}, resolves each named officer to a Parliament member ID via the Members API (with a Wikidata fallback for hard cases), and computes simple aggregate statistics plus a bipartite-projection social network of the MPs and peers who serve together.`);

p(`Resolution coverage: ${A.totals.matched} of ${A.totals.officers} officer roles (${(100 * A.totals.matched / A.totals.officers).toFixed(1)}%) auto-matched to a member id. The remaining ${A.totals.ambiguous} are same-name collisions among peers (e.g. an inheritance transition) and are surfaced for human review, not silently dropped.`);

doc.moveDown(0.6);
caption(`Source: publications.parliament.uk/pa/cm/cmallparty/${A.edition}/. Generated ${new Date(A.generatedAt).toISOString().slice(0, 10)} by forgetmenot. Data is licensed under the Open Parliament Licence.`);

// ---------- 2. Distribution: officers per group ----------
doc.addPage();
title('1 · Group sizes');
p('How many officers does a typical APPG have? The Register requires four officers minimum (a Registered Contact plus three more), and most groups carry exactly four. A small number have eight or more, where Co-Chairs and multiple Vice-Chairs are used.');
h2('Officers per APPG (matched-officer count)');
histogram(A.hist_officers_per_group, { color: '#235ba8' });

const subj = A.totals.subject, ctry = A.totals.country;
h2('Subject vs Country groups');
hbar([
  { label: 'Subject Group', value: subj, color: '#235ba8' },
  { label: 'Country Group', value: ctry, color: '#a85b23' },
], { labelWidth: 110, barHeight: 18, gap: 6 });
caption('Country groups are organised around a country or region; subject groups around a topic ("Cancer", "Beer", "Football", "AI").');

// ---------- 3. Top MPs by APPG officerships ----------
doc.addPage();
title('2 · Most-officering members');
p('A small number of MPs and peers sit on many APPGs. The list below is the top 25 by the number of distinct groups they appear on as an officer.');
const topMps = (A.top_mps_by_appg_count || []).slice(0, 25)
  .map((m) => ({
    label: `${m.name} (${m.partyAbbr || m.party || '?'}, ${m.house?.[0] || '?'})`,
    value: m.n_appgs,
    color: partyColor(m.party || 'Other'),
  }));
hbar(topMps, { labelWidth: 220, barHeight: 13, gap: 3 });
caption('Bars coloured by the member\'s party. C = Commons, L = Lords.');

// ---------- 4. APPGs per MP histogram ----------
doc.addPage();
title('3 · Officer-load distribution');
p('Most members holding any APPG officership hold one or two. A long tail of "super-joiners" hold 10+. The histogram below counts members by number of APPG officerships held.');
const histObj = {};
for (const k of Object.keys(A.hist_appgs_per_mp).sort((a, b) => Number(a) - Number(b))) histObj[k] = A.hist_appgs_per_mp[k];
histogram(histObj, { color: '#11577f' });
caption('Y-axis: bin (number of APPGs held). X-bar length: count of members with that many officerships.');

// ---------- 5. Party composition of officer roles ----------
doc.addPage();
title('4 · Party composition of officer roles');
p('Total officer roles held by members of each party, summed across every APPG.');
const partyTotals = Object.entries(A.party_overall || {})
  .map(([p, v]) => ({ label: p, value: v.total, color: partyColor(p) }))
  .sort((a, b) => b.value - a.value);
hbar(partyTotals, { labelWidth: 200, barHeight: 14, gap: 4 });
caption('A party with N officer roles is not the same as N distinct members - most members hold multiple officerships.');

// ---------- 6. Cross-party analysis ----------
doc.addPage();
title('5 · Cross-party co-officership');
p('APPGs are intended to be cross-party. To measure how cross-party each group is in practice, we count distinct parties among each group\'s resolved officers (Shannon entropy, in nats - higher = more diverse).');
h2('Most cross-party APPGs');
// Title cleaner: the Register puts "All-Party Parliamentary Group"
// either as a prefix ("All-Party Parliamentary Group on Africa")
// or — rarely — as a suffix ("Chagos Islands ... All-Party
// Parliamentary Group"). Strip both. We also drop the leading
// preposition ("on", "for") so the label is the bare topic.
const cleanAppgTitle = (t) => String(t || '')
  .replace(/^All-Party Parliamentary Group (?:for|on)?\s*/i, '')
  .replace(/\s+All-Party Parliamentary Group\b.*$/i, '')
  .trim();
const xParty = (A.most_cross_party_appgs || []).slice(0, 12).map((g) => ({
  label: `${cleanAppgTitle(g.title)} (${g.n_parties} parties)`,
  value: g.n_officers_resolved,
  color: '#3a7a3a',
}));
hbar(xParty, { labelWidth: 280, barHeight: 13, gap: 3 });

h2('Most-frequent party pairings on APPG benches');
p('Sum, across all APPGs, of unordered party pairs among matched officers. Pairs reflect how often each party-pair shares an APPG officer roster.', { paragraphGap: 6 });
const pairItems = (A.party_pair_top || []).slice(0, 18).map((pp) => ({
  label: `${pp.a}  vs  ${pp.b}`,
  value: pp.n,
  color: partyColor(pp.a),
}));
hbar(pairItems, { labelWidth: 240, barHeight: 12, gap: 3 });

// ---------- 7. Co-officer pairs ----------
doc.addPage();
title('6 · Top co-officering MP pairs');
p('Pairs of members who hold officer roles together on multiple APPGs. The bipartite Member ->APPG graph is projected onto a Member ->Member graph, with edge weight = number of shared groups. The 25 strongest edges are listed below.');
const pairs = (A.top_co_officer_pairs || []).slice(0, 25);
const pairRows = pairs.map((e) => [
  `${e.a_name} (${e.a_party})  -  ${e.b_name} (${e.b_party})`,
  `${e.shared} group${e.shared === 1 ? '' : 's'}`,
]);
table(pairRows, { colA: 360 });
caption('Each row is one MP ->MP edge. Cross-party edges are the most useful "MPs who actually worked together across parties" signal.');

// ---------- 7. Network diagram: circular layout of top co-officers ----------
//
// We place the top-N MPs (by total officerships) on a circle and
// draw edges for every co-officer pair, with line weight scaled
// by the number of shared APPGs and colour determined by whether
// the edge is cross-party or single-party. This is a static
// circular layout (no force-directed solver) — it visualises
// density and party blocks rather than positioning by clustering.
function networkPage() {
  doc.addPage();
  title('7 · Co-officership network');
  p('A circular layout of the 30 members with the most APPG officerships. An edge is drawn between every pair that share at least one APPG; line thickness is scaled by the number of shared groups. Cross-party edges are coloured dark blue (the politically interesting signal); within-party edges are subtle grey. Layout is fixed circular - distance carries no meaning.');

  // Pick the top 30 most-officering members.
  const N = 30;
  const top = (A.top_mps_by_appg_count || []).slice(0, N);
  const idIndex = new Map(top.map((m, i) => [m.id, i]));

  // Filter the pre-computed pair list to pairs where BOTH ends are
  // in the top-N. Keep all edges; we'll modulate by shared count.
  const edges = (A.top_co_officer_pairs || [])
    .filter((e) => idIndex.has(e.a) && idIndex.has(e.b))
    .map((e) => ({
      ai: idIndex.get(e.a), bi: idIndex.get(e.b),
      a_party: e.a_party, b_party: e.b_party,
      shared: e.shared,
      crossParty: e.a_party !== e.b_party,
    }));

  // Layout — centre the circle in the remaining vertical space.
  const cx = M.left + W / 2;
  const top_y = doc.y + 8;
  const radius = Math.min(180, (PAGE_H - M.bottom - top_y - 80) / 2);
  const cy = top_y + radius + 10;

  // Edges first so node markers sit on top. Two passes so within-
  // party edges (subtle grey) draw underneath cross-party edges
  // (prominent blue), making the cross-party signal visible. PDFKit
  // does not support hex with alpha — 6-digit hex only.
  for (const layer of ['intra', 'cross']) {
    for (const e of edges) {
      if ((layer === 'intra') !== !e.crossParty) continue;
      const a = nodePos(e.ai, N, cx, cy, radius);
      const b = nodePos(e.bi, N, cx, cy, radius);
      const lw = 0.4 + Math.log(1 + e.shared) * 1.3;          // log-scale line weight
      const col = e.crossParty ? '#1e4f9c' : '#cfd2d6';        // cross-party = dark blue, intra = light grey
      doc.lineWidth(lw).strokeColor(col).moveTo(a.x, a.y).lineTo(b.x, b.y).stroke();
    }
  }
  // Nodes
  for (let i = 0; i < top.length; i++) {
    const m = top[i];
    const pos = nodePos(i, N, cx, cy, radius);
    const c = partyColor(m.party || 'Other');
    doc.circle(pos.x, pos.y, 4).fillColor(c).fill();
    // Label angled along the tangent, placed just outside the circle.
    const ang = Math.PI * 2 * (i / N) - Math.PI / 2;
    const labelX = cx + Math.cos(ang) * (radius + 8);
    const labelY = cy + Math.sin(ang) * (radius + 8) - 4;
    const right = Math.cos(ang) >= 0;
    const label = m.name.length > 22 ? m.name.slice(0, 21) + '…' : m.name;
    doc.font('Helvetica').fontSize(7).fillColor('#222').text(
      label,
      right ? labelX : labelX - 110,
      labelY,
      { width: 110, align: right ? 'left' : 'right', lineBreak: false },
    );
  }
  // Move past the diagram for any subsequent content on this page.
  doc.y = cy + radius + 40;
  flow();
  caption(`Nodes coloured by party. ${edges.length} edges shown, of which ${edges.filter((e) => e.crossParty).length} are cross-party. Edge thickness scales with log(1 + shared APPGs).`);
}

function nodePos(i, n, cx, cy, r) {
  const ang = Math.PI * 2 * (i / n) - Math.PI / 2;
  return { x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r };
}

networkPage();

// ---------- 8. Methodology + caveats ----------
doc.addPage();
title('Methodology and caveats');
h2('Sources');
p(`• Register of All-Party Parliamentary Groups, edition ${A.edition}, from publications.parliament.uk. Republished by the Office of the Parliamentary Commissioner for Standards every ~6 weeks. Each group page lists Chair, Co-Chair(s), Treasurer, Vice-Chairs and Officers as plain text strings.`);
p('• UK Parliament Members API for resolving officer names to canonical member records (id, party, house, constituency).');

h2('Resolution algorithm');
p('Names are normalised by stripping honorifics (Dame, Sir, Lord, Baroness, "Rt Hon", post-nominals MP/KC/CBE etc.) and the cleaned full name is searched first. If that returns nothing, surname-only is tried. Hits are scored by token overlap, party match, house implied by title, and current-membership status; the top score wins. Genuine same-name peer collisions (e.g. inheritance transitions) are reported as ambiguous rather than guessed.');

h2('Caveats');
p(`• ${A.totals.ambiguous} of ${A.totals.officers} officer roles (${(100 * A.totals.ambiguous / A.totals.officers).toFixed(1)}%) remain ambiguous and are NOT counted in the network projection.`);
p('• "Officers" is a small fixed set per APPG (typically four). The wider membership of each group is not in the Register; co-membership beyond officer level can be substantial and is invisible here.');
p('• Cross-party metrics weigh every officer equally regardless of role. A four-officer group with a Chair from one party and three Vice-Chairs from another is "two-party" by our count, but the chairing party has more agenda-setting power.');
p('• The Register lags real life by a few weeks. A handful of officers who recently stepped down or were succeeded may not be reflected.');
p('• Source data is under the Open Parliament Licence. This report is computed by `forgetmenot`; reproduce with `node scripts/appg-analysis.mjs && node scripts/appg-report.mjs`.');

doc.end();
console.log(JSON.stringify({
  out: outPath,
  groups: A.totals.groups,
  officers: A.totals.officers,
  unique_mps: A.total_unique_mps_resolved,
  pairs: A.total_pairs,
}, null, 2));
