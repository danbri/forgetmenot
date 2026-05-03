#!/usr/bin/env node
// Aggregate analysis over `third_party/data/sites/<id>/manifest.json`.
//
// Produces:
//   - summary statistics (per platform, party, page-type coverage)
//   - failure mode breakdown
//   - personal-content exclusion rate
//   - newsletter-provider distribution
//   - social-platform distribution
//   - feed availability
//   - news-item / campaigns-item totals + sample
//
// Output: a single JSON document on stdout. Pipe to jq for slicing
// or to a file for committing.
//
// Usage: node scripts/analyze-site-crawl.mjs [<sites-dir>]

import { readdirSync, readFileSync, statSync } from 'node:fs';

const dir = process.argv[2] || 'third_party/data/sites';

const ids = readdirSync(dir).filter((f) => /^\d+$/.test(f)).sort((a, b) => Number(a) - Number(b));

const out = {
  generated_at: new Date().toISOString(),
  source_dir: dir,
  total_sites: ids.length,
  ok: 0,
  failed: 0,
  blocked_by_robots: 0,
  // per-bucket histograms
  platforms: {},
  newsletter_providers: {},
  social_hosts: {},
  party: {},
  page_types: {},                 // type -> count of sites with at least one fetched page of this type
  page_type_status: {},           // type -> { ok, failed, presence_only }
  decisions: {},                  // action -> count over all decisions across all sites
  exclusion_rules: {},            // which EXCLUDE_PERSONAL needles fired and how often
  http_status: {},                // status code -> count
  feeds_per_site: {},             // count of feeds -> #sites
  // content totals
  total_news_items: 0,
  total_campaigns_items: 0,
  campaign_words: {},             // bag-of-words counts across campaign titles (for clustering)
  // failure breakdown
  failure_reasons: {},
  // worked sample for the writeup
  example_campaigns: [],
  example_news: [],
  // raw counts
  with_website: 0,
  with_homepage_html: 0,
  with_feed: 0,
  with_sitemap: 0,
};

for (const id of ids) {
  const mfPath = `${dir}/${id}/manifest.json`;
  let m;
  try { m = JSON.parse(readFileSync(mfPath, 'utf8')); }
  catch { continue; }

  out.with_website++;

  if (m.ok) out.ok++; else out.failed++;
  if (m.blocked) out.blocked_by_robots++;

  // platform / newsletter
  if (m.platform) bump(out.platforms, m.platform);
  if (m.newsletter_provider) bump(out.newsletter_providers, m.newsletter_provider);

  // party
  if (m.member?.partyAbbr) bump(out.party, m.member.partyAbbr);

  // social
  for (const s of (m.social || [])) bump(out.social_hosts, s.host);

  // pages
  if (m.homepage?.raw_html_file) out.with_homepage_html++;
  if (m.feeds?.length) out.with_feed++;
  if (m.sitemap_file) out.with_sitemap++;
  bump(out.feeds_per_site, String(m.feeds?.length || 0));

  // page types observed
  const seenTypes = new Set();
  for (const p of (m.pages || [])) {
    seenTypes.add(p.type);
    out.page_type_status[p.type] ||= { ok: 0, failed: 0, presence_only: 0 };
    if (p.presence_only) out.page_type_status[p.type].presence_only++;
    else if (p.error)    out.page_type_status[p.type].failed++;
    else                 out.page_type_status[p.type].ok++;

    // HTTP status
    if (p.http_status) bump(out.http_status, String(p.http_status));
    if (p.error?.status) bump(out.http_status, String(p.error.status));

    // candidates
    if (p.type === 'news_index' && p.candidates?.news_items) {
      out.total_news_items += p.candidates.news_items.length;
      if (out.example_news.length < 8) {
        for (const it of p.candidates.news_items.slice(0, 2)) {
          out.example_news.push({ id, name: m.member?.name, party: m.member?.partyAbbr, ...it });
          if (out.example_news.length >= 8) break;
        }
      }
    }
    if (p.type === 'campaigns' && p.candidates?.campaigns) {
      const ic = p.candidates.campaigns.filter((c) => c.title && c.title.length >= 4);
      out.total_campaigns_items += ic.length;
      // Bag-of-words for cluster discovery (cheap stop-word filter)
      const STOP = new Set([
        'the','a','an','of','in','on','and','for','to','my','our','is','are',
        'with','it','at','by','as','from','this','these','those','that','more',
        'about','your','support','join','help','plan','party','labour','con',
        'government','uk','united','kingdom',
      ]);
      for (const c of ic) {
        for (const w of c.title.toLowerCase().split(/[^a-z0-9]+/)) {
          if (!w || w.length < 4 || STOP.has(w)) continue;
          out.campaign_words[w] = (out.campaign_words[w] || 0) + 1;
        }
      }
      if (out.example_campaigns.length < 8) {
        for (const c of ic.slice(0, 2)) {
          out.example_campaigns.push({ id, name: m.member?.name, party: m.member?.partyAbbr, ...c });
          if (out.example_campaigns.length >= 8) break;
        }
      }
    }
  }
  for (const t of seenTypes) bump(out.page_types, t);

  // decisions histogram + exclusion rules
  for (const d of (m.decisions || [])) {
    bump(out.decisions, d.action);
    if (d.action === 'excluded-personal' && d.rule) bump(out.exclusion_rules, d.rule);
  }

  // failure reason classification
  if (!m.ok) {
    const status = m.homepage_error?.status ?? 0;
    let reason;
    if (m.blocked) reason = 'blocked-by-robots';
    else if (status === 0) reason = 'network/timeout';
    else if (status >= 500) reason = `5xx (${status})`;
    else if (status >= 400) reason = `4xx (${status})`;
    else reason = `other (${status})`;
    bump(out.failure_reasons, reason);
  }
}

// Top-N flatten helpers for the readable summary.
function topN(o, n = 12) {
  return Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);
}

out.top = {
  platforms: topN(out.platforms, 15),
  newsletter_providers: topN(out.newsletter_providers, 10),
  social_hosts: topN(out.social_hosts, 12),
  party: topN(out.party, 12),
  page_types: topN(out.page_types, 20),
  decisions: topN(out.decisions, 8),
  exclusion_rules: topN(out.exclusion_rules, 12),
  http_status: topN(out.http_status, 10),
  feeds_per_site: topN(out.feeds_per_site, 8),
  campaign_words: topN(out.campaign_words, 40),
  failure_reasons: topN(out.failure_reasons, 12),
};

process.stdout.write(JSON.stringify(out, null, 2) + '\n');

function bump(o, k) { o[k] = (o[k] || 0) + 1; }
