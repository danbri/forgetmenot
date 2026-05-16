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

import { readFileSync, writeFileSync, mkdirSync, readdirSync, appendFileSync } from 'node:fs';
import { resolve as pathResolve } from 'node:path';
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
    'urls':             { fn: 'urlsFor',                  args: ['id'],      help: 'Member contact URLs (websites, social, emails, phones, offices).' },
    'crawl':            { fn: '__crawlMembers__',         args: [],          help: 'Stash every member to disk keyed by ID. --out dir [--house Commons|Lords|both] [--include-historical] [--delay-ms 100] [--max N]' },
    'crawl-sites':      { fn: '__crawlSites__',           args: [],          help: 'Polite per-MP-website crawl. --in members-dir --out sites-dir [--max N] [--concurrency 4] [--ids 4514,172] [--refetch]' },
    'news':             { fn: '__membersNews__',          args: [],          help: 'Parse RSS/Atom feeds stored under sites-dir into a per-MP JSONL of posts. --in sites-dir --out news-dir [--ids ...]' },
  },
  'bills': {
    'search':           { fn: 'search',                args: [],            help: 'Search bills. --term --current-house --originating-house --session --member-id --department-id --bill-type --bill-stage --is-defeated --is-withdrawn --is-in-amendable-stage. (API has no isAct/department filter; use --bill-stage to scope.)' },
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
    'business-search':  { fn: 'businessSearch',        args: [],            help: 'Search inquiries. --term --committee-id --from --to --business-type-id --status --currently-accepting-petitions --currently-accepting-evidence' },
    'business':         { fn: 'business',              args: ['id'],        help: 'One inquiry.' },
    'business-publications': { fn: 'businessPublications', args: ['id'],    help: 'Inquiry publications.' },
    'oral-evidence-search':  { fn: 'oralEvidenceSearch',args: [],           help: 'Search oral evidence. --committee-business-id --committee-id --term --from --to' },
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
    'debate-by-column': { fn: 'debateByColumn',        args: [],            help: '--house --volume-number --column-number' },
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
    'search':           { fn: 'search',                args: [],            help: '--name --procedure --laying-body-id --department-id --house Commons|Lords|Both --scheduled-debate --motion-to-stop --concerns-raised-by-committee --parliamentary-process-concluded --recommended-for-procedure-change --act-of-parliament-id --skip --take. API has no date filter; slice client-side.' },
    'get':              { fn: 'getById',               args: ['instrumentId'], help: 'SI detail.' },
    'timeline':         { fn: 'timeline',              args: ['instrumentId'], help: 'Business items timeline.' },
    'timeline-by-id':   { fn: 'timelineById',          args: ['timelineId'], help: 'Timeline by ID.' },
    'acts':             { fn: 'actsSearch',            args: [],            help: '--name (min 3 chars) --id (repeatable). API has no year/chapter filter.' },
    'act':              { fn: 'act',                   args: ['id'],        help: 'One Act.' },
    'laying-bodies':    { fn: 'layingBodies',          args: [],            help: '' },
    'procedures':       { fn: 'procedures',            args: [],            help: '' },
    'procedure':        { fn: 'procedure',             args: ['id'],        help: 'One procedure.' },
  },
  'treaties': {
    'search':           { fn: 'search',                args: [],            help: '--search-text --government-organisation-id --series --parliamentary-process --debate-scheduled --motions-tabled-about-a-treaty --committee-raised-concerns --house. API has no date filter; slice client-side on layingDate.' },
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
    'resolve':          { fn: '__appgResolve__',      args: [],            help: 'Crawl + resolve every APPG officer to a Members API id. --edition --out dir [--wikidata]' },
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

// Special-case commands that don't map to a single facility function
// run before the generic function-lookup path. They handle their own
// I/O (stdout/stderr/disk) and return a non-renderable result.
const SPECIAL_CASE =
  (facilityName === 'members' && commandName === 'crawl') ||
  (facilityName === 'members' && commandName === 'crawl-sites') ||
  (facilityName === 'members' && commandName === 'news') ||
  (facilityName === 'appg' && commandName === 'resolve');

const fn = SPECIAL_CASE ? null : facility[cmd.fn];
if (!SPECIAL_CASE && typeof fn !== 'function') {
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
    if (SPECIAL_CASE) {
      if (commandName === 'crawl') await runMembersCrawl(callOpts, ctx);
      else if (commandName === 'crawl-sites') await runMembersCrawlSites(callOpts, ctx);
      else if (commandName === 'news') await runMembersNews(callOpts, ctx);
      else if (commandName === 'resolve') await runAppgResolve(callOpts, ctx);
      return;
    }
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

// `parl members crawl` — paginate every member, fetch each one's
// /Contact endpoint, and write per-ID JSON files to <out>/<id>.json
// plus a single <out>/index.json manifest. Includes id, name, party,
// constituency, house and url buckets (websites, social, emails,
// phones, offices). Throttled. Resumable: existing files are skipped
// unless --refetch is passed.
async function runMembersCrawl(callOpts, ctx) {
  const out = callOpts.out;
  if (!out) {
    console.error('--out <dir> is required.');
    process.exit(64);
  }
  const outDir = pathResolve(out);
  mkdirSync(outDir, { recursive: true });

  const houseOpt = (callOpts.house || 'both').toLowerCase();
  const houses = houseOpt === 'both'
    ? ['Commons', 'Lords']
    : [houseOpt[0].toUpperCase() + houseOpt.slice(1)];
  const includeHistorical = !!callOpts.includeHistorical;
  const delayMs = Number(callOpts.delayMs ?? 100);
  const max = callOpts.max ? Number(callOpts.max) : Infinity;
  const refetch = !!callOpts.refetch;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const M = F.members;

  const index = [];
  let written = 0;
  let skipped = 0;
  const errors = [];

  for (const house of houses) {
    const baseQuery = { house, isCurrentMember: includeHistorical ? undefined : true, max };
    let n = 0;
    process.stderr.write(`Crawling ${house}…\n`);
    for await (const hit of M.iterMembers(baseQuery, ctx)) {
      const summary = M.summariseHit(hit);
      const filePath = `${outDir}/${summary.id}.json`;
      let record;
      if (!refetch) {
        try {
          record = JSON.parse(readFileSync(filePath, 'utf8'));
          skipped++;
        } catch { /* not present, fetch */ }
      }
      if (!record) {
        try {
          const urls = await M.urlsFor(summary.id, {}, ctx);
          record = {
            ...summary,
            social: urls.social,
            websites: urls.websites,
            emails: urls.emails,
            phones: urls.phones,
            offices: urls.offices,
            fetchedAt: new Date().toISOString(),
          };
          writeFileSync(filePath, JSON.stringify(record, null, 2) + '\n');
          written++;
          if (delayMs) await sleep(delayMs);
        } catch (e) {
          errors.push({ id: summary.id, name: summary.name, message: e.message, status: e.status });
          process.stderr.write(`  ! ${summary.id} ${summary.name}: ${e.message}\n`);
          continue;
        }
      }
      index.push({
        id: record.id,
        name: record.name,
        party: record.party,
        partyAbbr: record.partyAbbr,
        house: record.house,
        constituency: record.constituency,
        urlCount: (record.websites?.length || 0) + (record.social?.length || 0),
      });
      n++;
      if (n % 25 === 0) process.stderr.write(`  ${house}: ${n} members\n`);
    }
    process.stderr.write(`  ${house}: ${n} members done\n`);
  }

  // Sort index by ID for deterministic output.
  index.sort((a, b) => a.id - b.id);
  const manifest = {
    out: outDir,
    fetchedAt: new Date().toISOString(),
    houses,
    includeHistorical,
    count: index.length,
    written,
    skipped,
    errors,
    members: index,
  };
  writeFileSync(`${outDir}/index.json`, JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({
    out: outDir,
    count: index.length,
    written,
    skipped,
    errors: errors.length,
  }, null, 2));
}

// `parl members crawl-sites` — for every member with a personal
// website (per the previous `members crawl` snapshot), run the
// site-respecting crawler in lib/facilities/sites.mjs and write
// results to disk under <out>/<id>/.
//
// Layout per site:
//   <out>/<id>/manifest.json   — decisions, log, platform, social,
//                                feeds metadata, page list (no raw)
//   <out>/<id>/homepage.html   — raw homepage body
//   <out>/<id>/homepage.json   — extracted homepage record
//   <out>/<id>/sitemap.xml     — raw if found
//   <out>/<id>/robots.txt      — raw if found
//   <out>/<id>/feeds/<n>.xml   — raw feed bodies
//   <out>/<id>/pages/<type>.html  — raw of each followed page
//   <out>/<id>/pages/<type>.json  — extracted record
//
// Each typed page lives at a stable filename (the type key), so
// reruns overwrite cleanly. The crawler is resumable: existing
// manifest.json files are skipped unless --refetch.
async function runMembersCrawlSites(callOpts, ctx) {
  const inDir = pathResolve(callOpts.in || 'third_party/data/members');
  if (!callOpts.out) {
    console.error('--out <dir> is required.');
    process.exit(64);
  }
  const outDir = pathResolve(callOpts.out);
  mkdirSync(outDir, { recursive: true });

  // Filters
  const onlyIds = callOpts.ids
    ? new Set(String(callOpts.ids).split(',').map((s) => Number(s.trim())))
    : null;
  const max = callOpts.max ? Number(callOpts.max) : Infinity;
  const concurrency = Math.max(1, Number(callOpts.concurrency) || 4);
  const refetch = !!callOpts.refetch;

  // Load every per-member record that has at least one website.
  const memberFiles = readdirSync(inDir).filter((f) => /^\d+\.json$/.test(f));
  const targets = [];
  for (const f of memberFiles) {
    const rec = JSON.parse(readFileSync(`${inDir}/${f}`, 'utf8'));
    if (!rec.websites || rec.websites.length === 0) continue;
    if (onlyIds && !onlyIds.has(rec.id)) continue;
    targets.push({ member: slimMember(rec), website: rec.websites[0].url });
    if (targets.length >= max) break;
  }
  process.stderr.write(`Targets: ${targets.length} sites; concurrency ${concurrency}\n`);

  const Sites = F.sites;
  const pacer = Sites.newOriginPacer();      // shared across workers

  let done = 0, ok = 0, failed = 0, skipped = 0;
  const results = [];

  // Tiny worker pool. Each worker pulls the next target from a
  // shared queue and runs crawlSite. Per-origin pacing is enforced
  // inside the crawler regardless of worker count.
  const queue = targets.slice();
  async function worker(workerId) {
    while (queue.length) {
      const t = queue.shift();
      if (!t) break;
      const siteDir = `${outDir}/${t.member.id}`;
      if (!refetch) {
        try {
          const m = JSON.parse(readFileSync(`${siteDir}/manifest.json`, 'utf8'));
          if (m && m.startedAt) { skipped++; done++; continue; }
        } catch { /* not present, crawl */ }
      }
      try {
        // Archival sink: every HTTP transaction inside this site's
        // crawl is appended to <site>/archive.jsonl. Each line is a
        // self-contained record with timestamps, headers, hashes,
        // and provenance — see lib/archival.mjs for the schema.
        // We write the JSONL FILE relative to siteDir; the caller
        // doesn't know about the file appender, only the sink fn.
        mkdirSync(siteDir, { recursive: true });
        const archivePath = `${siteDir}/archive.jsonl`;
        const A = await import('../lib/archival.mjs');
        const archiveCtx = {
          ...ctx,
          archive: {
            sink: (rec) => {
              try {
                appendFileSync(archivePath, A.recordToJsonLine(rec));
              } catch { /* swallow — archival never blocks the crawl */ }
            },
            extra: { member_id: t.member.id, member_name: t.member.name },
          },
        };
        const r = await Sites.crawlSite(t.member, t.website, { pacer }, archiveCtx);
        await writeSiteResult(siteDir, r);
        if (r.ok) ok++; else failed++;
        results.push({ id: t.member.id, name: t.member.name, ok: r.ok, pages: r.pages?.length || 0 });
      } catch (e) {
        failed++;
        results.push({ id: t.member.id, name: t.member.name, ok: false, error: e.message });
      }
      done++;
      if (done % 10 === 0) {
        process.stderr.write(
          `  progress: ${done}/${targets.length} (ok=${ok} fail=${failed} skip=${skipped})\n`,
        );
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, (_, i) => worker(i)));

  // Top-level index summarising the run.
  const indexPath = `${outDir}/index.json`;
  let prior = { results: [] };
  try { prior = JSON.parse(readFileSync(indexPath, 'utf8')); } catch { /* none */ }
  // Merge new results into prior (last-write-wins by id).
  const merged = new Map();
  for (const r of prior.results || []) merged.set(r.id, r);
  for (const r of results) merged.set(r.id, r);
  const manifest = {
    fetchedAt: new Date().toISOString(),
    out: outDir,
    in: inDir,
    targets: targets.length,
    ok, failed, skipped,
    results: [...merged.values()].sort((a, b) => a.id - b.id),
  };
  writeFileSync(indexPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({ out: outDir, targets: targets.length, ok, failed, skipped }, null, 2));
}

// Slim down a member record (we don't need all of it inside every
// site manifest — just enough to identify the MP).
function slimMember(rec) {
  return {
    id: rec.id, name: rec.name, party: rec.party, partyAbbr: rec.partyAbbr,
    house: rec.house, constituency: rec.constituency,
  };
}

// Persist one crawlSite() result to disk. Splits the result into
// the layout documented above so that:
//   - raw bodies are reviewable file-by-file
//   - the manifest stays small and JSON-readable
async function writeSiteResult(siteDir, r) {
  mkdirSync(siteDir, { recursive: true });
  // Strip raw bodies into separate files; JSON keeps just metadata.
  const slim = (p) => {
    const { raw_html, ...rest } = p;
    return { ...rest, raw_html_file: raw_html ? `pages/${p.type}.html` : null };
  };

  // Manifest (metadata + per-link decisions)
  const manifest = {
    member: r.member,
    homepageUrl: r.homepageUrl,
    origin: r.origin,
    ok: r.ok,
    blocked: r.blocked || false,
    homepage_error: r.homepage_error || null,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    platform: r.platform || null,
    newsletter_provider: r.newsletter_provider || null,
    social: r.social || [],
    robots: r.robots || { allow: [], disallow: [] },
    feeds: (r.feeds || []).map((f, i) => ({ url: f.url, file: `feeds/${i}.xml`, bytes: f.bytes })),
    sitemap_file: r.sitemap ? 'sitemap.xml' : null,
    homepage: r.homepage ? {
      ...{ ...r.homepage, raw_html: undefined },
      raw_html_file: 'homepage.html',
    } : null,
    pages: (r.pages || []).map(slim),
    decisions: r.decisions || [],
    log: r.log || [],
  };
  writeFileSync(`${siteDir}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');

  // Raw artefacts
  if (r.homepage?.raw_html) writeFileSync(`${siteDir}/homepage.html`, r.homepage.raw_html);
  if (r.sitemap)            writeFileSync(`${siteDir}/sitemap.xml`,  r.sitemap);
  if (r.robots && (r.robots.allow.length || r.robots.disallow.length)) {
    writeFileSync(
      `${siteDir}/robots.txt`,
      [
        ...(r.robots.allow || []).map((p) => `Allow: ${p}`),
        ...(r.robots.disallow || []).map((p) => `Disallow: ${p}`),
      ].join('\n') + '\n',
    );
  }
  if (r.feeds && r.feeds.length) {
    mkdirSync(`${siteDir}/feeds`, { recursive: true });
    r.feeds.forEach((f, i) => writeFileSync(`${siteDir}/feeds/${i}.xml`, f.body));
  }
  if (r.pages && r.pages.length) {
    mkdirSync(`${siteDir}/pages`, { recursive: true });
    for (const p of r.pages) {
      const safe = String(p.type || 'page').replace(/[^a-z0-9_-]/gi, '_');
      const { raw_html, ...slimRec } = p;
      writeFileSync(`${siteDir}/pages/${safe}.json`, JSON.stringify(slimRec, null, 2) + '\n');
      if (raw_html) writeFileSync(`${siteDir}/pages/${safe}.html`, raw_html);
    }
  }
}

// `parl members news` — RSS-first news harvester. Walks every
// site directory under <in> (default third_party/data/sites),
// parses its `feeds/*.xml` bodies, and writes a flat JSONL of
// posts under <out>:
//
//   <out>/posts.jsonl       — one post per line, normalised
//   <out>/by-member/<id>.json  — per-MP grouping
//   <out>/summary.json      — aggregate counts + earliest/latest
//
// Each post carries the originating member's id + name + party so
// downstream cross-cuts (topic clustering, "what is each MP saying
// this week") need only this file. The raw feed bodies remain in
// the sites tree for re-parsing.
//
// This command does NOT make network requests in its default mode —
// it only parses what `members crawl-sites` has already fetched.
// That keeps it cheap, deterministic, and offline-friendly.
async function runMembersNews(callOpts, ctx) {
  const inDir  = pathResolve(callOpts.in  || 'third_party/data/sites');
  const outDir = pathResolve(callOpts.out || 'third_party/data/news');
  mkdirSync(outDir, { recursive: true });
  mkdirSync(`${outDir}/by-member`, { recursive: true });

  const onlyIds = callOpts.ids
    ? new Set(String(callOpts.ids).split(',').map((s) => Number(s.trim())))
    : null;

  const Feeds = await import('../lib/feeds.mjs');
  const postsPath = `${outDir}/posts.jsonl`;
  writeFileSync(postsPath, ''); // truncate

  const sites = readdirSync(inDir).filter((f) => /^\d+$/.test(f));
  let totalPosts = 0;
  let totalSites = 0;
  let earliest = null, latest = null;
  const memberCounts = [];

  for (const sid of sites) {
    const id = Number(sid);
    if (onlyIds && !onlyIds.has(id)) continue;
    let manifest;
    try { manifest = JSON.parse(readFileSync(`${inDir}/${sid}/manifest.json`, 'utf8')); } catch { continue; }
    if (!manifest.member) continue;

    let memberPosts = [];
    let feedDir;
    try { feedDir = readdirSync(`${inDir}/${sid}/feeds`); } catch { feedDir = []; }
    for (const f of feedDir) {
      if (!f.endsWith('.xml')) continue;
      let body;
      try { body = readFileSync(`${inDir}/${sid}/feeds/${f}`, 'utf8'); } catch { continue; }
      const parsed = Feeds.parseFeed(body);
      for (const it of parsed.items) {
        const post = {
          member_id: manifest.member.id,
          member_name: manifest.member.name,
          member_party: manifest.member.partyAbbr || manifest.member.party || null,
          feed_format: parsed.format,
          feed_title: parsed.channel?.title || null,
          feed_file: `${sid}/feeds/${f}`,
          title: it.title || null,
          link:  it.link || null,
          guid:  it.guid || null,
          date:  it.date || null,
          author: it.author || null,
          summary: it.summary ? it.summary.slice(0, 1000) : null,
          categories: it.categories || [],
        };
        memberPosts.push(post);
        appendFileSync(postsPath, JSON.stringify(post) + '\n');
        totalPosts++;
        if (post.date) {
          if (!earliest || post.date < earliest) earliest = post.date;
          if (!latest   || post.date > latest)   latest   = post.date;
        }
      }
    }
    if (memberPosts.length > 0) {
      writeFileSync(`${outDir}/by-member/${id}.json`,
        JSON.stringify({ member: manifest.member, count: memberPosts.length, posts: memberPosts }, null, 2) + '\n');
      memberCounts.push({ id, name: manifest.member.name, count: memberPosts.length });
      totalSites++;
    }
  }

  memberCounts.sort((a, b) => b.count - a.count);
  writeFileSync(`${outDir}/summary.json`, JSON.stringify({
    fetchedAt: new Date().toISOString(),
    out: outDir, in: inDir,
    sites_with_feeds: totalSites,
    total_posts: totalPosts,
    earliest_date: earliest, latest_date: latest,
    top_members: memberCounts.slice(0, 25),
  }, null, 2) + '\n');
  console.log(JSON.stringify({ out: outDir, sites: totalSites, posts: totalPosts, earliest, latest }, null, 2));
}

// `parl appg resolve` — crawl every APPG in the current Register
// and resolve each officer's free-text name to a Parliament member
// record (MNIS id, party, house, constituency). For ambiguous or
// unmatched cases, emits one record per case to a JSONL file the
// operator can hand-review or feed to a separate Wikidata pass.
//
// Output layout under <out>/:
//   resolved.json           — one record per APPG with resolved officers
//   judgment_needed.jsonl   — one line per ambiguous / unmatched case
//   summary.json            — aggregate counts (matched / ambiguous / no_candidates)
//
// --wikidata enables a per-case Wikidata fallback for any officer
// not resolved by the Members API. This requires egress to
// www.wikidata.org which is sometimes blocked.
async function runAppgResolve(callOpts, ctx) {
  if (!callOpts.out) {
    console.error('--out <dir> is required.');
    process.exit(64);
  }
  const outDir = pathResolve(callOpts.out);
  mkdirSync(outDir, { recursive: true });

  const Im = await import('../lib/identity-match.mjs');
  const A  = F.appg;

  process.stderr.write('Listing groups… ');
  const list = await A.listGroups({ edition: callOpts.edition }, ctx);
  process.stderr.write(`${list.count} groups\n`);

  const judgmentPath = `${outDir}/judgment_needed.jsonl`;
  // Truncate any previous JSONL so reruns produce a clean file.
  writeFileSync(judgmentPath, '');

  const groupsOut = [];
  const counts = { matched: 0, ambiguous: 0, no_candidates: 0, errors: 0, total_officers: 0 };
  const limit = callOpts.limit ? Number(callOpts.limit) : Infinity;
  const delayMs = Number(callOpts.delayMs ?? 200);

  for (let i = 0; i < list.groups.length && i < limit; i++) {
    const g = list.groups[i];
    let group;
    try {
      group = await A.getGroup(g.slug, { edition: callOpts.edition }, ctx);
    } catch (e) {
      counts.errors++;
      groupsOut.push({ ...g, error: e.message });
      continue;
    }
    const officers = [];
    for (const off of group.officers || []) {
      counts.total_officers++;
      const r = await Im.resolveOfficer(off, ctx);
      counts[r.status] = (counts[r.status] || 0) + 1;
      // Optional Wikidata fallback for the misses.
      let wikidata = null;
      if (callOpts.wikidata && r.status !== 'matched') {
        try {
          wikidata = await Im.lookupWikidata(off.name, ctx);
        } catch (e) { wikidata = { status: 'error', message: e.message }; }
      }
      officers.push({ ...off, resolution: r, wikidata });
      if (r.status !== 'matched') {
        appendFileSync(judgmentPath,
          JSON.stringify({ group: group.title, slug: g.slug, officer: off, resolution: r, wikidata }) + '\n');
      }
    }
    groupsOut.push({ ...group, officers, slug: g.slug });
    if ((i + 1) % 25 === 0) {
      process.stderr.write(`  ${i + 1}/${list.groups.length} (matched=${counts.matched} amb=${counts.ambiguous} miss=${counts.no_candidates})\n`);
    }
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
  }

  writeFileSync(`${outDir}/resolved.json`,
    JSON.stringify({ edition: list.edition, count: groupsOut.length, groups: groupsOut }, null, 2) + '\n');
  writeFileSync(`${outDir}/summary.json`,
    JSON.stringify({ edition: list.edition, ...counts, fetchedAt: new Date().toISOString() }, null, 2) + '\n');
  console.log(JSON.stringify({ out: outDir, ...counts }, null, 2));
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
