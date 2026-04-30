// Legacy Linked Data API (Elda).
// Hosts: https://lda.data.parliament.uk and https://eldaddp.azurewebsites.net
// Datasets are accessed at /<dataset>.<format>; we hard-code .json.
import { get } from '../http.mjs';

export const HOSTS = {
  canonical: 'https://lda.data.parliament.uk',
  azure: 'https://eldaddp.azurewebsites.net',
};

// Known datasets — refresh from explore.data.parliament.uk's
// releaseddatasets.json (see scripts/refetch-discovered.sh).
export const KNOWN_DATASETS = [
  'commonsdivisions', 'lordsdivisions', 'commonsoralquestions',
  'commonswrittenquestions', 'lordswrittenquestions', 'edms',
  'briefingpapers', 'researchbriefings', 'electionresults', 'elections',
  'proceedings', 'billamendments', 'members', 'thesaurus',
  'publicationlogs',
];

// Fetch one page of a dataset. `host` is 'canonical' or 'azure'.
export async function getDataset(dataset, opts = {}, ctx = {}) {
  const host = HOSTS[opts.host || 'canonical'] || opts.host || HOSTS.canonical;
  const params = {
    _pageSize: opts.pageSize ?? opts.pageSize ?? 10,
    _page: opts.page,
    _sort: opts.sort,
    _select: opts.select,
    _metadata: opts.metadata,
    _view: opts.view,
    _lang: opts.lang,
    ...(opts.filter || {}),
    ...(opts.query || {}),
  };
  const r = await get(`${host}/${encodeURIComponent(dataset)}.json`, params, ctx);
  return r.body;
}

// Fetch a dataset's metadata definition.
export async function getDatasetMeta(dataset, opts = {}, ctx = {}) {
  const host = HOSTS[opts.host || 'canonical'] || opts.host || HOSTS.canonical;
  const r = await get(`${host}/meta/${encodeURIComponent(dataset)}.json`, {}, ctx);
  return r.body;
}

export function listDatasets() {
  return KNOWN_DATASETS;
}
