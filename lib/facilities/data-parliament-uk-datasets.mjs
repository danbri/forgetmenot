// data.parliament.uk dataset catalogue (the explore.data.parliament.uk
// portal). This skill is mostly referential — it maps portal names to
// LDA paths and to modern API equivalents.

export const PORTAL_DATASETS = [
  'Briefing Papers',
  'Parliamentary Questions Answered',
  'Members',
  'Commons Divisions',
  'Commons Oral Questions',
  'Commons Oral Question Times',
  'Commons Written Questions',
  'Lords Written Questions',
  'Thesaurus',
  'Research Briefings',
  'Elections',
  'Election Results',
  'Publication Logs',
  'AV Live Logging',
  'Lords Bill Amendments',
  'Hansard Commons Proceedings',
  'Hansard Commons Documents',
  'Hansard Lords Proceedings',
  'Hansard Lords Documents',
];

// Mapping: portal name → { ldaSlug, modernApi (or null), notes }.
export const MAPPING = {
  'Briefing Papers':                { ldaSlug: 'briefingpapers',           modernApi: null,                                 notes: 'Commons Library briefing papers; LDA only.' },
  'Parliamentary Questions Answered':{ ldaSlug: 'answeredquestions',       modernApi: 'questions-statements',               notes: 'Aggregated answered questions.' },
  'Members':                        { ldaSlug: 'members',                  modernApi: 'members',                            notes: 'Modern Members API has more detail.' },
  'Commons Divisions':              { ldaSlug: 'commonsdivisions',         modernApi: 'commons-votes',                      notes: 'Modern Commons Votes API recommended.' },
  'Commons Oral Questions':         { ldaSlug: 'commonsoralquestions',     modernApi: 'oral-questions',                     notes: '' },
  'Commons Oral Question Times':    { ldaSlug: 'commonsoralquestiontimes', modernApi: 'oral-questions',                     notes: '' },
  'Commons Written Questions':      { ldaSlug: 'commonswrittenquestions',  modernApi: 'written-questions',                  notes: '' },
  'Lords Written Questions':        { ldaSlug: 'lordswrittenquestions',    modernApi: 'written-questions',                  notes: '' },
  'Thesaurus':                      { ldaSlug: 'thesaurus',                modernApi: null,                                 notes: 'SKOS Thesaurus; LDA / SPARQL only.' },
  'Research Briefings':             { ldaSlug: 'researchbriefings',        modernApi: null,                                 notes: 'Lords Library briefings + POST notes; LDA only.' },
  'Elections':                      { ldaSlug: 'elections',                modernApi: 'members',                            notes: 'Members API exposes per-constituency results.' },
  'Election Results':               { ldaSlug: 'electionresults',          modernApi: 'members',                            notes: '' },
  'Publication Logs':               { ldaSlug: 'publicationlogs',          modernApi: null,                                 notes: 'LDA only.' },
  'AV Live Logging':                { ldaSlug: 'avliveloggings',           modernApi: 'committees',                         notes: 'Partial: committees Broadcast/Meetings.' },
  'Lords Bill Amendments':          { ldaSlug: 'lordsbillamendments',      modernApi: 'bills',                              notes: 'Modern Bills API has structured amendment text.' },
  'Hansard Commons Proceedings':    { ldaSlug: 'commonsproceedings',       modernApi: 'hansard',                            notes: 'Modern Hansard API recommended.' },
  'Hansard Commons Documents':      { ldaSlug: 'commonsdocuments',         modernApi: 'hansard',                            notes: '' },
  'Hansard Lords Proceedings':      { ldaSlug: 'lordsproceedings',         modernApi: 'hansard',                            notes: '' },
  'Hansard Lords Documents':        { ldaSlug: 'lordsdocuments',           modernApi: 'hansard',                            notes: '' },
};

export function listDatasets() {
  return PORTAL_DATASETS;
}

export function mapDataset(name) {
  return MAPPING[name] ?? null;
}
