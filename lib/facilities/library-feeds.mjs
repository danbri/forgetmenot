// Library Feeds — Rails app at api.parliament.uk/library-feeds.
//
// An aggregator that ingests RSS feeds from the parliamentary
// research services (Commons Library, Lords Library, POST) and
// republishes them onto a single Bluesky / Mastodon account.
//
// The HTML site is the source of truth for the publisher list; this
// library wraps the RSS alternate-format URLs only.
//
// Confirmed (May 2026):
//   /library-feeds/publications.rss          aggregated stream
//   /library-feeds/publishers/{id}.rss       single publisher's stream
// HTML-only:
//   /library-feeds                           landing
//   /library-feeds/publications              browse (no alt format)
//   /library-feeds/publishers                publisher index
import { get } from '../http.mjs';

const BASE = 'https://api.parliament.uk/library-feeds';

// Aggregated RSS feed of every publication across every publisher.
export async function publicationsRss(ctx = {}) {
  const r = await get(`${BASE}/publications.rss`, {}, { ...ctx, accept: 'application/rss+xml, application/xml, text/xml' });
  return r.body;
}

// Per-publisher RSS feed (publisher IDs available from the HTML
// publisher index page).
export async function publisherRss(publisherId, ctx = {}) {
  const r = await get(`${BASE}/publishers/${encodeURIComponent(publisherId)}.rss`, {}, { ...ctx, accept: 'application/rss+xml, application/xml, text/xml' });
  return r.body;
}

// HTML URLs for callers who want to link the user out.
export function publishersHtmlUrl() {
  return `${BASE}/publishers`;
}

export function publicationsHtmlUrl() {
  return `${BASE}/publications`;
}
