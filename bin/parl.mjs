#!/usr/bin/env node
// `parl` — UK Parliament CLI dispatcher.
//
// Usage:
//   parl <facility> <command> [args] [--option value]
//   parl --help
//   parl <facility> --help
//
// JSON to stdout by default. --text for human-readable. --raw to dump
// the raw response body. --version to print version.

import { readFileSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { parseArgs, kebabToCamel, camelizeOpts } from '../lib/argparse.mjs';
import { renderJson, renderSmart } from '../lib/format.mjs';
import { VERSION, HttpError, DEFAULTS } from '../lib/http.mjs';
import * as F from '../lib/facilities/index.mjs';

// Map command-line facility name → facility module.
const FACILITIES = {
  'members':                       F.members,
  'bills':                         F.bills,
  'committees':                    F.committees,
  'hansard':                       F.hansard,
  'commons-votes':                 F.commonsVotes,
  'lords-votes':                   F.lordsVotes,
  'oral-questions':                F.oralQuestions,
  'wq':                            F.writtenQuestions,
  'written-questions':             F.writtenQuestions,
  'si':                            F.statutoryInstruments,
  'statutory-instruments':         F.statutoryInstruments,
  'treaties':                      F.treaties,
  'interests':                     F.interests,
  'em':                            F.erskineMay,
  'erskine-may':                   F.erskineMay,
  'now':                           F.now,
  'petitions':                     F.petitions,
  'sparql':                        F.sparql,
  'odata':                         F.odata,
  'pq':                            F.parameterisedQuery,
  'parameterised-query':           F.parameterisedQuery,
  'lda':                           F.linkedDataApi,
  'linked-data-api':               F.linkedDataApi,
  'hh':                            F.historicHansard,
  'historic-hansard':              F.historicHansard,
  'mnis':                          F.membersDataPlatform,
  'members-data-platform':         F.membersDataPlatform,
  'ddpd':                          F.dataParliamentUkDatasets,
  'data-parliament-uk-datasets':   F.dataParliamentUkDatasets,
  'appg':                          F.appg,
};

// Per-facility command map. Each entry is:
//   commandName: { fn: <facility-module-fn-name>, args: <positional arg names>, help: <short help> }
// The argparse layer converts kebab-case flags to camelCase before passing.
const COMMANDS = {
  'members': {
    'search':           { fn: 'search',                   args: [],          help: 'Search current members. --name --house --postcode --party-id --take' },
    'search-historical':{ fn: 'searchHistorical',         args: [],          help: 'Search historical members. --name --take' },
    'get':              { fn: 'getById',                  args: ['id'],      help: 'Member detail by ID.' },
    'biography':        { fn: 'biography',                args: ['id'],      help: 'Biography.' },
    'contact':          { fn: 'contact',                  args: ['id'],      help: 'Contact details.' },
    'synopsis':         { fn: 'synopsis',                 args: ['id'],      help: 'One-paragraph bio.' },
    'focus':            { fn: 'focus',                    args: ['id'],      help: 'Policy focus.' },
    'experience':       { fn: 'experience',               args: ['id'],      help: 'Pre-Parliament experience.' },
    'staff':            { fn: 'staff',                    args: ['id'],      help: 'Staff list.' },
    'voting':           { fn: 'voting',                   args: ['id'],      help: 'Voting record. --house --page' },
    'wq':               { fn: 'writtenQuestions',         args: ['id'],      help: 'Written questions tabled. --page' },
    'edms':             { fn: 'edms',                     args: ['id'],      help: 'EDMs sponsored/signed. --page' },
    'contributions':    { fn: 'contributionSummary',      args: ['id'],      help: 'Hansard contribution counts.' },
    'interests':        { fn: 'registeredInterests',      args: ['id'],      help: 'Registered interests entries.' },
    'election':         { fn: 'latestElectionResult',     args: ['id'],      help: 'Latest election result.' },
    'portrait-url':     { fn: 'portraitUrl',              args: ['id'],      help: 'Portrait URL.' },
    'thumbnail-url':    { fn: 'thumbnailUrl',             args: ['id'],      help: 'Thumbnail URL.' },
    'constituency-search': { fn: 'constituencySearch',    args: [],          help: '--search-text --take' },
    'constituency':     { fn: 'constituency',             args: ['id'],      help: 'Constituency by ID.' },
    'constituency-geometry': { fn: 'constituencyGeometry', args: ['id'],     help: 'Boundary as GeoJSON-ish.' },
    'constituency-elections':{ fn: 'constituencyElectionResults', args: ['id'], help: 'All election results.' },
    'parties-active':   { fn: 'partiesActive',            args: ['house'],   help: 'Active parties (Commons|Lords).' },
    'parties-state':    { fn: 'partiesState',             args: ['house', 'forDate'], help: 'State of parties (date YYYY-MM-DD).' },
    'lords-by-type':    { fn: 'lordsByType',              args: ['forDate'], help: 'Lords by peerage type for a date.' },
    'gov-posts':        { fn: 'governmentPosts',          args: [],          help: 'Government posts.' },
    'opp-posts':        { fn: 'oppositionPosts',          args: [],          help: 'Opposition posts.' },
    'speakers':         { fn: 'speakerAndDeputies',       args: ['forDate'], help: 'Speaker and deputies on a date.' },
    'spokespersons':    { fn: 'spokespersons',            args: [],          help: 'Lords spokespersons.' },
    'departments':      { fn: 'referenceDepartments',     args: [],          help: 'Departments reference list.' },
    'answering-bodies': { fn: 'referenceAnsweringBodies', args: [],          help: 'Answering bodies.' },
    'policy-interests': { fn: 'referencePolicyInterests', args: [],          help: 'Policy interests reference taxonomy.' },
  },
  'bills': {
    'search':           { fn: 'search',                args: [],            help: 'Search bills. --term --house --session --member-id --is-act' },
    'get':              { fn: 'getById',               args: ['billId'],    help: 'Bill detail.' },
    'news':             { fn: 'newsArticles',          args: ['billId'],    help: 'News articles.' },
    'stages':           { fn: 'stages',                args: ['billId'],    help: 'Stages.' },
    'stage':            { fn: 'stage',                 args: ['billId', 'stageId'], help: 'One stage.' },
    'amendments':       { fn: 'amendments',            args: ['billId', 'stageId'], help: 'Amendments. --decision --term' },
    'amendment':        { fn: 'amendment',             args: ['billId', 'stageId', 'amendmentId'], help: 'One amendment.' },
    'pingpong':         { fn: 'pingPongItems',         args: ['billId', 'stageId'], help: 'Ping-pong items.' },
    'publications':     { fn: 'publications',          args: ['billId'],    help: 'Publications.' },
    'rss':              { fn: 'rss',                   args: ['kind'],      help: 'RSS feed (all|public|private). Pass --bill-id for one Bill.' },
    'types':            { fn: 'billTypes',             args: [],            help: 'Bill types.' },
    'stage-types':      { fn: 'stageTypes',            args: [],            help: 'Stage types.' },
    'publication-types':{ fn: 'publicationTypes',     args: [],            help: 'Publication types.' },
    'sittings':         { fn: 'sittings',              args: [],            help: 'Sittings.' },
  },
  'committees': {
    'search':           { fn: 'search',                args: [],            help: 'Search committees. --term --house' },
    'get':              { fn: 'getById',               args: ['id'],        help: 'Committee detail.' },
    'next-event':       { fn: 'nextEvent',             args: [],            help: 'Next scheduled events per committee.' },
    'members':          { fn: 'members',               args: ['id'],        help: 'Committee members. --current' },
    'staff':            { fn: 'staff',                 args: ['id'],        help: 'Committee staff.' },
    'events':           { fn: 'events',                args: ['id'],        help: 'Committee events.' },
    'publications':     { fn: 'publications',          args: ['id'],        help: 'Publication groups.' },
    'business-search':  { fn: 'businessSearch',        args: [],            help: 'Search inquiries. --term --committee-id' },
    'business':         { fn: 'business',              args: ['id'],        help: 'One inquiry.' },
    'business-publications': { fn: 'businessPublications', args: ['id'],    help: 'Inquiry publications.' },
    'oral-evidence-search':  { fn: 'oralEvidenceSearch',args: [],           help: 'Search oral evidence. --committee-business-id --witness' },
    'oral-evidence':    { fn: 'oralEvidence',          args: ['id'],        help: 'One oral evidence record.' },
    'written-evidence-search':{ fn: 'writtenEvidenceSearch', args: [],      help: 'Search written evidence.' },
    'written-evidence': { fn: 'writtenEvidence',       args: ['id'],        help: 'One written evidence record.' },
    'meetings':         { fn: 'broadcastMeetings',     args: [],            help: 'Meetings between dates. --from --to' },
    'business-types':   { fn: 'committeeBusinessTypes',args: [],            help: 'Business type reference.' },
    'committee-types':  { fn: 'committeeTypes',        args: [],            help: 'Committee type reference.' },
  },
  'hansard': {
    'last-sitting':     { fn: 'lastSittingDate',       args: [],            help: '--house Commons|Lords' },
    'first-year':       { fn: 'firstYear',             args: [],            help: 'Earliest year covered.' },
    'calendar':         { fn: 'calendar',              args: [],            help: '--house --year --month' },
    'sections-for-day': { fn: 'sectionsForDay',        args: [],            help: '--house --date' },
    'section-trees':    { fn: 'sectionTrees',          args: [],            help: '--house --date --section' },
    'pdfs-for-day':     { fn: 'pdfsForDay',            args: [],            help: '--house --date' },
    'speakers-for-day': { fn: 'speakersListForDay',    args: ['date', 'house'], help: 'Speakers list.' },
    'debate':           { fn: 'debate',                args: ['extId'],     help: 'Debate text.' },
    'division':         { fn: 'division',              args: ['extId'],     help: 'Division detail.' },
    'divisions-in':     { fn: 'divisionsIn',           args: ['extId'],     help: 'Divisions in a debate section.' },
    'speakers-in':      { fn: 'speakersIn',            args: ['extId'],     help: 'Speakers in a debate section.' },
    'member-contributions': { fn: 'memberContributions', args: ['memberId'], help: 'Per-member debate contributions.' },
    'top-level':        { fn: 'topLevelDebateByTitle', args: [],            help: '--house --date --title' },
    'search':           { fn: 'search',                args: [],            help: 'Generic search. --term --from --to --house' },
    'search-debates':   { fn: 'searchDebates',         args: [],            help: '' },
    'search-divisions': { fn: 'searchDivisions',       args: [],            help: '' },
    'search-petitions': { fn: 'searchPetitions',       args: [],            help: '' },
    'search-members':   { fn: 'searchMembers',         args: [],            help: '' },
    'search-committees':{ fn: 'searchCommittees',      args: [],            help: '' },
    'search-contributions':{ fn: 'searchContributions', args: ['type'],     help: 'type=Spoken|Written. --term --from --to' },
    'member-summary':   { fn: 'memberContributionSummary', args: ['memberId'], help: 'Contribution summary by member.' },
    'debate-by-column': { fn: 'debateByColumn',        args: [],            help: '--house --volume --column' },
    'timeline-stats':   { fn: 'timelineStats',         args: [],            help: '--contribution-type --from --to' },
  },
  'commons-votes': {
    'get':              { fn: 'getById',               args: ['divisionId'], help: 'Division detail.' },
    'search':           { fn: 'search',                args: [],            help: 'Search divisions. --from --to --member-id --take' },
    'count':            { fn: 'searchTotalResults',    args: [],            help: 'Just the count.' },
    'by-party':         { fn: 'groupedByParty',        args: ['divisionId'], help: 'Aye/no by party.' },
    'member':           { fn: 'memberVoting',          args: ['memberId'],  help: 'A member\'s voting record.' },
  },
  'lords-votes': {
    'get':              { fn: 'getById',               args: ['divisionId'], help: 'Division detail.' },
    'search':           { fn: 'search',                args: [],            help: '' },
    'count':            { fn: 'searchTotalResults',    args: [],            help: '' },
    'by-party':         { fn: 'groupedByParty',        args: ['divisionId'], help: '' },
    'member':           { fn: 'memberVoting',          args: ['memberId'],  help: '' },
  },
  'oral-questions': {
    'questions':        { fn: 'oralQuestions',         args: [],            help: '--from --to --member-id --body-id --term' },
    'slots':            { fn: 'oralQuestionTimes',     args: [],            help: '--from --to' },
    'edms':             { fn: 'edms',                  args: [],            help: '--term --member-id --from --to' },
    'edm':              { fn: 'edm',                   args: ['id'],        help: 'One EDM.' },
  },
  'wq': {
    'search':           { fn: 'searchQuestions',       args: [],            help: '--term --member-id --body-id --house --from --to --answered' },
    'get':              { fn: 'getQuestion',           args: ['id'],        help: 'Question by ID.' },
    'by-uin':           { fn: 'getQuestionByUin',      args: ['date', 'uin'], help: 'Question by date+UIN.' },
    'statements':       { fn: 'searchStatements',      args: [],            help: '--term --from --to' },
    'statement':        { fn: 'getStatement',          args: ['id'],        help: 'Statement by ID.' },
    'statement-by-uin': { fn: 'getStatementByUin',     args: ['date', 'uin'], help: '' },
    'reports':          { fn: 'dailyReports',          args: [],            help: 'Daily report dates. --from --to' },
  },
  'si': {
    'search':           { fn: 'search',                args: [],            help: '--term --procedure-id --laying-body-id' },
    'get':              { fn: 'getById',               args: ['instrumentId'], help: 'SI detail.' },
    'timeline':         { fn: 'timeline',              args: ['instrumentId'], help: 'Business items timeline.' },
    'timeline-by-id':   { fn: 'timelineById',          args: ['timelineId'], help: 'Timeline by ID.' },
    'acts':             { fn: 'actsSearch',            args: [],            help: '--term --year --chapter' },
    'act':              { fn: 'act',                   args: ['id'],        help: 'One Act.' },
    'laying-bodies':    { fn: 'layingBodies',          args: [],            help: '' },
    'procedures':       { fn: 'procedures',            args: [],            help: '' },
    'procedure':        { fn: 'procedure',             args: ['id'],        help: 'One procedure.' },
  },
  'treaties': {
    'search':           { fn: 'search',                args: [],            help: '--search-text --country --type-id' },
    'get':              { fn: 'getById',               args: ['id'],        help: 'Treaty detail.' },
    'timeline':         { fn: 'timeline',              args: ['id'],        help: 'Business items.' },
    'business-item':    { fn: 'businessItem',          args: ['id'],        help: 'One business item.' },
    'orgs':             { fn: 'governmentOrganisations', args: [],          help: '' },
    'series':           { fn: 'seriesMembership',      args: [],            help: '' },
  },
  'interests': {
    'search':           { fn: 'search',                args: [],            help: '--member-id --category-id --from --to' },
    'get':              { fn: 'getById',               args: ['id'],        help: 'Interest entry by ID.' },
    'categories':       { fn: 'categories',            args: [],            help: '' },
    'category':         { fn: 'category',              args: ['id'],        help: 'One category.' },
    'registers':        { fn: 'registers',             args: [],            help: '' },
    'register':         { fn: 'register',              args: ['id'],        help: 'One register snapshot.' },
  },
  'em': {
    'parts':            { fn: 'parts',                 args: [],            help: 'Parts of Erskine May.' },
    'part':             { fn: 'part',                  args: ['partNumber'], help: 'One Part.' },
    'chapter':          { fn: 'chapter',               args: ['chapterNumber'], help: 'One Chapter.' },
    'section':          { fn: 'section',               args: ['sectionId'], help: 'One Section.' },
    'paragraph':        { fn: 'paragraph',             args: ['reference'], help: 'Paragraph by reference (e.g. 20.5).' },
    'search':           { fn: 'searchParagraphs',      args: ['term'],      help: 'Search paragraphs.' },
    'search-sections':  { fn: 'searchSections',        args: ['term'],      help: 'Search sections.' },
    'index':            { fn: 'indexBrowse',           args: [],            help: 'Browse index. --start-letter A' },
    'index-term':       { fn: 'indexTerm',             args: ['indexTermId'], help: 'One index entry.' },
    'index-search':     { fn: 'searchIndex',           args: ['term'],      help: 'Search the index.' },
  },
  'now': {
    'current':          { fn: 'current',               args: ['annunciator'], help: 'CommonsMain | LordsMain | …' },
    'since':            { fn: 'since',                 args: ['annunciator', 'date'], help: 'Latest message since ISO date.' },
  },
  'petitions': {
    'search':           { fn: 'search',                args: [],            help: '--state open|closed|… --topic --term --count --page' },
    'get':              { fn: 'getById',               args: ['id'],        help: 'Petition detail.' },
    'archive':          { fn: 'archive',               args: [],            help: 'Archived petitions.' },
    'archive-get':      { fn: 'archiveGet',            args: ['id'],        help: '' },
  },
  'sparql': {
    'query':            { fn: 'query',                 args: ['sparql'],    help: 'Run a SPARQL query string. --format json|csv|tsv|turtle.' },
    'classes':          { fn: 'listClasses',           args: [],            help: 'List instance classes by frequency.' },
    'predicates':       { fn: 'predicatesOf',          args: ['classUri'],  help: 'Predicates used on a class.' },
    'rdfs-classes':     { fn: 'rdfsClasses',           args: [],            help: 'rdfs:Class / owl:Class with labels.' },
    'hierarchy':        { fn: 'classHierarchy',        args: [],            help: 'subClassOf graph.' },
    'skos-schemes':     { fn: 'skosSchemes',           args: [],            help: 'SKOS concept schemes.' },
    'describe':         { fn: 'describe',              args: ['uri'],       help: 'DESCRIBE a resource.' },
  },
  'odata': {
    'sets':             { fn: 'entitySets',            args: [],            help: 'List entity sets.' },
    'metadata':         { fn: 'metadata',              args: [],            help: '$metadata XML.' },
    'get':              { fn: 'getSet',                args: ['set'],       help: '--filter --select --expand --top --skip --orderby' },
    'entity':           { fn: 'getEntity',             args: ['set', 'key'], help: 'Single entity by key.' },
    'count':            { fn: 'count',                 args: ['set'],       help: 'Count of a set.' },
  },
  'pq': {
    'list':             { fn: 'listTemplates',         args: [],            help: 'HTML root with templates.' },
    'run':              { fn: 'run',                   args: ['template'],  help: 'Run a template. --key=value pairs supplied as --opt-name value.' },
    'postcode':         { fn: 'postcodeLookup',        args: ['postcode'],  help: 'Postcode → constituency.' },
    'person':           { fn: 'personById',            args: ['personId'],  help: '' },
    'person-by-mnis':   { fn: 'personByMnisId',        args: ['mnisId'],    help: '' },
    'mps':              { fn: 'currentMps',            args: [],            help: 'Current MPs.' },
  },
  'lda': {
    'datasets':         { fn: 'listDatasets',          args: [],            help: 'Known dataset slugs.' },
    'get':              { fn: 'getDataset',            args: ['dataset'],   help: '--page-size --page --sort -date' },
    'meta':             { fn: 'getDatasetMeta',        args: ['dataset'],   help: 'Dataset metadata definition.' },
  },
  'hh': {
    'sitting-url':      { fn: 'sittingUrl',            args: ['year', 'month', 'day'], help: 'URL only.' },
    'house-sitting-url':{ fn: 'houseSittingUrl',       args: ['house', 'year', 'month', 'day'], help: '' },
    'person-url':       { fn: 'personUrl',             args: ['slug'],      help: '' },
    'fetch':            { fn: 'fetchHtml',             args: ['relativePath'], help: 'Fetch HTML for a relative path.' },
  },
  'mnis': {
    'members':          { fn: 'membersQuery',          args: [],            help: '--house --eligible --expansions ...' },
    'member':           { fn: 'memberById',            args: ['memberId'],  help: '' },
    'parties-active':   { fn: 'partiesActive',         args: ['house'],     help: '' },
    'parties-state':    { fn: 'partiesState',          args: ['house', 'date'], help: '' },
    'postcode':         { fn: 'membersByPostcode',     args: ['postcode'],  help: '' },
    'parties-ref':      { fn: 'referenceParties',      args: [],            help: '' },
    'houses-ref':       { fn: 'referenceHouses',       args: [],            help: '' },
    'policy-interests': { fn: 'referencePolicyInterests', args: [],         help: '' },
  },
  'ddpd': {
    'list':             { fn: 'listDatasets',          args: [],            help: 'Portal dataset names.' },
    'map':              { fn: 'mapDataset',            args: ['name'],      help: 'Name → LDA + modern API.' },
  },
  'appg': {
    'editions':         { fn: 'listEditions',          args: [],            help: 'List published Register editions for a year. --year YYYY (default: current).' },
    'list':             { fn: 'listGroups',            args: [],            help: 'List every APPG in the edition. --edition YYMMDD' },
    'get':              { fn: 'getGroup',              args: ['slug'],      help: 'One group: title, purpose, officers, contact, AGM, benefits. --edition YYMMDD' },
    'crawl':            { fn: 'crawl',                 args: [],            help: 'Crawl every group page. --edition --limit N --delay-ms 250' },
    'pdf-url':          { fn: 'pdfUrlCmd',             args: [],            help: 'URL of the consolidated PDF for an edition. --edition YYMMDD' },
    'contents-url':     { fn: 'contentsUrlCmd',        args: [],            help: 'URL of contents.htm for an edition. --edition YYMMDD' },
  },
};

// ---------- main ----------

const argv = process.argv.slice(2);
const parsed = parseArgs(argv);
const opts = parsed.opts;

if (opts.version || opts.v) { console.log(VERSION); process.exit(0); }

// Special-case for the mnis members command which takes a structured filter.
function adaptMnisMembers(positional, opts) {
  const filter = {};
  if (opts.house !== undefined) filter.House = opts.house;
  if (opts.eligible !== undefined) filter.IsEligible = opts.eligible === false ? 'false' : 'true';
  const expansions = opts.expansions ? String(opts.expansions).split(',') : [];
  return [filter, expansions, opts];
}

if (parsed._.length === 0 || opts.help || opts.h) {
  printRootHelp();
  process.exit(parsed._.length === 0 && !opts.help && !opts.h ? 64 : 0);
}

const facilityName = parsed._[0];
const facility = FACILITIES[facilityName];
if (!facility) {
  console.error(`Unknown facility: ${facilityName}`);
  console.error(`Run 'parl --help' for the list.`);
  process.exit(64);
}

if (parsed._.length === 1 || (parsed._.length === 1 && (opts.help || opts.h))) {
  printFacilityHelp(facilityName);
  process.exit(0);
}

const commandName = parsed._[1];
const cmd = COMMANDS[facilityName]?.[commandName];
if (!cmd) {
  console.error(`Unknown command for ${facilityName}: ${commandName}`);
  printFacilityHelp(facilityName);
  process.exit(64);
}

if (opts.help || opts.h) {
  console.log(`parl ${facilityName} ${commandName} ${cmd.args.map(a => `<${a}>`).join(' ')}`);
  console.log(cmd.help || '(no help)');
  process.exit(0);
}

const positional = parsed._.slice(2);
if (positional.length < cmd.args.length) {
  console.error(`Missing positional argument(s) for ${facilityName} ${commandName}: needs ${cmd.args.join(', ')}`);
  process.exit(64);
}

const fn = facility[cmd.fn];
if (typeof fn !== 'function') {
  console.error(`Internal: command ${facilityName} ${commandName} maps to missing function ${cmd.fn}.`);
  process.exit(70);
}

// Build call arguments: positional first, then opts (camelCased), then ctx.
const callOpts = camelizeOpts(opts);
const ctx = {
  userAgent: callOpts.userAgent,
  timeoutMs: callOpts.timeout ? Number(callOpts.timeout) * 1000 : undefined,
};

let argList;
if (facilityName === 'mnis' && commandName === 'members') {
  // Special-case: MNIS members query needs (filter, expansions, opts).
  const [filter, expansions, optz] = adaptMnisMembers(positional, callOpts);
  argList = [filter, expansions, { format: optz.format ?? 'json' }, ctx];
} else if (cmd.args.length === 0) {
  argList = [callOpts, ctx];
} else if (cmd.args.length === 1 && positional.length === 1) {
  // Single-positional functions usually have signature (id, [opts], ctx).
  // Some take (id, ctx) only — passing extra opts is harmless because
  // they ignore unknown keys.
  argList = [positional[0], callOpts, ctx];
} else {
  // Multi-positional: pass positionals then opts and ctx.
  argList = [...positional, callOpts, ctx];
}

(async () => {
  try {
    const result = await fn(...argList);
    if (opts.raw) {
      // Dump exactly what came back.
      if (result instanceof Uint8Array) {
        if (opts.out) {
          writeFileSync(opts.out, result);
          console.error(`wrote ${opts.out} (${result.length} bytes)`);
        } else {
          process.stdout.write(Buffer.from(result));
        }
      } else if (typeof result === 'string') {
        process.stdout.write(result);
      } else {
        process.stdout.write(renderJson(result));
        process.stdout.write('\n');
      }
      return;
    }
    if (result instanceof Uint8Array) {
      if (opts.out) {
        writeFileSync(opts.out, result);
        console.error(`wrote ${opts.out} (${result.length} bytes)`);
      } else {
        process.stderr.write(`(binary, ${result.length} bytes — pass --out path to save)\n`);
      }
      return;
    }
    if (opts.text) {
      console.log(renderSmart(result));
    } else {
      console.log(renderJson(result));
    }
  } catch (err) {
    if (err instanceof HttpError) {
      console.error(JSON.stringify({
        error: { type: 'HttpError', status: err.status, url: err.url, body: err.body },
      }, null, 2));
      process.exit(1);
    }
    console.error(JSON.stringify({
      error: { type: err.name || 'Error', message: err.message },
    }, null, 2));
    process.exit(2);
  }
})();

function printRootHelp() {
  console.log(`parl ${VERSION} — UK Parliament CLI

Usage:
  parl <facility> <command> [args] [--option value]

Facilities (canonical names; aliases in parens):
  members
  bills
  committees
  hansard
  commons-votes
  lords-votes
  oral-questions
  written-questions  (alias: wq)
  statutory-instruments  (alias: si)
  treaties
  interests
  erskine-may  (alias: em)
  now
  petitions
  sparql
  odata
  parameterised-query  (alias: pq)
  linked-data-api  (alias: lda)
  historic-hansard  (alias: hh)
  members-data-platform  (alias: mnis)
  data-parliament-uk-datasets  (alias: ddpd)
  appg                         (All-Party Parliamentary Groups, scraped HTML)

Run 'parl <facility>' to list its commands.
Run 'parl <facility> <command> --help' for command help.

Global options:
  --json (default) | --text | --raw
  --user-agent <s>
  --timeout <seconds>
  --version | -v
  --help | -h

Skill / docs / specs live alongside this CLI in skills/<facility>/
and _specs/.`);
}

function printFacilityHelp(name) {
  const cmds = COMMANDS[name] || {};
  console.log(`parl ${name} <command> [args] [--option value]`);
  console.log('');
  console.log('Commands:');
  for (const [cname, c] of Object.entries(cmds)) {
    const args = (c.args || []).map(a => `<${a}>`).join(' ');
    const head = `  ${cname} ${args}`.padEnd(45);
    console.log(`${head} ${c.help || ''}`);
  }
}
