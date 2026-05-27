#!/usr/bin/env node
// scripts/render-report-pdf.mjs
//
// Render a Markdown report into a stylish, paginated PDF using
// PDFKit only (already a devDep). Designed for the AI-regulation
// traverse report under docs/reports/, but works on any Markdown
// that uses the subset below.
//
// Supported Markdown features:
//   - # / ## / ### headings
//   - paragraphs with inline **bold**, *italic*, `code`, [text](url)
//   - bullet lists (- item) and numbered lists (1. item)
//   - GitHub-flavoured pipe tables, including the | --- | separator
//   - fenced code blocks (```)
//   - blockquotes (> ...)
//   - horizontal rules (---)
//
// Usage:
//   node scripts/render-report-pdf.mjs <in.md> [out.pdf]

import { readFileSync, createWriteStream, mkdirSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import PDFDocument from 'pdfkit';

const inPath  = resolve(process.argv[2] || 'docs/reports/2026-05-17-ai-regulation-traverse.md');
const outPath = resolve(process.argv[3] || inPath.replace(/\.md$/i, '.pdf'));
mkdirSync(dirname(outPath), { recursive: true });

const src = readFileSync(inPath, 'utf8');

// ---------------------------------------------------------------
// Theme
// ---------------------------------------------------------------
const C = {
  ink:     '#1a1f2c',
  body:    '#222831',
  muted:   '#555f6d',
  rule:    '#cbd2d9',
  zebra:   '#f4f6f9',
  accent:  '#235ba8',     // section blue
  warm:    '#a8431d',     // h1 accent
  code_bg: '#f5f3ef',
  code_ink:'#2b2118',
  quote:   '#5b6b7f',
  link:    '#1a55b3',
};
const F = {
  sans:    'Helvetica',
  sansB:   'Helvetica-Bold',
  sansI:   'Helvetica-Oblique',
  sansBI:  'Helvetica-BoldOblique',
  mono:    'Courier',
  monoB:   'Courier-Bold',
};

// ---------------------------------------------------------------
// Document
// ---------------------------------------------------------------
const doc = new PDFDocument({
  size: 'A4',
  margins: { top: 64, bottom: 72, left: 60, right: 60 },
  bufferPages: true,
  info: {
    Title: 'Tracing AI regulation through every Parliament data source',
    Author: 'forgetmenot',
    Subject: 'A novel enquiry against 34 UK-Parliament and adjacent data sources',
    Keywords: 'UK Parliament, AI regulation, Lord Holmes, APPG, GOV.UK, data',
    CreationDate: new Date(),
  },
});
doc.pipe(createWriteStream(outPath));

const PAGE_W = doc.page.width;
const PAGE_H = doc.page.height;
const M = doc.page.margins;
const W = PAGE_W - M.left - M.right;
const RUNNING_TITLE = 'forgetmenot — AI regulation traverse';

function flow() { doc.x = M.left; }
function ensure(space) {
  if (doc.y + space > PAGE_H - M.bottom) doc.addPage();
}
function rule(width = 0.5, color = C.rule, gap = 8) {
  ensure(gap + 4);
  const y = doc.y + gap / 2;
  doc.save();
  doc.moveTo(M.left, y).lineTo(M.left + W, y).lineWidth(width).strokeColor(color).stroke();
  doc.restore();
  doc.y = y + gap / 2;
}

// ---------------------------------------------------------------
// Inline parsing
// ---------------------------------------------------------------
// Tokens: { kind: 'text'|'bold'|'italic'|'code'|'link', text, href? }
function parseInline(s) {
  const out = [];
  let i = 0;
  while (i < s.length) {
    // link [text](url)
    if (s[i] === '[') {
      const close = s.indexOf('](', i);
      const end   = close >= 0 ? s.indexOf(')', close + 2) : -1;
      if (close > 0 && end > close) {
        out.push({ kind: 'link', text: s.slice(i + 1, close), href: s.slice(close + 2, end) });
        i = end + 1; continue;
      }
    }
    // code `…`
    if (s[i] === '`') {
      const end = s.indexOf('`', i + 1);
      if (end > i) { out.push({ kind: 'code', text: s.slice(i + 1, end) }); i = end + 1; continue; }
    }
    // bold **…**
    if (s.startsWith('**', i)) {
      const end = s.indexOf('**', i + 2);
      if (end > i + 2) { out.push({ kind: 'bold', text: s.slice(i + 2, end) }); i = end + 2; continue; }
    }
    // italic *…* — single asterisk, not adjacent to letters on both sides
    if (s[i] === '*') {
      const end = s.indexOf('*', i + 1);
      if (end > i + 1 && s[end + 1] !== '*' && s[i + 1] !== ' ' && s[i + 1] !== '*') {
        out.push({ kind: 'italic', text: s.slice(i + 1, end) }); i = end + 1; continue;
      }
    }
    // accumulate plain text up to next special
    let j = i;
    while (j < s.length && s[j] !== '`' && s[j] !== '*' && s[j] !== '[') j++;
    if (j === i) { out.push({ kind: 'text', text: s[i] }); i++; }
    else { out.push({ kind: 'text', text: s.slice(i, j) }); i = j; }
  }
  // merge consecutive text runs
  const merged = [];
  for (const t of out) {
    const last = merged[merged.length - 1];
    if (last && last.kind === 'text' && t.kind === 'text') last.text += t.text;
    else merged.push(t);
  }
  return merged;
}

// Decode common HTML/markdown entities present in our source.
function decodeText(s) {
  return s
    .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–')
    .replace(/&amp;/g,  '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#8217;/g, '’').replace(/&#8211;/g, '–').replace(/&#8212;/g, '—')
    .replace(/&#8230;/g, '…').replace(/&middot;/g, '·');
}

// Render inline tokens as a flowing paragraph at the current cursor.
// fontSize and base color come from opts; the caller supplies a
// width (we always lay out within the body column).
//
// IMPORTANT: PDFKit's `continued: true` chain can interact badly
// with width + lineGap when a single chained run wraps to multiple
// lines AND fonts change between tokens — observed creating dozens
// of spurious blank pages on long ordered-list items. To stay
// safe we collapse each call's text to a leaf token, flush it
// with `continued: true`, and only close the paragraph on the
// last token with `continued: false`. We also guard against empty
// tokens, which seem to be the trigger for the runaway behaviour.
function renderInline(tokens, opts = {}) {
  const fontSize = opts.fontSize ?? 10;
  const lineGap  = opts.lineGap ?? 2;
  const indent   = opts.indent ?? 0;
  const baseColor = opts.color ?? C.body;
  const width = (opts.width ?? W) - indent;
  // Drop empty tokens entirely.
  const safe = tokens
    .map(t => ({ ...t, text: decodeText(t.text || '') }))
    .filter(t => t.text.length > 0);
  if (!safe.length) return;
  flow();
  if (indent) doc.x = M.left + indent;
  for (let k = 0; k < safe.length; k++) {
    const t = safe[k];
    const isLast = k === safe.length - 1;
    let font = F.sans, color = baseColor, underline = false, link = null;
    if (t.kind === 'bold')   { font = F.sansB; }
    if (t.kind === 'italic') { font = F.sansI; color = C.body; }
    if (t.kind === 'code')   { font = F.mono; color = C.code_ink; }
    if (t.kind === 'link')   { color = C.link; underline = true; link = t.href; }
    doc.font(font).fontSize(fontSize).fillColor(color);
    doc.text(t.text, { width, lineGap, continued: !isLast, underline, link });
  }
  doc.fillColor(C.body);
}

// ---------------------------------------------------------------
// Block parsing
// ---------------------------------------------------------------
// Lex the markdown into a list of blocks for easier rendering.
const lines = src.replace(/\r\n/g, '\n').split('\n');
const blocks = [];

function pushPara(buf) {
  if (!buf.length) return;
  blocks.push({ kind: 'p', text: buf.join(' ').trim() });
}

for (let i = 0; i < lines.length;) {
  const ln = lines[i];
  // fenced code
  if (ln.startsWith('```')) {
    const lang = ln.slice(3).trim();
    const start = ++i;
    while (i < lines.length && !lines[i].startsWith('```')) i++;
    blocks.push({ kind: 'code', lang, text: lines.slice(start, i).join('\n') });
    i = Math.min(i + 1, lines.length);
    continue;
  }
  // hr
  if (/^---+\s*$/.test(ln)) { blocks.push({ kind: 'hr' }); i++; continue; }
  // headings
  let m;
  if ((m = /^(#{1,3})\s+(.*)$/.exec(ln))) {
    blocks.push({ kind: `h${m[1].length}`, text: m[2].trim() });
    i++; continue;
  }
  // blockquote (collapse consecutive >)
  if (ln.startsWith('>')) {
    const buf = [];
    while (i < lines.length && lines[i].startsWith('>')) {
      buf.push(lines[i].replace(/^>\s?/, ''));
      i++;
    }
    blocks.push({ kind: 'quote', text: buf.join(' ').trim() });
    continue;
  }
  // table — detect by `|` in line followed by separator
  if (ln.includes('|') && /\|/.test(lines[i + 1] || '') && /^\s*\|?\s*:?-+/.test(lines[i + 1])) {
    const headers = splitRow(ln);
    i += 2; // skip header + separator
    const rows = [];
    while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
      rows.push(splitRow(lines[i])); i++;
    }
    blocks.push({ kind: 'table', headers, rows });
    continue;
  }
  // bullet list — consume run of - or * items
  if (/^\s*[-*]\s+/.test(ln)) {
    const items = [];
    while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
      const text = lines[i].replace(/^\s*[-*]\s+/, '');
      // continuation lines (indented)
      let j = i + 1;
      const cont = [];
      while (j < lines.length && /^\s{2,}\S/.test(lines[j])) { cont.push(lines[j].trim()); j++; }
      items.push([text, ...cont].join(' '));
      i = j;
    }
    blocks.push({ kind: 'ul', items });
    continue;
  }
  // ordered list
  if (/^\s*\d+\.\s+/.test(ln)) {
    const items = [];
    while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
      const text = lines[i].replace(/^\s*\d+\.\s+/, '');
      let j = i + 1;
      const cont = [];
      while (j < lines.length && /^\s{2,}\S/.test(lines[j])) { cont.push(lines[j].trim()); j++; }
      items.push([text, ...cont].join(' '));
      i = j;
    }
    blocks.push({ kind: 'ol', items });
    continue;
  }
  // blank line → paragraph break
  if (ln.trim() === '') { i++; continue; }
  // accumulate paragraph
  const buf = [];
  while (i < lines.length && lines[i].trim() !== '' &&
         !/^(#{1,3} |```|>|---+\s*$)/.test(lines[i]) &&
         !/^\s*[-*]\s+/.test(lines[i]) &&
         !/^\s*\d+\.\s+/.test(lines[i]) &&
         !(lines[i].includes('|') && /^\s*\|?\s*:?-+/.test(lines[i + 1] || ''))) {
    buf.push(lines[i]); i++;
  }
  pushPara(buf);
}

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|'))   s = s.slice(0, -1);
  return s.split('|').map(c => c.trim());
}

// ---------------------------------------------------------------
// Rendering blocks
// ---------------------------------------------------------------
function drawH1(text) {
  // Always start a fresh page for a chapter — but if the current
  // page is effectively empty (we're at the top margin), reuse it.
  if (doc.y > M.top + 4) doc.addPage();
  // Big chapter-style title with a coloured rule above.
  doc.save();
  doc.moveTo(M.left, doc.y - 2).lineTo(M.left + 80, doc.y - 2).lineWidth(2.5).strokeColor(C.warm).stroke();
  doc.restore();
  doc.moveDown(0.3);
  flow();
  doc.font(F.sansB).fontSize(22).fillColor(C.ink).text(decodeText(text), { width: W, paragraphGap: 6 });
  doc.moveDown(0.4);
}

function drawH2(text) {
  ensure(40);
  doc.moveDown(0.6);
  flow();
  // Small accent square + bold title
  const y = doc.y + 4;
  doc.save();
  doc.rect(M.left, y, 3, 12).fillColor(C.accent).fill();
  doc.restore();
  doc.x = M.left + 10;
  doc.font(F.sansB).fontSize(13).fillColor(C.ink).text(decodeText(text), { width: W - 10, paragraphGap: 3 });
  flow();
  doc.moveDown(0.2);
}

function drawH3(text) {
  ensure(24);
  doc.moveDown(0.4);
  flow();
  doc.font(F.sansB).fontSize(11).fillColor(C.ink).text(decodeText(text), { width: W, paragraphGap: 2 });
  doc.moveDown(0.2);
}

function drawP(text) {
  ensure(14);
  flow();
  renderInline(parseInline(text), { fontSize: 10, lineGap: 2.5 });
  doc.moveDown(0.4);
}

function drawQuote(text) {
  ensure(20);
  const top = doc.y;
  flow();
  doc.x = M.left + 14;
  doc.font(F.sansI).fontSize(10).fillColor(C.quote);
  renderInline(parseInline(text), { fontSize: 10, lineGap: 2.5, indent: 14, color: C.quote });
  const bottom = doc.y;
  // left rule
  doc.save();
  doc.moveTo(M.left + 2, top).lineTo(M.left + 2, bottom - 2).lineWidth(2).strokeColor(C.accent).stroke();
  doc.restore();
  flow();
  doc.moveDown(0.4);
}

function drawCode(text) {
  const fontSize = 8.5;
  const lines = text.split('\n');
  const lineH = fontSize + 3;
  const padX = 8, padY = 8;
  const boxH = lines.length * lineH + padY * 2;
  ensure(boxH + 4);
  const top = doc.y;
  doc.save();
  doc.rect(M.left, top, W, boxH).fillColor(C.code_bg).fill();
  // Left rule for a touch of structure
  doc.rect(M.left, top, 3, boxH).fillColor(C.accent).fill();
  doc.restore();
  doc.font(F.mono).fontSize(fontSize).fillColor(C.code_ink);
  for (let i = 0; i < lines.length; i++) {
    doc.text(lines[i] || ' ', M.left + padX, top + padY + i * lineH, { width: W - padX * 2, lineBreak: false });
  }
  doc.y = top + boxH + 6;
  flow();
}

function drawHr() {
  ensure(14);
  doc.moveDown(0.4);
  rule(0.6, C.rule, 8);
  doc.moveDown(0.3);
}

function drawList(items, ordered) {
  // Render each item as a single plain text() call with the
  // markdown markers stripped. Inline emphasis in lists is
  // dropped on purpose — using PDFKit's chained `continued: true`
  // path with mixed fonts triggered a runaway page-add cascade.
  for (let idx = 0; idx < items.length; idx++) {
    ensure(20);
    const bullet = ordered ? `${idx + 1}.` : '•';
    flow();
    const startY = doc.y;
    doc.font(F.sansB).fontSize(10).fillColor(C.accent)
       .text(bullet, M.left, startY, { width: 18, lineBreak: false });
    doc.font(F.sans).fontSize(10).fillColor(C.body)
       .text(decodeText(stripInline(items[idx])), M.left + 20, startY,
             { width: W - 20, lineGap: 2.5 });
    doc.moveDown(0.2);
  }
  doc.moveDown(0.2);
  flow();
}

// Compute the height a row of inline-text cells will occupy.
function measureRowHeight(cells, colWidths, fontSize) {
  let maxH = 0;
  for (let c = 0; c < cells.length; c++) {
    const w = colWidths[c] - 8;
    doc.font(F.sans).fontSize(fontSize);
    const h = doc.heightOfString(decodeText(stripInline(cells[c])), { width: w, lineGap: 1 });
    if (h > maxH) maxH = h;
  }
  return Math.max(maxH, fontSize + 4);
}

function stripInline(s) {
  // Drop markdown markers so heightOfString approximates final layout.
  return s.replace(/\*\*/g, '').replace(/`/g, '').replace(/\*/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

function drawTable(headers, rows) {
  const fontSize = 9;
  // Allocate columns: weight by max content length, normalised to width.
  const weights = headers.map((_, c) => {
    const m = Math.max(headers[c].length, ...rows.map(r => (r[c] || '').length));
    return Math.max(8, m);
  });
  const sum = weights.reduce((a, b) => a + b, 0);
  const colWidths = weights.map(w => Math.floor((w / sum) * W));
  const leftover = W - colWidths.reduce((a, b) => a + b, 0);
  colWidths[colWidths.length - 1] += leftover;

  // Render plain text (with markdown markers stripped). Inline
  // emphasis inside cells is dropped on purpose — page-break-safe
  // matters more than bold-in-cell for this report.
  const cellText = (s) => decodeText(stripInline(s || ''));
  const measureCellH = (cells) => {
    let maxH = 0;
    for (let c = 0; c < cells.length; c++) {
      doc.font(F.sans).fontSize(fontSize);
      const h = doc.heightOfString(cellText(cells[c]), {
        width: colWidths[c] - 8, lineGap: 1,
      });
      if (h > maxH) maxH = h;
    }
    return Math.max(maxH, fontSize + 2) + 6;
  };

  const renderRow = (cells, isHeader, zebra) => {
    const h = isHeader
      ? measureCellH(cells)
      : measureCellH(cells);
    ensure(h);
    const ry = doc.y;
    if (isHeader) {
      doc.save();
      doc.rect(M.left, ry, W, h).fillColor(C.accent).fill();
      doc.restore();
    } else if (zebra) {
      doc.save();
      doc.rect(M.left, ry, W, h).fillColor(C.zebra).fill();
      doc.restore();
    }
    let cx = M.left;
    for (let c = 0; c < cells.length; c++) {
      doc.font(isHeader ? F.sansB : F.sans).fontSize(fontSize)
         .fillColor(isHeader ? '#ffffff' : C.body)
         .text(cellText(cells[c]), cx + 4, ry + 3, {
           width: colWidths[c] - 8, lineGap: 1,
         });
      cx += colWidths[c];
    }
    doc.y = ry + h;
    if (!isHeader) {
      doc.save();
      doc.moveTo(M.left, doc.y).lineTo(M.left + W, doc.y)
         .lineWidth(0.3).strokeColor(C.rule).stroke();
      doc.restore();
    }
  };

  renderRow(headers, true, false);
  for (let r = 0; r < rows.length; r++) renderRow(rows[r], false, r % 2 === 0);
  doc.moveDown(0.4);
  flow();
}

// ---------------------------------------------------------------
// Cover page
// ---------------------------------------------------------------
function drawCover() {
  // top accent band
  doc.save();
  doc.rect(0, 0, PAGE_W, 14).fillColor(C.warm).fill();
  doc.rect(0, 14, PAGE_W, 4).fillColor(C.accent).fill();
  doc.restore();

  doc.x = M.left;
  doc.y = 150;
  doc.font(F.sans).fontSize(11).fillColor(C.muted)
     .text('forgetmenot · data report', { width: W });
  doc.moveDown(0.6);
  doc.font(F.sansB).fontSize(32).fillColor(C.ink)
     .text('Tracing AI regulation through every Parliament data source', { width: W, lineGap: 2 });
  doc.moveDown(0.6);
  doc.font(F.sansI).fontSize(13).fillColor(C.muted)
     .text(
       'A novel enquiry against each of the 22 facilities the forgetmenot CLI ' +
       'wraps, plus 12 more against the scraped, archived and extracted ' +
       'non-Parliament corpora the repository ships.',
       { width: W, lineGap: 3 }
     );

  // Stat cards — fixed top y so every card aligns regardless of
  // intermediate text() advancing doc.y.
  const CARD_TOP = 360;
  const CARD_H = 72;
  const cards = [
    ['34',     'distinct enquiries'],
    ['22',     'Parliament APIs'],
    ['441',    'MP websites'],
    ['2,170',  'APPG officers resolved'],
    ['19,883', 'GOV.UK triples'],
  ];
  const cardW = (W - 10 * (cards.length - 1)) / cards.length;
  for (let i = 0; i < cards.length; i++) {
    const x = M.left + i * (cardW + 10);
    doc.save();
    doc.rect(x, CARD_TOP, cardW, CARD_H).fillColor('#f0f3f8').fill();
    doc.rect(x, CARD_TOP, cardW, 3).fillColor(C.accent).fill();
    doc.restore();
    doc.font(F.sansB).fontSize(18).fillColor(C.ink)
       .text(cards[i][0], x + 10, CARD_TOP + 14, { width: cardW - 20, lineBreak: false });
    doc.font(F.sans).fontSize(8.5).fillColor(C.muted)
       .text(cards[i][1], x + 10, CARD_TOP + 42, { width: cardW - 20 });
  }
  doc.y = CARD_TOP + CARD_H + 24;

  // Metadata block
  const meta = [
    ['Unifying thread', 'Artificial Intelligence (Regulation) Bill [HL] — sponsor Lord Holmes of Richmond'],
    ['Compiled',        '2026-05-17'],
    ['Source',          'docs/reports/2026-05-17-ai-regulation-traverse.md'],
    ['Engine',          'pdfkit, no external services'],
  ];
  doc.moveDown(0.8);
  const labelW = 130;
  for (const [k, v] of meta) {
    flow();
    doc.font(F.sansB).fontSize(9.5).fillColor(C.muted)
       .text(k.toUpperCase(), M.left, doc.y, { width: labelW, lineBreak: false });
    doc.font(F.sans).fontSize(10.5).fillColor(C.body)
       .text(v, M.left + labelW, doc.y - 11, { width: W - labelW });
    doc.moveDown(0.3);
  }

  // Bottom footer
  doc.font(F.sansI).fontSize(8.5).fillColor(C.muted)
     .text(
       'Every fact in this report is sourced from a live tool call against the URL cited. ' +
       'No facts are reconstructed from model memory.',
       M.left, PAGE_H - 84, { width: W }
     );
}

drawCover();

// Skip the first H1 if it matches the cover title, since the cover
// already renders it (otherwise we'd get a near-duplicate page).
const firstH1 = blocks.findIndex(b => b.kind === 'h1');
if (firstH1 >= 0 && /Tracing AI regulation/i.test(blocks[firstH1].text)) {
  blocks.splice(firstH1, 1);
}

// Drop any leading horizontal rules / blank-feeling blocks before
// the first real content so we don't start the body on an empty page.
while (blocks.length && blocks[0].kind === 'hr') blocks.shift();

// Start the body on a fresh page after the cover.
doc.addPage();

// ---------------------------------------------------------------
// Body
// ---------------------------------------------------------------
for (const b of blocks) {
  switch (b.kind) {
    case 'h1': drawH1(b.text); break;
    case 'h2': drawH2(b.text); break;
    case 'h3': drawH3(b.text); break;
    case 'p':  drawP(b.text); break;
    case 'quote': drawQuote(b.text); break;
    case 'code':  drawCode(b.text); break;
    case 'hr':    drawHr(); break;
    case 'ul':    drawList(b.items, false); break;
    case 'ol':    drawList(b.items, true); break;
    case 'table': drawTable(b.headers, b.rows); break;
    default: break;
  }
}

// ---------------------------------------------------------------
// Chrome: running header + footer on every page except the cover.
// We use the PDF coordinate API directly (no text() wrapping)
// because PDFKit's text() with width+align can trigger extra
// page additions on the buffered page range pass.
// ---------------------------------------------------------------
const range = doc.bufferedPageRange();
for (let p = range.start; p < range.start + range.count; p++) {
  doc.switchToPage(p);
  if (p === 0) continue; // cover stays clean
  // Header
  doc.save();
  doc.font(F.sans).fontSize(8).fillColor(C.muted);
  doc.text(RUNNING_TITLE, M.left, 32, { lineBreak: false });
  doc.moveTo(M.left, 48).lineTo(M.left + W, 48).lineWidth(0.4).strokeColor(C.rule).stroke();
  // Footer — left label
  doc.text('forgetmenot · 2026-05-17', M.left, PAGE_H - 40, { lineBreak: false });
  // Footer — right page number, manually right-aligned via widthOfString.
  const num = `${p}`;
  doc.font(F.sansB).fontSize(8);
  const numW = doc.widthOfString(num);
  doc.text(num, M.left + W - numW, PAGE_H - 40, { lineBreak: false });
  doc.restore();
}

doc.end();
process.stdout.write(`Wrote ${outPath}\n`);
