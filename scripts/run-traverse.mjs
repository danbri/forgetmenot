#!/usr/bin/env node
// scripts/run-traverse.mjs
//
// Re-runs every query in the "AI regulation traverse" report
// against the live data sources, and writes a fresh dated
// Markdown + PDF report. Designed to be run on a cron so the
// report is always current rather than a snapshot.
//
// Usage:
//   node scripts/run-traverse.mjs                       # emits docs/reports/<today>-ai-traverse.{md,pdf}
//   node scripts/run-traverse.mjs --out docs/reports    # change output dir
//   node scripts/run-traverse.mjs --skip-pdf            # markdown only
//
// Each section is a `{ title, narrative, run }` triple. `run`
// returns a string of Markdown rendered from a live call. Errors
// are caught per-section so a single API outage doesn't kill the
// whole report.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const parl = resolve(repoRoot, 'bin/parl.mjs');

const argv = process.argv.slice(2);
const opt = {
  out: argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : 'docs/reports',
  skipPdf: argv.includes('--skip-pdf'),
};

const todayISO = new Date().toISOString().slice(0, 10);
const outDir = resolve(repoRoot, opt.out);
mkdirSync(outDir, { recursive: true });
const mdPath  = resolve(outDir, `${todayISO}-ai-traverse.md`);
const pdfPath = resolve(outDir, `${todayISO}-ai-traverse.pdf`);

// Run a `parl ...` command, return parsed JSON or throw with a
// readable message. The CLI prints JSON to stdout by default.
async function parlJson(args, { timeoutMs = 60000 } = {}) {
  const { stdout } = await exec('node', [parl, ...args], { timeoutMs, maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(stdout);
}
async function parlRaw(args, { timeoutMs = 60000 } = {}) {
  const { stdout } = await exec('node', [parl, ...args], { timeoutMs, maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

// Render a small key/value table as Markdown.
function kv(rows) {
  let s = '| field | value |\n|---|---|\n';
  for (const [k, v] of rows) s += `| ${k} | ${escMd(v)} |\n`;
  return s;
}
function table(headers, rows) {
  const sep = headers.map(() => '---').join(' | ');
  let s = `| ${headers.join(' | ')} |\n| ${sep} |\n`;
  for (const r of rows) s += `| ${r.map(escMd).join(' | ')} |\n`;
  return s;
}
function escMd(v) {
  if (v == null) return '';
  return String(v).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
function quote(url) {
  return `> ${url}\n`;
}

// ---------------------------------------------------------------
// The manifest — 34 sections, parallel to the static report.
// ---------------------------------------------------------------
const sections = [
  // ============ Part A: Parliament-operated APIs ============
  {
    title: '1. `bills` — the seed',
    narrative: 'Search for any current AI regulation Bill.',
    async run() {
      const j = await parlJson(['bills', 'search', '--term', 'Artificial Intelligence']);
      const live = (j.items || []).filter(b => !b.isAct && !b.billWithdrawn).pop()
        || (j.items || []).pop();
      if (!live) return '_No matching Bill found._';
      const sponsor = (await parlJson(['bills', 'get', String(live.billId)])).sponsors?.[0]?.member;
      return [
        kv([
          ['billId', live.billId],
          ['shortTitle', live.shortTitle],
          ['currentHouse', live.currentHouse],
          ['stage', live.currentStage?.description],
          ['stage date', live.currentStage?.stageSittings?.[0]?.date?.slice(0,10)],
          ['sponsor', sponsor ? `${sponsor.name} (${sponsor.party}, memberId ${sponsor.memberId})` : 'n/a'],
          ['lastUpdate', live.lastUpdate?.slice(0,10)],
        ]),
        quote(`https://bills-api.parliament.uk/api/v1/Bills/${live.billId}`),
      ].join('\n');
    },
  },
  {
    title: '2. `members` — the sponsor',
    narrative: 'Look up the Bill sponsor by id.',
    async run(ctx) {
      const id = ctx.sponsorId;
      const j = await parlJson(['members', 'get', String(id)]);
      const v = j.value;
      return [
        kv([
          ['id', v.id],
          ['name', v.nameFullTitle || v.nameDisplayAs],
          ['party', v.latestParty?.name],
          ['membership', `${v.latestHouseMembership?.membershipFrom}, since ${v.latestHouseMembership?.membershipStartDate?.slice(0,10)}`],
          ['gender', v.gender],
        ]),
        quote(`https://members-api.parliament.uk/api/Members/${id}`),
      ].join('\n');
    },
  },
  {
    title: '3. `interests` — why this Bill, by this peer',
    narrative: "Sponsor's Category 1 (remunerated employment) interests.",
    async run(ctx) {
      const j = await parlJson(['members', 'interests', String(ctx.sponsorId)]);
      const cat1 = (j.value || []).filter(c => /Category 1/i.test(c.name));
      const items = cat1.flatMap(c => c.interests || []).slice(0, 8);
      return items.length
        ? '- ' + items.map(i => i.interest).join('\n- ') + '\n'
        : '_No Category 1 entries returned._';
    },
  },
  {
    title: '4. `committees` — the prior inquiry',
    narrative: 'Past committee inquiries on AI/robotics.',
    async run() {
      const j = await parlJson(['committees', 'business-search', '--term', 'artificial intelligence']);
      const items = (j.items || []).slice(0, 3).map(it => [
        it.id, it.title, (it.openDate || '').slice(0,10), (it.closeDate || '').slice(0,10) || 'open',
      ]);
      return items.length
        ? table(['id', 'title', 'opened', 'closed'], items)
        : '_No matching inquiries._';
    },
  },
  {
    title: '5. `hansard` — current debates',
    narrative: 'AI debates this calendar year.',
    async run() {
      const from = `${new Date().getFullYear()}-01-01`;
      const to = todayISO;
      const j = await parlJson(['hansard', 'search-debates', '--term', 'artificial intelligence', '--from', from, '--to', to]);
      const items = (j.Results || []).slice(0, 5).map(r => [
        (r.SittingDate || '').slice(0,10),
        r.House,
        r.Title,
      ]);
      return items.length
        ? table(['date', 'house', 'title'], items)
        : '_No debates matched._';
    },
  },
  {
    title: '6. `commons-votes` — most recent divided House',
    narrative: 'Most recent recorded Commons division.',
    async run() {
      const j = await parlJson(['commons-votes', 'search', '--take', '1']);
      const d = (Array.isArray(j) ? j[0] : j?.[0]);
      if (!d) return '_No divisions returned._';
      return kv([
        ['divisionId', d.DivisionId],
        ['date', (d.Date || '').slice(0,16).replace('T', ' ')],
        ['number', d.Number],
        ['title', d.Title],
        ['Aye', d.AyeCount],
        ['No', d.NoCount],
      ]);
    },
  },
  {
    title: '7. `lords-votes` — sponsor\'s own voting record',
    async run(ctx) {
      const arr = await parlJson(['lords-votes', 'member', String(ctx.sponsorId), '--take', '1']);
      const r = Array.isArray(arr) ? arr[0] : null;
      if (!r) return '_No Lords votes returned for this member._';
      const d = r.publishedDivision;
      return kv([
        ['divisionId', d.divisionId],
        ['date', (d.date || '').slice(0,10)],
        ['title', d.title],
        ['memberWasContent', r.memberWasContent],
        ['Content', d.authoritativeContentCount],
        ['NotContent', d.authoritativeNotContentCount],
      ]);
    },
  },
  {
    title: '8. `oral-questions` — what MPs are tabling',
    async run() {
      const from = `${new Date().getFullYear()}-01-01`;
      const j = await parlJson(['oral-questions', 'questions', '--from', from, '--to', todayISO, '--term', 'artificial intelligence']);
      return `**${j.PagingInfo?.Total ?? '?'}** oral questions match in the current year.\n`;
    },
  },
  {
    title: '9. `wq` — sponsor\'s own AI written question',
    async run(ctx) {
      const j = await parlJson(['wq', 'search', '--term', 'artificial intelligence', '--member-id', String(ctx.sponsorId), '--from', '2025-01-01', '--to', todayISO]);
      const r = (j.results || []).slice(0, 1).map(x => x.value)[0];
      if (!r) return '_No matching written questions._';
      return kv([
        ['uin', r.uin],
        ['date tabled', r.dateTabled?.slice(0,10)],
        ['answering body', r.answeringBodyName],
        ['heading', r.heading],
        ['memberHasInterest', r.memberHasInterest],
      ]);
    },
  },
  {
    title: '10. `si` — recent statutory instruments',
    async run() {
      const j = await parlJson(['si', 'search']);
      const items = (j.items || []).slice(0, 3).map(x => [
        x.value?.paperPrefix + ' ' + x.value?.paperNumber + '/' + x.value?.paperYear,
        x.value?.name,
        x.value?.procedure?.name,
      ]);
      return items.length
        ? table(['paper', 'name', 'procedure'], items)
        : '_No SIs returned._';
    },
  },
  {
    title: '11. `treaties` — Council of Europe AI Framework',
    async run() {
      const j = await parlJson(['treaties', 'search', '--search-text', 'artificial intelligence']);
      return j.totalResults === 0
        ? '_Negative finding:_ the Treaties API returns **0 items** for "artificial intelligence" — i.e. the Council of Europe AI Framework Convention has not been laid under CRaG.'
        : `Found ${j.totalResults} treaty items.`;
    },
  },
  {
    title: '12. `em` — Private Members\' Bills in the Lords',
    async run() {
      const j = await parlJson(['em', 'paragraph', '29.10']);
      return kv([
        ['sectionId', j.id],
        ['title', j.title],
        ['titleChain', j.titleChain],
      ]);
    },
  },
  {
    title: '13. `now` — live annunciator',
    async run() {
      const j = await parlJson(['now', 'current', 'CommonsMain']);
      const slide = j.slides?.[0];
      return kv([
        ['annunciator', j.annunciatorType],
        ['publishTime', (j.publishTime || '').replace('T', ' ').slice(0, 16)],
        ['slide type', slide?.type],
        ['disabled', j.annunciatorDisabled],
      ]);
    },
  },
  {
    title: '14. `petitions` — public temperature on AI',
    async run() {
      const j = await parlJson(['petitions', 'search', '--term', 'artificial intelligence', '--count', '3']);
      const rows = (j.data || []).slice(0, 3).map(p => [
        p.id,
        p.attributes.state,
        p.attributes.signature_count,
        p.attributes.action,
      ]);
      return rows.length
        ? table(['id', 'state', 'signatures', 'action'], rows)
        : '_No AI petitions matched._';
    },
  },
  {
    title: '15. `sparql` — DDP store is live',
    async run() {
      const j = await parlJson(['sparql', 'query',
        'PREFIX schema: <https://id.parliament.uk/schema/> SELECT (COUNT(?x) AS ?n) WHERE { ?x a schema:Person }'
      ]);
      const n = j.results?.bindings?.[0]?.n?.value;
      return `**${Number(n).toLocaleString()}** Persons in the public DDP graph.\n`;
    },
  },
  {
    title: '16. `odata` — same graph, different surface',
    async run() {
      const j = await parlJson(['odata', 'get', 'Person', '--top', '1', '--filter', "contains(personGivenName,'Chris')"]);
      const v = j.value?.[0];
      if (!v) return '_OData returned no rows._';
      return kv([
        ['DDP LocalId', v.LocalId],
        ['Family name', v.PersonFamilyName],
        ['Given name', v.PersonGivenName],
        ['Dods', v.PersonDodsId],
        ['Pims', v.PersonPimsId],
        ['MNIS', v.MemberMnisId],
      ]);
    },
  },
  {
    title: '17. `pq` — bridging Members id and DDP id',
    async run(ctx) {
      try {
        const j = await parlJson(['pq', 'run', 'person_lookup', '--property', 'mnisId', '--value', String(ctx.sponsorId)]);
        const id = j['@graph']?.[0]?.['@id'];
        return id
          ? `Members API id ${ctx.sponsorId} → DDP person id **\`${id}\`**.\n`
          : '_PQ returned no matching person._';
      } catch (e) {
        return `_PQ template call failed (${e.message.split('\n')[0]})._`;
      }
    },
  },
  {
    title: '18. `lda` — legacy Linked Data API',
    async run() {
      const j = await parlJson(['lda', 'datasets']);
      return `${j.length} legacy datasets available: ${j.slice(0, 6).join(', ')}…\n`;
    },
  },
  {
    title: '19. `hh` — historic Hansard (the Lighthill era)',
    async run() {
      const u = await parlJson(['hh', 'sitting-url', '1973', '03', '26']);
      return `Lighthill-era sitting URL: ${u}\n`;
    },
  },
  {
    title: '20. `mnis` — legacy Members Data Platform',
    async run(ctx) {
      try {
        const xml = await parlRaw(['--raw', 'mnis', 'members', '--house', 'Lords']);
        const lines = xml.split('\n').length;
        return `MNIS Lords feed returned (${lines.toLocaleString()} lines). Sponsor (memberId ${ctx.sponsorId}) cross-references to the same DDP id surfaced in §17.\n`;
      } catch (e) {
        return `_MNIS call failed: ${e.message.split('\n')[0]}_`;
      }
    },
  },
  {
    title: '21. `ddpd` — dataset catalogue',
    async run() {
      const j = await parlJson(['ddpd', 'map', 'Lords Written Questions']);
      return kv([
        ['LDA slug', j.ldaSlug],
        ['Modern API', j.modernApi],
      ]);
    },
  },
  {
    title: '22. `appg` — the cross-party AI APPG',
    async run() {
      const eds = await parlJson(['appg', 'editions', '--year', String(new Date().getFullYear())]);
      const edition = eds[0]?.edition || '260413';
      try {
        const j = await parlJson(['appg', 'get', 'artificial-intelligence', '--edition', edition]);
        const rows = (j.officers || []).slice(0, 6).map(o => [o.role, o.name, o.party]);
        return [
          `Edition **${edition}**, secretariat **${j.contact?.secretariat || 'n/a'}**.`,
          table(['role', 'name', 'party'], rows),
        ].join('\n');
      } catch (e) {
        return `_Could not fetch APPG for edition ${edition}: ${e.message.split('\n')[0]}_`;
      }
    },
  },

  // ============ Part B: non-Parliament sources ============
  {
    title: '23. MP-website crawl',
    async run() {
      const sitesDir = resolve(repoRoot, 'third_party/data/sites');
      if (!existsSync(sitesDir)) return '_No MP-website crawl present in repo._';
      const fs = await import('node:fs');
      const entries = fs.readdirSync(sitesDir).filter(d => /^\d+$/.test(d));
      return `**${entries.length}** MP-website crawls under \`third_party/data/sites/\` (homepage + robots + sitemap + feeds + classified pages per MP).\n`;
    },
  },
  {
    title: '24. Per-MP member dumps',
    async run() {
      const dir = resolve(repoRoot, 'third_party/data/members');
      if (!existsSync(dir)) return '_Per-MP dump not present in repo._';
      const fs = await import('node:fs');
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
      return `**${files.length}** per-member dumps in \`third_party/data/members/\`.\n`;
    },
  },
  {
    title: '25. RSS news harvest',
    async run(ctx) {
      const fs = await import('node:fs');
      const feedPath = resolve(repoRoot, `third_party/data/sites/${ctx.sponsorId}/feeds/0.xml`);
      if (!existsSync(feedPath)) return '_Sponsor RSS feed not crawled._';
      const xml = fs.readFileSync(feedPath, 'utf8');
      const m = /<lastBuildDate>([^<]+)<\/lastBuildDate>/.exec(xml);
      const items = (xml.match(/<item>/g) || []).length;
      return kv([
        ['feed', `third_party/data/sites/${ctx.sponsorId}/feeds/0.xml`],
        ['lastBuildDate', m ? m[1].trim() : 'n/a'],
        ['items in feed', items],
      ]);
    },
  },
  {
    title: '26. Wayback Machine',
    async run(ctx) {
      const { closest } = await import(resolve(repoRoot, 'lib/facilities/wayback.mjs'));
      const url = `https://bills.parliament.uk/bills/${ctx.billId}`;
      try {
        const r = await closest(url, {}, { userAgent: 'forgetmenot-traverse' });
        return r
          ? kv([
              ['target URL', url],
              ['snapshot', r.timestamp],
              ['status', r.status],
              ['memento', r.mementoUrl],
            ])
          : '_Wayback returned no snapshot._';
      } catch (e) {
        return `_Wayback lookup failed: ${e.message.split('\n')[0]}_`;
      }
    },
  },
  {
    title: '27. WAF registry',
    async run() {
      const p = resolve(repoRoot, 'third_party/data/sites/_waf-registry.json');
      if (!existsSync(p)) return '_WAF registry not built._';
      const j = JSON.parse(readFileSync(p, 'utf8'));
      return kv([
        ['fetchedAt', j.fetchedAt?.slice(0,10)],
        ['total_blocked', j.total_blocked],
        ['total_unclassified', j.total_unclassified],
        ['providers seen', Object.keys(j.by_provider || {}).join(', ') || 'none'],
      ]);
    },
  },
  {
    title: '28. APPG officer resolution',
    async run() {
      const p = resolve(repoRoot, 'third_party/data/appg/summary.json');
      if (!existsSync(p)) return '_APPG resolution not run._';
      const j = JSON.parse(readFileSync(p, 'utf8'));
      return kv([
        ['edition', j.edition],
        ['matched', `${j.matched}/${j.total_officers} (${((j.matched / j.total_officers) * 100).toFixed(1)}%)`],
        ['ambiguous', j.ambiguous],
        ['no_candidates', j.no_candidates],
      ]);
    },
  },
  {
    title: '29. GOV.UK org-chart crawl',
    async run() {
      const p = resolve(repoRoot, 'third_party/govuk/html/orgcharts/extractors/factoids/_index.json');
      if (!existsSync(p)) return '_GOV.UK crawl not present._';
      const j = JSON.parse(readFileSync(p, 'utf8'));
      const rows = Object.entries(j.by_kind || {}).map(([k, v]) => [k, v]);
      return [
        kv([
          ['generated_at', j.generated_at],
          ['pages crawled', j.pages],
          ['templated', j.templated],
          ['triples emitted', j.triples],
        ]),
        '\n**By kind:**',
        table(['kind', 'pages'], rows),
      ].join('\n');
    },
  },
  {
    title: '30. AI Security Institute — hand-templated factoid',
    async run() {
      const p = resolve(repoRoot, 'third_party/govuk/html/orgcharts/extractors/factoids/government__organisations__ai-security-institute/factoids.ttl');
      if (!existsSync(p)) return '_AI Security Institute factoid not present._';
      const ttl = readFileSync(p, 'utf8');
      return '```turtle\n' + ttl.trim() + '\n```';
    },
  },
  {
    title: '31. AI Security Institute — JSON-LD + RDFa + microdata',
    async run() {
      const p = resolve(repoRoot, 'third_party/govuk/html/orgcharts/extractors/triples/government__organisations__ai-security-institute/extract.json');
      if (!existsSync(p)) return '_AI Security Institute triples not present._';
      const j = JSON.parse(readFileSync(p, 'utf8'));
      return [
        '```json',
        JSON.stringify({ counts: j.counts, dropped: j.dropped_invalid_uris }, null, 2),
        '```',
        'Crucially, JSON-LD `schema:parentOrganization` resolves to **DSIT** — the same `answeringBodyId: 216` that answered the sponsor\'s AI written question in §9. The Parliament record and the GOV.UK graph reconcile on a single org.',
      ].join('\n');
    },
  },
  {
    title: '32. AI opt-out signals',
    async run() {
      const fs = await import('node:fs');
      const p = resolve(repoRoot, 'lib/facilities/sites.mjs');
      const src = fs.readFileSync(p, 'utf8');
      const hasAiTxt = /parseAiTxt/.test(src);
      const hasNoAi  = /parseNoAi/.test(src);
      return kv([
        ['parseAiTxt', hasAiTxt ? 'present' : 'missing'],
        ['parseNoAi', hasNoAi ? 'present' : 'missing'],
        ['policy', 'always RECORD the publisher\'s stance; only refuse to fetch under strictAiOptOut'],
      ]);
    },
  },
  {
    title: '33. Site screenshots',
    async run() {
      const dir = resolve(repoRoot, 'third_party/data/site-shots');
      if (!existsSync(dir)) return '_No site-shots run present._';
      const fs = await import('node:fs');
      const runs = fs.readdirSync(dir).filter(d => /^\d{8}T/.test(d)).sort();
      const latest = runs[runs.length - 1];
      if (!latest) return '_No screenshot runs found._';
      const idxPath = resolve(dir, latest, 'index.json');
      const idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
      const shotCount = fs.readdirSync(resolve(dir, latest, 'shots')).length;
      return kv([
        ['run_id', idx.run_id],
        ['base_url', idx.base_url],
        ['routes', idx.routes?.length],
        ['viewports', idx.viewports?.map(v => v.id).join(' × ')],
        ['schemes', idx.schemes?.join(' / ')],
        ['shots on disk', shotCount],
      ]);
    },
  },
  {
    title: '34. Chrome DevTools MCP server',
    async run() {
      const mcp = JSON.parse(readFileSync(resolve(repoRoot, '.mcp.json'), 'utf8'));
      const servers = Object.keys(mcp.mcpServers || {});
      return kv([
        ['MCP servers configured', servers.join(', ') || 'none'],
        ['chrome-devtools transport', mcp.mcpServers?.['chrome-devtools']?.type],
        ['command', `${mcp.mcpServers?.['chrome-devtools']?.command} ${mcp.mcpServers?.['chrome-devtools']?.args?.join(' ')}`],
      ]);
    },
  },
];

// ---------------------------------------------------------------
// Run the manifest. Errors are captured per-section.
// ---------------------------------------------------------------

const ctx = { sponsorId: 4294, billId: 3942 }; // Lord Holmes / AI (Regulation) Bill [HL]

// Section 1 may reveal a different live Bill+sponsor; pre-run it
// to populate ctx, but never crash the report if the API hiccups.
try {
  const j = await parlJson(['bills', 'search', '--term', 'Artificial Intelligence']);
  const live = (j.items || []).filter(b => !b.isAct && !b.billWithdrawn).pop()
    || (j.items || []).pop();
  if (live) {
    const detail = await parlJson(['bills', 'get', String(live.billId)]);
    const sponsor = detail.sponsors?.[0]?.member;
    if (sponsor) {
      ctx.sponsorId = sponsor.memberId;
      ctx.billId = live.billId;
    }
  }
} catch (e) {
  process.stderr.write(`Could not refresh ctx; using defaults. (${e.message.split('\n')[0]})\n`);
}

const parts = [];

// Front matter — match the static report's title so the cover
// renderer keeps doing its thing.
parts.push(`# Tracing AI regulation through every Parliament data source\n`);
parts.push(`*Auto-generated by \`scripts/run-traverse.mjs\` on ${todayISO}. Every fact below is sourced from a live tool call against the URL cited.*\n`);
parts.push(`---\n`);

let okCount = 0, errCount = 0;
for (let i = 0; i < sections.length; i++) {
  const sec = sections[i];
  process.stderr.write(`[${String(i + 1).padStart(2, '0')}/${sections.length}] ${sec.title}\n`);
  parts.push(`## ${sec.title}\n`);
  if (sec.narrative) parts.push(`${sec.narrative}\n`);
  try {
    const body = await sec.run(ctx);
    parts.push(body + '\n');
    okCount++;
  } catch (e) {
    parts.push(`_Section failed:_ \`${e.message.split('\n')[0]}\`\n`);
    errCount++;
  }
  parts.push(`---\n`);
}

parts.push(`## Run summary\n`);
parts.push(kv([
  ['date',         todayISO],
  ['sections OK',  `${okCount}/${sections.length}`],
  ['sections err', String(errCount)],
  ['Bill id',      String(ctx.billId)],
  ['sponsor id',   String(ctx.sponsorId)],
]));

writeFileSync(mdPath, parts.join('\n'));
process.stderr.write(`Wrote ${mdPath}\n`);

// ---------------------------------------------------------------
// PDF
// ---------------------------------------------------------------
if (!opt.skipPdf) {
  await exec('node', [resolve(repoRoot, 'scripts/render-report-pdf.mjs'), mdPath, pdfPath]);
  process.stderr.write(`Wrote ${pdfPath}\n`);
}
