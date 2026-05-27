// All-Party Parliamentary Groups (APPGs).
//
// No JSON API exists. The official Register is published roughly
// every six weeks as a set of static HTML pages on
// publications.parliament.uk under /pa/cm/cmallparty/<YYMMDD>/. Each
// edition has:
//   - introduction.htm
//   - contents.htm           — table of contents listing every group
//   - register-<YYMMDD>.pdf  — same data as a single PDF
//   - one HTML page per group, named by slug (e.g. africa.htm)
//
// This module fetches those pages and parses each group page into a
// structured record (title, purpose, category, officers[], contact,
// agm, benefits[]). Officers carry name + party + role, which is what
// you need to find pairs/small groups of MPs working together.
//
// The publications site rejects requests with a non-browser
// User-Agent (HTTP 403 on the default forgetmenot UA). We therefore
// pin a browser-style UA for this facility unless the caller
// overrides ctx.userAgent.

import { rawFetch } from '../http.mjs';

export const BASE = 'https://publications.parliament.uk/pa/cm/cmallparty';

// Default edition. Discoverable via listEditions(); update as needed.
// Editions follow the YYMMDD pattern (e.g. 260413 = 13 April 2026).
export const DEFAULT_EDITION = '260413';

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function htmlCtx(ctx = {}) {
  return {
    ...ctx,
    accept: 'text/html,application/xhtml+xml',
    userAgent: ctx.userAgent || BROWSER_UA,
  };
}

// ---------- URL builders ----------

export function editionUrl(edition = DEFAULT_EDITION) {
  return `${BASE}/${edition}/`;
}

export function contentsUrl(edition = DEFAULT_EDITION) {
  return `${BASE}/${edition}/contents.htm`;
}

export function introductionUrl(edition = DEFAULT_EDITION) {
  return `${BASE}/${edition}/introduction.htm`;
}

export function pdfUrl(edition = DEFAULT_EDITION) {
  return `${BASE}/${edition}/register-${edition}.pdf`;
}

export function groupUrl(slug, edition = DEFAULT_EDITION) {
  // slug is the page filename without .htm (e.g. "africa", "hong-kong").
  const s = String(slug).replace(/\.htm$/i, '');
  return `${BASE}/${edition}/${encodeURIComponent(s)}.htm`;
}

// CLI-friendly wrappers for the URL builders (the dispatcher passes
// an options object, not a positional edition string).
export function pdfUrlCmd(opts = {}) { return { url: pdfUrl(opts.edition) }; }
export function contentsUrlCmd(opts = {}) { return { url: contentsUrl(opts.edition) }; }

// ---------- HTML fetch ----------

async function fetchHtml(url, ctx = {}) {
  const r = await rawFetch(url, { method: 'GET' }, htmlCtx(ctx));
  return typeof r.body === 'string' ? r.body : new TextDecoder().decode(r.body);
}

// ---------- Edition discovery ----------

// Scrape the year landing page on parliament.uk to find published
// editions for that year. Returns array of { edition, year, label, url }.
export async function listEditions(opts = {}, ctx = {}) {
  const year = opts.year ?? new Date().getFullYear();
  const url = `https://www.parliament.uk/mps-lords-and-offices/standards-and-financial-interests/parliamentary-commissioner-for-standards/registers-of-interests/register-of-all-party-party-parliamentary-groups/registers-published-in-${year}/`;
  const html = await fetchHtml(url, ctx);
  const found = new Map();
  const re = /cmallparty\/(\d{6})/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const ed = m[1];
    if (!found.has(ed)) {
      found.set(ed, {
        edition: ed,
        year: 2000 + Number(ed.slice(0, 2)),
        date: `20${ed.slice(0, 2)}-${ed.slice(2, 4)}-${ed.slice(4, 6)}`,
        url: `${BASE}/${ed}/contents.htm`,
      });
    }
  }
  return [...found.values()].sort((a, b) => b.edition.localeCompare(a.edition));
}

// ---------- Contents (group index) ----------

// Returns array of { slug, title, url } for every group in the edition.
export async function listGroups(opts = {}, ctx = {}) {
  const edition = opts.edition || DEFAULT_EDITION;
  const html = await fetchHtml(contentsUrl(edition), ctx);
  const groups = [];
  const seen = new Set();
  // Match <a href="slug.htm">Title</a>. The contents page uses
  // relative hrefs ending in .htm; absolute hrefs and known
  // non-group pages are filtered out.
  const re = /<a\s+href="([^":?#]+\.htm)"[^>]*>([\s\S]*?)<\/a>/gi;
  const skip = new Set(['contents.htm', 'introduction.htm']);
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    if (href.includes('/') || href.startsWith('http')) continue;
    if (skip.has(href.toLowerCase())) continue;
    const slug = href.replace(/\.htm$/i, '');
    if (seen.has(slug)) continue;
    seen.add(slug);
    const title = stripTags(m[2]).trim();
    groups.push({ slug, title, url: groupUrl(slug, edition) });
  }
  return { edition, count: groups.length, groups };
}

// ---------- Group page parser ----------

// Fetch and parse one group page into a structured record.
export async function getGroup(slug, opts = {}, ctx = {}) {
  const edition = opts.edition || DEFAULT_EDITION;
  const url = groupUrl(slug, edition);
  const html = await fetchHtml(url, ctx);
  return { ...parseGroup(html), slug, edition, url };
}

// Pure parser. Exported so callers can apply it to a saved file.
export function parseGroup(html) {
  // Title from <h1 class="mainTitle">…<span class="subHead">Subject</span></h1>
  const h1 = matchOne(html, /<h1\s+class="mainTitle"[^>]*>([\s\S]*?)<\/h1>/i);
  const subjectFromH1 = h1
    ? stripTags(matchOne(h1, /<span\s+class="subHead"[^>]*>([\s\S]*?)<\/span>/i) || '').trim()
    : '';

  // Each section of the page is a <table class="basicTable">. Parse
  // every such table into a list-of-rows-of-cells, then interpret.
  const tables = extractTables(html);

  let title = '';
  let purpose = '';
  let category = '';
  const officers = [];
  const contact = {};
  const agm = {};
  const benefits = { financial: [], inKind: [] };

  for (const tbl of tables) {
    const flat = tbl.map((row) => row.map((c) => stripTags(c).replace(/\s+/g, ' ').trim()));
    const head = flat[0]?.[0] || '';

    // Title / Purpose / Category table — two-cell rows keyed by label.
    if (flat.some((r) => r[0] === 'Title')) {
      for (const r of flat) {
        if (r[0] === 'Title') title = r[1] || '';
        else if (r[0] === 'Purpose') purpose = r[1] || '';
        else if (r[0] === 'Category') category = r[1] || '';
      }
      continue;
    }

    // Officers table — header row "Officers", then header row
    // "Role|Name|Party", then data rows.
    if (head === 'Officers' || flat[1]?.join('|') === 'Role|Name|Party') {
      for (const r of flat.slice(2)) {
        if (r.length < 3) continue;
        const [role, name, party] = r;
        if (!role && !name) continue;
        officers.push({ role, name, party });
      }
      continue;
    }

    // Contact Details — single column with bolded labels inline.
    if (head === 'Contact Details') {
      Object.assign(contact, parseContact(tbl));
      continue;
    }

    // AGM table — two-cell rows keyed by label.
    if (head.startsWith('Inaugural and Annual General Meetings')) {
      for (const r of flat.slice(1)) {
        if (r.length < 2) continue;
        const [k, v] = r;
        if (/Date of IGM/i.test(k)) agm.date = v;
        else if (/income and expenditure/i.test(k)) agm.incomeExpenditureApproved = v;
        else if (/Reporting year/i.test(k)) agm.reportingYear = v;
        else if (/Next reporting deadline/i.test(k)) agm.nextDeadline = v;
      }
      continue;
    }

    // Benefits panels. The page lays these out two ways:
    //
    //   Layout A (single combined table):
    //     row 0 = "Registrable benefits received by the group"
    //     row 1 = "Financial Benefits"  | or "Benefits In Kind"
    //     row 2 = column header
    //     row 3+ = data
    //
    //   Layout B (announcement + separate detail tables):
    //     one table whose only row is "Registrable benefits received by
    //     the group", then a separate table per benefit type whose row 0
    //     is "Financial Benefits" or "Benefits In Kind", row 1 = column
    //     header, row 2+ = data.
    //
    // Detect by scanning every row for a sub-head cell matching either
    // type, then take the next row as the column header and everything
    // after as data.
    const panel = findBenefitPanel(flat);
    if (panel) {
      const { kind, headerRowIdx } = panel;
      const colHeaders = flat[headerRowIdx + 1] || [];
      const dataRows = flat.slice(headerRowIdx + 2);
      const items = parseBenefitRows(dataRows, colHeaders, kind);
      if (kind === 'inKind') benefits.inKind.push(...items);
      else benefits.financial.push(...items);
      continue;
    }
  }

  return {
    title: title || subjectFromH1,
    subject: subjectFromH1,
    purpose,
    category,
    officers,
    contact,
    agm,
    benefits,
  };
}

// ---------- Crawl whole register ----------

// Fetch contents.htm and every group page, returning an array of
// parsed records. Slow (~600 requests). Pass opts.limit to cap.
// opts.delayMs throttles between requests (default 250ms).
export async function crawl(opts = {}, ctx = {}) {
  const edition = opts.edition || DEFAULT_EDITION;
  const limit = opts.limit ? Number(opts.limit) : Infinity;
  const delayMs = opts.delayMs ?? 250;
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;

  const idx = await listGroups({ edition }, ctx);
  const targets = idx.groups.slice(0, limit);
  const results = [];
  const errors = [];

  for (let i = 0; i < targets.length; i++) {
    const g = targets[i];
    try {
      const rec = await getGroup(g.slug, { edition }, ctx);
      results.push(rec);
      if (onProgress) onProgress({ i: i + 1, total: targets.length, slug: g.slug });
    } catch (e) {
      errors.push({ slug: g.slug, message: e.message, status: e.status });
    }
    if (delayMs && i < targets.length - 1) await sleep(delayMs);
  }

  return { edition, count: results.length, groups: results, errors };
}

// ---------- helpers ----------

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function matchOne(s, re) {
  const m = s.match(re);
  return m ? m[1] : '';
}

function stripTags(s) {
  return String(s)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#160;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
}

// Extract every <table class="basicTable">...</table> as an array of
// rows, where each row is an array of cell HTML strings. Tolerant of
// nested tags but assumes no nested <table> (the source has none).
function extractTables(html) {
  const out = [];
  const tableRe = /<table\b[^>]*class="[^"]*basicTable[^"]*"[^>]*>([\s\S]*?)<\/table>/gi;
  let t;
  while ((t = tableRe.exec(html)) !== null) {
    const rows = [];
    const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    let r;
    while ((r = rowRe.exec(t[1])) !== null) {
      const cells = [];
      const cellRe = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
      let c;
      while ((c = cellRe.exec(r[1])) !== null) cells.push(c[1]);
      rows.push(cells);
    }
    out.push(rows);
  }
  return out;
}

// Contact table is a single <td> containing alternating <p><strong>
// label</strong></p><p>value</p> blocks, plus mailto: and href links.
function parseContact(tbl) {
  const out = {};
  // Flatten all cells across rows of the contact table.
  const cellHtml = tbl.flat().join('\n');
  const paragraphs = [];
  const pRe = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = pRe.exec(cellHtml)) !== null) paragraphs.push(m[1]);

  let currentLabel = null;
  for (const para of paragraphs) {
    const strong = matchOne(para, /<strong>([\s\S]*?)<\/strong>/i);
    const text = stripTags(para);
    if (strong && text === stripTags(strong)) {
      // Pure label paragraph.
      currentLabel = labelKey(stripTags(strong));
      continue;
    }
    if (!text) continue;

    // Strong-prefixed paragraph: "Registered Contact: Foo MP, …"
    if (strong) {
      const key = labelKey(stripTags(strong));
      const value = text.replace(stripTags(strong), '').replace(/^[\s:,-]+/, '').trim();
      pushKV(out, key, value);
      currentLabel = key;
      continue;
    }

    if (currentLabel) pushKV(out, currentLabel, text);
  }

  // Pull out emails and links across the whole contact block.
  const emails = [...cellHtml.matchAll(/mailto:([^"'>\s]+)/gi)].map((x) => x[1]);
  if (emails.length) out.emails = [...new Set(emails)];
  const websites = [...cellHtml.matchAll(/href="(https?:[^"]+)"/gi)]
    .map((x) => x[1])
    .filter((u) => !/parliament\.uk/i.test(u) && !u.startsWith('mailto:'));
  if (websites.length) out.websites = [...new Set(websites)];

  return out;
}

// Locate the "Financial Benefits" / "Benefits In Kind" sub-head row in
// a flat (stripped-text) table. Returns { kind, headerRowIdx } or null.
// kind ∈ "financial" | "inKind".
function findBenefitPanel(flat) {
  for (let i = 0; i < flat.length; i += 1) {
    const cell = (flat[i][0] || '').replace(/\s+/g, ' ').trim();
    if (/^Financial Benefits$/i.test(cell)) return { kind: 'financial', headerRowIdx: i };
    if (/^Benefits In Kind$/i.test(cell))   return { kind: 'inKind',    headerRowIdx: i };
  }
  return null;
}

// Map data rows from a benefit table to typed records by joining cells
// to column-header positions. The header row text varies slightly
// between layouts ("Value £s" vs "Value £s In bands of £1,500"); we
// match on prefix tokens.
function parseBenefitRows(dataRows, colHeaders, kind) {
  // Build a column-name map. Strip the "In bands of …" suffix because
  // it can appear as a continuation line in the same <td> for in-kind
  // tables; that two-line cell collapses to a single space here.
  const cols = colHeaders.map((h) => {
    const t = (h || '').replace(/\s+/g, ' ').trim();
    if (/^Source$/i.test(t))      return 'source';
    if (/^Description$/i.test(t)) return 'description';
    if (/^Value/i.test(t))        return 'value';
    if (/^Received$/i.test(t))    return 'received';
    if (/^Registered$/i.test(t))  return 'registered';
    return null;
  });

  const out = [];
  for (const row of dataRows) {
    // Need at least a source cell.
    if (!row || !row[0]) continue;
    // Defend against empty trailing rows.
    if (row.every((c) => !c)) continue;

    const rec = {};
    for (let i = 0; i < cols.length && i < row.length; i += 1) {
      const key = cols[i];
      if (!key) continue;
      rec[key] = (row[i] || '').replace(/\s+/g, ' ').trim();
    }

    // Surface the "in bands" distinction explicitly so downstream code
    // doesn't silently treat a band string ("49,501-51,000") as an
    // exact pound value.
    if (kind === 'inKind') {
      if (rec.value) { rec.valueBand = rec.value; delete rec.value; }
      out.push({
        source: rec.source || '',
        description: rec.description || '',
        valueBand: rec.valueBand || '',
        received: rec.received || '',
        registered: rec.registered || '',
      });
    } else {
      out.push({
        source: rec.source || '',
        value: rec.value || '',
        received: rec.received || '',
        registered: rec.registered || '',
      });
    }
  }
  return out;
}

function labelKey(label) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function pushKV(out, key, value) {
  if (!key) return;
  if (out[key] === undefined) out[key] = value;
  else if (Array.isArray(out[key])) out[key].push(value);
  else out[key] = [out[key], value];
}
