#!/usr/bin/env node
// Append a "Using the CLI" section to each skills/<name>/SKILL.md.
// Idempotent: detects the marker line and replaces an existing section.
//
//   node scripts/update-skills-with-cli.mjs
//
// One-shot generator. Edit MAPPING below to adjust per-facility examples.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');

const MARKER_START = '<!-- parl-cli-start -->';
const MARKER_END = '<!-- parl-cli-end -->';

// One entry per skills/<name>/. `cli` is the `parl <facility>` arg.
// `examples` is a list of [shellCmd, oneLineDescription].
const MAPPING = {
  'members': {
    cli: 'members',
    intro: 'Wraps the modern Members API. Member IDs are MNIS integers and join with Hansard, voting and questions APIs.',
    examples: [
      ['parl members search --name Cooper --house Commons --take 5', 'Search current MPs called Cooper.'],
      ['parl members get 4514', 'Full record for Sir Keir Starmer (MNIS 4514).'],
      ['parl members voting 4514 --house Commons --page 1', 'Voting record.'],
      ['parl members interests 4514', 'Registered financial interests.'],
      ['parl members constituency-search --search-text "Hackney" --take 5', 'Constituencies matching "Hackney".'],
      ['parl members parties-state Commons 2024-07-04', 'State of parties on a date.'],
      ['parl members gov-posts', 'Current Government posts.'],
    ],
  },
  'bills': {
    cli: 'bills',
    intro: 'Wraps the Bills API.',
    examples: [
      ['parl bills search --term data --house Commons --take 5', 'Search Bills with "data" in the title.'],
      ['parl bills get 3678', 'One Bill detail.'],
      ['parl bills stages 3678', 'All stages of a Bill.'],
      ['parl bills amendments 3678 5005 --decision "Agreed to" --take 10', 'Agreed amendments at a stage.'],
      ['parl bills publications 3678', 'Publications.'],
      ['parl bills types', 'List Bill types reference.'],
      ['parl bills stage-types', 'List stage types reference.'],
    ],
  },
  'committees': {
    cli: 'committees',
    intro: 'Wraps the Committees API. Inquiries are called "Committee Business" in this surface.',
    examples: [
      ['parl committees search --term Treasury --take 5', 'Find a committee.'],
      ['parl committees get 158', 'Treasury Committee detail.'],
      ['parl committees members 158 --current', 'Current members.'],
      ['parl committees publications 158', 'Publication groups.'],
      ['parl committees business-search --committee-id 158 --take 5', 'Inquiries.'],
      ['parl committees oral-evidence-search --committee-business-id 12345 --take 5', 'Oral evidence sessions.'],
      ['parl committees meetings --from 2026-04-01 --to 2026-04-30', 'Meetings in a date range.'],
    ],
  },
  'hansard': {
    cli: 'hansard',
    intro: 'Wraps the modern Hansard API. Use ext-IDs (GUIDs) returned by search to drill into debates and divisions.',
    examples: [
      ['parl hansard last-sitting --house Commons', 'Latest sitting date.'],
      ['parl hansard search --term climate --from 2026-01-01 --to 2026-04-30 --take 5', 'Generic search.'],
      ['parl hansard search-debates --term "Online Safety" --take 5', 'Debates only.'],
      ['parl hansard sections-for-day --house Commons --date 2026-04-29', 'Day breakdown.'],
      ['parl hansard debate <debateSectionExtId>', 'Debate text.'],
      ['parl hansard division <divisionExtId>', 'Division detail.'],
      ['parl hansard member-contributions 4514', 'Per-member contributions.'],
    ],
  },
  'commons-votes': {
    cli: 'commons-votes',
    intro: 'Wraps the Commons Votes API. Member IDs match the Members API.',
    examples: [
      ['parl commons-votes search --from 2026-04-01 --to 2026-04-30 --take 5', 'Recent divisions.'],
      ['parl commons-votes get 2350', 'One division with member-level votes.'],
      ['parl commons-votes by-party 2350', 'Aye/no/abstain by party.'],
      ['parl commons-votes member 4514 --take 25', 'A Member\'s voting record.'],
    ],
  },
  'lords-votes': {
    cli: 'lords-votes',
    intro: 'Wraps the Lords Votes API. Lords vote "Content" / "Not Content" rather than aye/no.',
    examples: [
      ['parl lords-votes search --take 5', 'Recent Lords divisions.'],
      ['parl lords-votes get 3000', 'One Lords division detail.'],
      ['parl lords-votes by-party 3000', 'Content/not-content by party.'],
    ],
  },
  'oral-questions-and-edms': {
    cli: 'oral-questions',
    intro: 'Wraps the Commons-only Oral Questions and EDMs API.',
    examples: [
      ['parl oral-questions questions --from 2026-04-01 --to 2026-04-30 --take 5', 'Tabled oral questions.'],
      ['parl oral-questions slots --from 2026-04-01 --to 2026-04-30', 'Question time slots.'],
      ['parl oral-questions edms --term climate --take 5', 'Search EDMs.'],
      ['parl oral-questions edm 66088', 'One EDM.'],
    ],
  },
  'written-questions-and-statements': {
    cli: 'wq',
    intro: 'Wraps the Written Questions and Statements API. Replaces the legacy writtenquestions-api host.',
    examples: [
      ['parl wq search --term "NHS dentistry" --take 5', 'Search written questions.'],
      ['parl wq get 1234567', 'Question by ID.'],
      ['parl wq by-uin 2026-04-29 HC123456', 'Question by date+UIN.'],
      ['parl wq statements --from 2026-04-01 --to 2026-04-30 --take 5', 'Written statements.'],
      ['parl wq reports --take 5', 'Daily reports.'],
    ],
  },
  'statutory-instruments': {
    cli: 'si',
    intro: 'Wraps the Statutory Instruments API.',
    examples: [
      ['parl si search --term "asylum" --take 5', 'Search SIs.'],
      ['parl si get 1234', 'One SI.'],
      ['parl si timeline 1234', 'Procedural timeline.'],
      ['parl si procedures', 'List procedures.'],
      ['parl si laying-bodies', 'List laying bodies.'],
    ],
  },
  'treaties': {
    cli: 'treaties',
    intro: 'Wraps the Treaties API (CRaG-laid treaties).',
    examples: [
      ['parl treaties search --search-text "fisheries" --take 5', 'Search treaties.'],
      ['parl treaties get 12', 'One treaty.'],
      ['parl treaties timeline 12', 'Business items.'],
      ['parl treaties orgs', 'Government organisations.'],
    ],
  },
  'interests': {
    cli: 'interests',
    intro: 'Wraps the Register of Members\' Financial Interests API.',
    examples: [
      ['parl interests categories', 'Interest categories.'],
      ['parl interests search --member-id 4514 --take 10', 'Interests for one member.'],
      ['parl interests search --category-id 2 --take 10', 'Recent donations entries.'],
      ['parl interests registers', 'Published register snapshots.'],
    ],
  },
  'erskine-may': {
    cli: 'em',
    intro: 'Wraps the Erskine May API (parliamentary procedure manual).',
    examples: [
      ['parl em parts', 'List Parts.'],
      ['parl em paragraph 20.5', 'Pull paragraph 20.5 by reference.'],
      ['parl em search "casting vote"', 'Search paragraphs.'],
      ['parl em search-sections "privilege"', 'Search sections.'],
      ['parl em index --start-letter A', 'Browse the index from A.'],
    ],
  },
  'now': {
    cli: 'now',
    intro: 'Wraps the annunciator (Now) API for live chamber state.',
    examples: [
      ['parl now current CommonsMain', 'What is currently on the Commons annunciator.'],
      ['parl now current LordsMain', 'Lords annunciator.'],
      ['parl now since CommonsMain 2026-04-29T14:00:00Z', 'Most recent message after a timestamp.'],
    ],
  },
  'petitions': {
    cli: 'petitions',
    intro: 'Wraps the e-Petitions JSON service.',
    examples: [
      ['parl petitions search --state open --count 5', 'Open petitions.'],
      ['parl petitions search --term climate --count 5', 'Search by term.'],
      ['parl petitions get 700000', 'One petition with signature breakdown.'],
      ['parl petitions archive --count 5', 'Archived (older) petitions.'],
    ],
  },
  'sparql': {
    cli: 'sparql',
    intro: 'Wraps the public SPARQL endpoint. Note this fronts the DDP store (~7.5M triples, no inference); the DD store is not on this surface — see docs/triple-stores.md.',
    examples: [
      ['parl sparql query \'SELECT * WHERE { ?s ?p ?o } LIMIT 5\'', 'Sanity-check probe.'],
      ['parl sparql classes --limit 30', 'Top instance classes by frequency.'],
      ['parl sparql rdfs-classes', 'rdfs:Class / owl:Class with labels.'],
      ['parl sparql skos-schemes', 'SKOS concept schemes (e.g. Thesaurus).'],
      ['parl sparql describe https://id.parliament.uk/TyNGhslR --format turtle', 'DESCRIBE a resource.'],
    ],
  },
  'odata': {
    cli: 'odata',
    intro: 'Wraps the OData v4 service. 183 entity sets; same data graph as SPARQL.',
    examples: [
      ['parl odata sets', 'List entity sets.'],
      ['parl odata get Person --top 5 --select "Id,PersonGivenName,PersonFamilyName"', 'Sample.'],
      ['parl odata count Member', 'Count of an entity set.'],
      ['parl odata get Constituency --filter "ConstituencyGroupName eq \'Hackney North and Stoke Newington\'" --top 1', 'Filter by name.'],
    ],
  },
  'parameterised-query': {
    cli: 'pq',
    intro: 'Wraps the parameterised-query browser. 124 named templates returning JSON; covers the most common joins without writing SPARQL.',
    examples: [
      ['parl pq postcode "SW1P 3JA"', 'Postcode → constituency → current MP.'],
      ['parl pq mps', 'All current MPs.'],
      ['parl pq person-by-mnis 4514', 'Person by MNIS ID.'],
      ['parl pq run constituency_lookup --property=onsCode --value=E14000647', 'Arbitrary template invocation.'],
    ],
  },
  'linked-data-api': {
    cli: 'lda',
    intro: 'Wraps the legacy Linked Data API (Elda) datasets.',
    examples: [
      ['parl lda datasets', 'Known dataset slugs.'],
      ['parl lda get commonsdivisions --page-size 5 --sort -date', 'Recent Commons divisions via LDA.'],
      ['parl lda get briefingpapers --page-size 5 --sort -created', 'Recent Commons Library briefings.'],
      ['parl lda get thesaurus --page-size 50', 'Walk the Parliament Thesaurus.'],
    ],
  },
  'historic-hansard': {
    cli: 'hh',
    intro: 'Wraps the historic Hansard site (1803–2005). HTML only — these commands return URLs and HTML, not JSON.',
    examples: [
      ['parl hh sitting-url 1832 jun 4', 'Build the URL for the 4 June 1832 sitting page.'],
      ['parl hh person-url mr-james-graham-1', 'Build a person URL.'],
      ['parl hh fetch sittings/2005/dec/19', 'Fetch HTML for a sitting day.'],
    ],
  },
  'members-data-platform': {
    cli: 'mnis',
    intro: 'Wraps the legacy MNIS Members Data Platform.',
    examples: [
      ['parl mnis members --house Commons --eligible --format json', 'Current Commons MPs as JSON.'],
      ['parl mnis member 172', 'Member 172 (Diane Abbott).'],
      ['parl mnis parties-active Commons', 'Active parties (returns XML).'],
      ['parl mnis postcode "SW1P 3JA"', 'Postcode → MP.'],
    ],
  },
  'data-parliament-uk-datasets': {
    cli: 'ddpd',
    intro: 'Catalogue mapping the explore.data.parliament.uk dataset names to LDA slugs and modern-API equivalents.',
    examples: [
      ['parl ddpd list', 'The 19 portal dataset names.'],
      ['parl ddpd map "Briefing Papers"', 'Map a name to LDA slug + modern API note.'],
      ['parl ddpd map "Thesaurus"', 'Map the Parliament Thesaurus.'],
    ],
  },
};

const TEMPLATE = (entry) => `
${MARKER_START}

## Using the CLI

This skill ships with a Node CLI alongside the documentation. From the
repo root:

\`\`\`sh
node bin/parl.mjs ${entry.cli} --help
\`\`\`

Or after \`npm link\` (one-time install):

\`\`\`sh
parl ${entry.cli} --help
\`\`\`

${entry.intro}

### Examples

${entry.examples.map(([cmd, note]) => `\`\`\`sh\n${cmd}\n\`\`\`\n${note ? note + '\n' : ''}`).join('\n')}

### Library use (Node + browser)

Same surface as a JS module:

\`\`\`js
import * as fac from '../../lib/facilities/${entry.cli === 'em' ? 'erskine-may'
  : entry.cli === 'wq' ? 'written-questions'
  : entry.cli === 'hh' ? 'historic-hansard'
  : entry.cli === 'pq' ? 'parameterised-query'
  : entry.cli === 'lda' ? 'linked-data-api'
  : entry.cli === 'si' ? 'statutory-instruments'
  : entry.cli === 'mnis' ? 'members-data-platform'
  : entry.cli === 'ddpd' ? 'data-parliament-uk-datasets'
  : entry.cli === 'oral-questions' ? 'oral-questions'
  : entry.cli === 'commons-votes' ? 'commons-votes'
  : entry.cli === 'lords-votes' ? 'lords-votes'
  : entry.cli}.mjs';

// Each function is async and returns parsed JSON (or bytes for
// download endpoints). See the .mjs source for the full export list.
\`\`\`

The library uses only \`fetch\` / \`URL\` / \`AbortController\`, so the
same source runs in Node 18+ and in modern browsers.

${MARKER_END}
`;

let updated = 0;
for (const skillDir of Object.keys(MAPPING)) {
  const path = join(REPO, 'skills', skillDir, 'SKILL.md');
  let body;
  try { body = readFileSync(path, 'utf8'); }
  catch { console.error(`skip (missing): ${path}`); continue; }

  const block = TEMPLATE(MAPPING[skillDir]).trim() + '\n';

  if (body.includes(MARKER_START) && body.includes(MARKER_END)) {
    const before = body.slice(0, body.indexOf(MARKER_START));
    const after = body.slice(body.indexOf(MARKER_END) + MARKER_END.length);
    body = before + block + after.replace(/^\n+/, '\n');
  } else {
    if (!body.endsWith('\n')) body += '\n';
    body += '\n' + block;
  }
  writeFileSync(path, body);
  updated++;
  console.log(`updated ${skillDir}/SKILL.md`);
}
console.log(`\n${updated} skill manifests updated.`);
