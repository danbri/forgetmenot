#!/usr/bin/env node
// forgetmenot MCP server.
// Wraps lib/facilities/*.mjs as MCP tools so that any MCP-speaking
// client (Claude Desktop, Cursor, Continue, Zed, Codex, OpenWebUI,
// in-browser harnesses, etc.) can drive UK Parliament queries
// without shell access or CLI installation.
//
// Run as a stdio server:
//   node mcp/server.mjs
//
// Wire into Claude Desktop in claude_desktop_config.json:
//   {
//     "mcpServers": {
//       "forgetmenot": {
//         "command": "node",
//         "args": ["/abs/path/to/forgetmenot-palace/mcp/server.mjs"]
//       }
//     }
//   }
//
// See mcp/README.md for setup in other clients.

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import { VERSION } from '../lib/http.mjs';
import * as members from '../lib/facilities/members.mjs';
import * as bills from '../lib/facilities/bills.mjs';
import * as committees from '../lib/facilities/committees.mjs';
import * as hansard from '../lib/facilities/hansard.mjs';
import * as commonsVotes from '../lib/facilities/commons-votes.mjs';
import * as lordsVotes from '../lib/facilities/lords-votes.mjs';
import * as oralQuestions from '../lib/facilities/oral-questions.mjs';
import * as wq from '../lib/facilities/written-questions.mjs';
import * as si from '../lib/facilities/statutory-instruments.mjs';
import * as treaties from '../lib/facilities/treaties.mjs';
import * as interests from '../lib/facilities/interests.mjs';
import * as em from '../lib/facilities/erskine-may.mjs';
import * as now from '../lib/facilities/now.mjs';
import * as petitions from '../lib/facilities/petitions.mjs';
import * as sparql from '../lib/facilities/sparql.mjs';
import * as odata from '../lib/facilities/odata.mjs';
import * as pq from '../lib/facilities/parameterised-query.mjs';
import * as lda from '../lib/facilities/linked-data-api.mjs';

const server = new McpServer({
  name: 'forgetmenot',
  version: VERSION,
}, {
  // Surface what we provide.
  capabilities: { tools: {}, resources: {}, prompts: {} },
});

// -------------- helpers --------------

// Wrap a JS value as the MCP CallToolResult content array.
const ok = (value) => ({
  content: [{
    type: 'text',
    text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
  }],
});

const fail = (msg) => ({
  isError: true,
  content: [{ type: 'text', text: msg }],
});

// Wrap an async facility call. Catches errors and returns them as MCP
// tool errors instead of letting them propagate (which would terminate
// the server).
const safe = (handler) => async (args) => {
  try {
    const r = await handler(args || {});
    return ok(r);
  } catch (e) {
    return fail(`${e.name || 'Error'}: ${e.message}${e.url ? ` (${e.url})` : ''}`);
  }
};

// -------------- SPARQL (priority) --------------

server.registerTool('sparql_query', {
  title: 'SPARQL query',
  description:
    'Run a SPARQL 1.1 query against the public UK Parliament SPARQL endpoint ' +
    '(https://api.parliament.uk/sparql). Returns SPARQL results JSON for SELECT/ASK, ' +
    'CSV/TSV/Turtle text per `format`. Endpoint fronts the DDP store (~7.5M triples, ' +
    'inference off). Procedural data may live in DD (separate store, not on this ' +
    'endpoint) — drop down to si/treaties/wq tools when SPARQL returns empty.',
  inputSchema: {
    query: z.string().describe('SPARQL query text. Keep LIMIT modest while exploring.'),
    format: z.enum(['json', 'csv', 'tsv', 'turtle', 'rdfxml', 'xml']).optional()
      .describe('Result format. Default: json (SPARQL results JSON).'),
    method: z.enum(['get', 'post']).optional()
      .describe('HTTP method. Default: get. Use post for very long queries.'),
  },
}, safe(({ query, format, method }) =>
  sparql.query(query, { format, method })
));

server.registerTool('sparql_classes', {
  title: 'SPARQL: classes by frequency',
  description:
    'List the most-used instance classes in the SPARQL store. Useful for getting ' +
    'oriented in the data graph. Emits one row per class with a count.',
  inputSchema: {
    limit: z.number().int().positive().optional().describe('Default 200.'),
  },
}, safe(({ limit }) => sparql.listClasses({ limit })));

server.registerTool('sparql_predicates_of', {
  title: 'SPARQL: predicates used on a class',
  description:
    'List predicates used on instances of a given class URI, with usage counts. ' +
    'Use this after sparql_classes to drill into a class.',
  inputSchema: {
    classUri: z.string().describe('Full class URI, no <> brackets.'),
    limit: z.number().int().positive().optional(),
  },
}, safe(({ classUri, limit }) => sparql.predicatesOf(classUri, { limit })));

server.registerTool('sparql_describe', {
  title: 'SPARQL: DESCRIBE a resource',
  description: 'Run a SPARQL DESCRIBE query on a single URI. Returns Turtle by default.',
  inputSchema: {
    uri: z.string(),
    format: z.enum(['turtle', 'rdfxml', 'json']).optional(),
  },
}, safe(({ uri, format }) => sparql.describe(uri, { format })));

server.registerTool('sparql_skos_schemes', {
  title: 'SPARQL: SKOS concept schemes',
  description: 'List SKOS concept schemes (taxonomies) present in the store.',
  inputSchema: {},
}, safe(() => sparql.skosSchemes()));

// -------------- Members --------------

server.registerTool('members_search', {
  title: 'Search current Members',
  description:
    'Search current MPs and Lords by name, party, location, postcode, or policy interest. ' +
    'House: Commons or Lords. Take ≤ 20.',
  inputSchema: {
    name: z.string().optional(),
    house: z.enum(['Commons', 'Lords']).optional(),
    postcode: z.string().optional(),
    partyId: z.number().int().optional(),
    location: z.string().optional(),
    policyInterestId: z.number().int().optional(),
    take: z.number().int().min(1).max(20).optional(),
    skip: z.number().int().nonnegative().optional(),
  },
}, safe((args) => members.search(args)));

server.registerTool('members_get', {
  title: 'Get a Member',
  description: 'Full record for one Member by ID.',
  inputSchema: { id: z.number().int() },
}, safe(({ id }) => members.getById(id)));

server.registerTool('members_voting', {
  title: 'Member voting record',
  description: 'Pages of recorded votes by a Member.',
  inputSchema: {
    id: z.number().int(),
    house: z.enum(['Commons', 'Lords']).optional(),
    page: z.number().int().nonnegative().optional(),
  },
}, safe(({ id, house, page }) => members.voting(id, { house, page })));

server.registerTool('members_interests', {
  title: 'Registered interests for a Member',
  inputSchema: { id: z.number().int() },
}, safe(({ id }) => members.registeredInterests(id)));

server.registerTool('members_contributions', {
  title: 'Contribution summary',
  description: 'Counts of debate contributions, written questions, EDMs etc.',
  inputSchema: { id: z.number().int() },
}, safe(({ id }) => members.contributionSummary(id)));

server.registerTool('constituency_search', {
  title: 'Search constituencies',
  inputSchema: {
    searchText: z.string(),
    take: z.number().int().min(1).max(20).optional(),
  },
}, safe(({ searchText, take }) => members.constituencySearch({ searchText, take })));

server.registerTool('parties_state', {
  title: 'State of the parties',
  description: 'Seat counts by party in a House on a date.',
  inputSchema: {
    house: z.enum(['Commons', 'Lords']),
    forDate: z.string().describe('YYYY-MM-DD'),
  },
}, safe(({ house, forDate }) => members.partiesState(house, forDate)));

// -------------- Bills --------------

server.registerTool('bills_search', {
  title: 'Search Bills',
  description: 'Search Bills by term, House, Member, session, status.',
  inputSchema: {
    term: z.string().optional(),
    house: z.enum(['Commons', 'Lords', 'All']).optional(),
    session: z.number().int().optional(),
    memberId: z.number().int().optional(),
    isAct: z.boolean().optional(),
    take: z.number().int().min(1).max(20).optional(),
  },
}, safe((args) => bills.search({ searchTerm: args.term, currentHouse: args.house, ...args })));

server.registerTool('bills_get', {
  title: 'Get a Bill',
  inputSchema: { billId: z.number().int() },
}, safe(({ billId }) => bills.getById(billId)));

server.registerTool('bills_stages', {
  title: 'Bill stages',
  inputSchema: { billId: z.number().int() },
}, safe(({ billId }) => bills.stages(billId)));

server.registerTool('bills_amendments', {
  title: 'Amendments at a stage',
  inputSchema: {
    billId: z.number().int(),
    stageId: z.number().int(),
    decision: z.string().optional(),
    term: z.string().optional(),
    take: z.number().int().min(1).max(20).optional(),
  },
}, safe(({ billId, stageId, decision, term, take }) =>
  bills.amendments(billId, stageId, { decision, term, take })
));

// -------------- Committees --------------

server.registerTool('committees_search', {
  title: 'Search committees',
  inputSchema: {
    term: z.string().optional(),
    house: z.enum(['Commons', 'Lords', 'Joint']).optional(),
    take: z.number().int().min(1).max(20).optional(),
  },
}, safe((args) => committees.search(args)));

server.registerTool('committees_get', {
  title: 'Get a committee',
  inputSchema: { id: z.number().int() },
}, safe(({ id }) => committees.getById(id)));

server.registerTool('committees_business_search', {
  title: 'Search committee inquiries / business',
  inputSchema: {
    term: z.string().optional(),
    committeeId: z.number().int().optional(),
    take: z.number().int().min(1).max(20).optional(),
  },
}, safe((args) => committees.businessSearch(args)));

server.registerTool('committees_oral_evidence_search', {
  title: 'Search oral evidence',
  inputSchema: {
    committeeBusinessId: z.number().int().optional(),
    witness: z.string().optional(),
    take: z.number().int().min(1).max(20).optional(),
  },
}, safe((args) => committees.oralEvidenceSearch(args)));

// -------------- Hansard --------------

server.registerTool('hansard_last_sitting', {
  title: 'Most recent sitting date',
  inputSchema: { house: z.enum(['Commons', 'Lords']).optional() },
}, safe(({ house }) => hansard.lastSittingDate({ house })));

server.registerTool('hansard_search', {
  title: 'Search Hansard',
  description: 'Search across debates, divisions, contributions etc.',
  inputSchema: {
    term: z.string(),
    from: z.string().optional().describe('YYYY-MM-DD'),
    to: z.string().optional().describe('YYYY-MM-DD'),
    house: z.enum(['Commons', 'Lords']).optional(),
    memberId: z.number().int().optional(),
    take: z.number().int().min(1).max(20).optional(),
  },
}, safe((args) => hansard.search(args)));

server.registerTool('hansard_search_debates', {
  title: 'Search debates',
  inputSchema: {
    term: z.string(),
    from: z.string().optional(),
    to: z.string().optional(),
    house: z.enum(['Commons', 'Lords']).optional(),
    take: z.number().int().min(1).max(20).optional(),
  },
}, safe((args) => hansard.searchDebates(args)));

server.registerTool('hansard_debate', {
  title: 'Full debate text',
  inputSchema: { debateSectionExtId: z.string() },
}, safe(({ debateSectionExtId }) => hansard.debate(debateSectionExtId)));

// -------------- Commons / Lords votes --------------

server.registerTool('commons_votes_search', {
  title: 'Search Commons divisions',
  inputSchema: {
    term: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    memberId: z.number().int().optional(),
    take: z.number().int().min(1).max(25).optional(),
  },
}, safe((args) => commonsVotes.search(args)));

server.registerTool('commons_votes_get', {
  title: 'Get a Commons division',
  inputSchema: { divisionId: z.number().int() },
}, safe(({ divisionId }) => commonsVotes.getById(divisionId)));

server.registerTool('commons_votes_by_party', {
  title: 'Aye/no by party for a division',
  inputSchema: { divisionId: z.number().int() },
}, safe(({ divisionId }) => commonsVotes.groupedByParty(divisionId)));

server.registerTool('lords_votes_search', {
  title: 'Search Lords divisions',
  inputSchema: {
    term: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    take: z.number().int().min(1).max(25).optional(),
  },
}, safe((args) => lordsVotes.search(args)));

server.registerTool('lords_votes_get', {
  title: 'Get a Lords division',
  inputSchema: { divisionId: z.number().int() },
}, safe(({ divisionId }) => lordsVotes.getById(divisionId)));

// -------------- Questions and EDMs --------------

server.registerTool('oral_questions_search', {
  title: 'Search oral questions',
  inputSchema: {
    term: z.string().optional(),
    memberId: z.number().int().optional(),
    bodyId: z.number().int().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    take: z.number().int().min(1).max(25).optional(),
  },
}, safe((args) => oralQuestions.oralQuestions(args)));

server.registerTool('edms_search', {
  title: 'Search Early Day Motions',
  inputSchema: {
    term: z.string().optional(),
    memberId: z.number().int().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    take: z.number().int().min(1).max(25).optional(),
  },
}, safe((args) => oralQuestions.edms(args)));

server.registerTool('wq_search', {
  title: 'Search written questions',
  inputSchema: {
    term: z.string().optional(),
    memberId: z.number().int().optional(),
    house: z.enum(['Commons', 'Lords']).optional(),
    answered: z.enum(['Any', 'Answered', 'Unanswered']).optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    take: z.number().int().min(1).max(20).optional(),
  },
}, safe((args) => wq.searchQuestions(args)));

server.registerTool('wq_get', {
  title: 'Get a written question',
  inputSchema: { id: z.number().int() },
}, safe(({ id }) => wq.getQuestion(id)));

// -------------- Procedure & process --------------

server.registerTool('si_search', {
  title: 'Search statutory instruments',
  inputSchema: {
    term: z.string().optional(),
    procedureId: z.number().int().optional(),
    layingBodyId: z.number().int().optional(),
    take: z.number().int().min(1).max(20).optional(),
  },
}, safe((args) => si.search(args)));

server.registerTool('si_get', {
  title: 'Get a statutory instrument',
  inputSchema: { instrumentId: z.number().int() },
}, safe(({ instrumentId }) => si.getById(instrumentId)));

server.registerTool('si_timeline', {
  title: 'SI procedural timeline',
  inputSchema: { instrumentId: z.number().int() },
}, safe(({ instrumentId }) => si.timeline(instrumentId)));

server.registerTool('treaties_search', {
  title: 'Search treaties laid under CRaG',
  inputSchema: {
    term: z.string().optional(),
    country: z.string().optional(),
    take: z.number().int().min(1).max(20).optional(),
  },
}, safe((args) => treaties.search({ searchText: args.term, ...args })));

server.registerTool('treaties_get', {
  title: 'Get a treaty',
  inputSchema: { id: z.number().int() },
}, safe(({ id }) => treaties.getById(id)));

server.registerTool('interests_search', {
  title: 'Search the Register of Members\' Financial Interests',
  inputSchema: {
    memberId: z.number().int().optional(),
    categoryId: z.number().int().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    take: z.number().int().min(1).max(20).optional(),
  },
}, safe((args) => interests.search(args)));

server.registerTool('em_paragraph', {
  title: 'Erskine May paragraph',
  description: 'Get one paragraph of Erskine May by reference, e.g. "20.5".',
  inputSchema: { reference: z.string() },
}, safe(({ reference }) => em.paragraph(reference)));

server.registerTool('em_search', {
  title: 'Search Erskine May paragraphs',
  inputSchema: { term: z.string() },
}, safe(({ term }) => em.searchParagraphs(term)));

// -------------- Live, petitions, OData, parameterised query --------------

server.registerTool('now_current', {
  title: 'What is on the annunciator now',
  inputSchema: {
    annunciator: z.enum([
      'CommonsMain', 'LordsMain',
      'CommonsCommittee', 'LordsCommittee',
      'CommonsLobby', 'LordsLobby',
    ]).optional(),
  },
}, safe(({ annunciator }) => now.current(annunciator || 'CommonsMain')));

server.registerTool('petitions_search', {
  title: 'Search e-petitions',
  inputSchema: {
    state: z.enum([
      'open', 'closed', 'rejected', 'awaiting_response',
      'with_response', 'awaiting_debate', 'debated', 'not_debated',
    ]).optional(),
    topic: z.string().optional(),
    term: z.string().optional(),
    count: z.number().int().min(1).max(50).optional(),
    page: z.number().int().nonnegative().optional(),
  },
}, safe((args) => petitions.search(args)));

server.registerTool('petitions_get', {
  title: 'Get a petition',
  inputSchema: { id: z.number().int() },
}, safe(({ id }) => petitions.getById(id)));

server.registerTool('odata_get', {
  title: 'OData entity set',
  description: 'Read from the public OData v4 service. See odata_metadata for schemas.',
  inputSchema: {
    set: z.string().describe('Entity set name (case-sensitive).'),
    filter: z.string().optional(),
    select: z.string().optional(),
    expand: z.string().optional(),
    orderby: z.string().optional(),
    top: z.number().int().nonnegative().optional(),
    skip: z.number().int().nonnegative().optional(),
  },
}, safe(({ set, ...opts }) => odata.getSet(set, opts)));

server.registerTool('odata_sets', {
  title: 'OData entity sets',
  description: 'List the available entity sets.',
  inputSchema: {},
}, safe(() => odata.entitySets()));

server.registerTool('pq_postcode', {
  title: 'Postcode → constituency',
  description:
    'Single-call lookup: a UK postcode resolves to its current Westminster constituency, ' +
    'including the current MP\'s name, party and member ID.',
  inputSchema: { postcode: z.string() },
}, safe(({ postcode }) => pq.postcodeLookup(postcode)));

server.registerTool('pq_run', {
  title: 'Run a parameterised query template',
  description:
    'Run any of the 124 named SPARQL templates at api.parliament.uk/query/<template>. ' +
    'Pass parameters as a name/value map. See lib/facilities/parameterised-query.mjs ' +
    'for the canonical list (KNOWN_TEMPLATES).',
  inputSchema: {
    template: z.string(),
    params: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
  },
}, safe(({ template, params }) => pq.run(template, params || {})));

server.registerTool('lda_get', {
  title: 'Legacy linked-data API dataset',
  description:
    'Fetch one page of an Elda dataset (e.g. briefingpapers, researchbriefings, edms, ' +
    'commonsdivisions, thesaurus). The LDA is older but still running, and several ' +
    'datasets are LDA-only.',
  inputSchema: {
    dataset: z.string().describe('e.g. commonsdivisions'),
    pageSize: z.number().int().min(1).max(500).optional(),
    page: z.number().int().nonnegative().optional(),
    sort: z.string().optional().describe('Field name; "-" prefix for descending.'),
  },
}, safe(({ dataset, pageSize, page, sort }) =>
  lda.getDataset(dataset, { pageSize, page, sort })
));

// -------------- Resources (read-only browsable data) --------------

// Surface the cached OpenAPI specs and skill markdown as MCP resources
// so any MCP-aware client can browse them without round-tripping over
// the network. Two resource templates: forgetmenot://spec/<name> and
// forgetmenot://skill/<facility>/<file>.

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const SPECS_DIR = join(REPO_ROOT, '_specs');
const SKILLS_DIR = join(REPO_ROOT, 'skills');

function specFiles() {
  if (!existsSync(SPECS_DIR)) return [];
  return readdirSync(SPECS_DIR)
    .filter((f) => f.endsWith('.json'));
}

function skillFiles() {
  if (!existsSync(SKILLS_DIR)) return [];
  const out = [];
  for (const facility of readdirSync(SKILLS_DIR)) {
    const fdir = join(SKILLS_DIR, facility);
    let s; try { s = statSync(fdir); } catch { continue; }
    if (!s.isDirectory()) continue;
    for (const f of readdirSync(fdir)) {
      if (f.endsWith('.md')) out.push(`${facility}/${f}`);
    }
  }
  return out;
}

// Cached OpenAPI specs.
server.registerResource(
  'spec',
  new ResourceTemplate('forgetmenot://spec/{name}', {
    list: async () => ({
      resources: specFiles().map((name) => ({
        uri: `forgetmenot://spec/${name}`,
        name,
        mimeType: 'application/json',
        description: `Cached OpenAPI spec for ${name.replace(/\.json$/, '')}.`,
      })),
    }),
  }),
  {
    title: 'OpenAPI specs',
    description: 'Cached OpenAPI/Swagger specs for the 13 swagger-described Parliament APIs.',
    mimeType: 'application/json',
  },
  async (uri, { name }) => {
    const path = join(SPECS_DIR, name);
    if (!existsSync(path)) throw new Error(`No such spec: ${name}`);
    return {
      contents: [{
        uri: uri.href,
        mimeType: 'application/json',
        text: readFileSync(path, 'utf8'),
      }],
    };
  }
);

// Skill markdown (SKILL.md + reference.md per facility).
server.registerResource(
  'skill',
  new ResourceTemplate('forgetmenot://skill/{path*}', {
    list: async () => ({
      resources: skillFiles().map((rel) => ({
        uri: `forgetmenot://skill/${rel}`,
        name: rel,
        mimeType: 'text/markdown',
        description: `Skill: ${rel}`,
      })),
    }),
  }),
  {
    title: 'Skill manifests and references',
    description: 'SKILL.md and reference.md for each of the 21 facilities.',
    mimeType: 'text/markdown',
  },
  async (uri, vars) => {
    // path may arrive split across template variables; reassemble.
    const rel = (vars.path || vars['path*'] || '').toString();
    const safe = rel.split('/').filter((p) => p && p !== '..').join('/');
    const path = join(SKILLS_DIR, safe);
    if (!existsSync(path)) throw new Error(`No such skill resource: ${rel}`);
    return {
      contents: [{
        uri: uri.href,
        mimeType: 'text/markdown',
        text: readFileSync(path, 'utf8'),
      }],
    };
  }
);

// -------------- Prompts --------------

server.registerPrompt('explain_bill', {
  title: 'Explain a Bill',
  description: 'Given a bill ID, summarise its purpose, current stage, and recent amendments.',
  argsSchema: { billId: z.string() },
}, ({ billId }) => ({
  messages: [{
    role: 'user',
    content: {
      type: 'text',
      text: `Use the forgetmenot tools to look up Bill ${billId}. Call bills_get, bills_stages, ` +
            `and (for the current stage) bills_amendments. Summarise: purpose, current stage, ` +
            `key amendments at the current stage with their decisions, and what happens next ` +
            `procedurally. Cite the URLs from each tool response.`,
    },
  }],
}));

server.registerPrompt('explain_division', {
  title: 'Explain a Commons division',
  description: 'Given a Commons division ID, explain what was voted on and the partisan breakdown.',
  argsSchema: { divisionId: z.string() },
}, ({ divisionId }) => ({
  messages: [{
    role: 'user',
    content: {
      type: 'text',
      text: `Use commons_votes_get(divisionId=${divisionId}) and ` +
            `commons_votes_by_party(divisionId=${divisionId}). Summarise: the question, the ` +
            `result, the party-by-party breakdown, and any notable rebellions (members voting ` +
            `against the majority of their party). Cite the URLs.`,
    },
  }],
}));

server.registerPrompt('postcode_to_mp', {
  title: 'Postcode → MP profile',
  description: 'Given a UK postcode, return the constituent\'s current MP and a 3-line profile.',
  argsSchema: { postcode: z.string() },
}, ({ postcode }) => ({
  messages: [{
    role: 'user',
    content: {
      type: 'text',
      text: `Call pq_postcode(postcode="${postcode}") to find the constituency and current MP. ` +
            `Then call members_get and members_contributions on that MP. Return: MP name, ` +
            `party, constituency, contribution counts (debates, written questions, EDMs), ` +
            `and notable recent vote(s) via commons_votes member-history. Cite URLs.`,
    },
  }],
}));

// -------------- Run --------------

const transport = new StdioServerTransport();
await server.connect(transport);
// stderr only — stdout is the MCP transport.
process.stderr.write(`forgetmenot MCP server v${VERSION} ready (stdio)\n`);
