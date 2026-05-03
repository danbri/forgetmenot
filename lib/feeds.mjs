// RSS 2.0 + Atom feed parser.
//
// Stdlib-only regex parser, same philosophy as the HTML extractor
// in lib/facilities/sites.mjs: cheap, deterministic, lossless
// enough that the raw bytes are still on disk if any field is
// extracted incorrectly.
//
// Returns a normalised record with the union of fields useful
// across the two formats:
//
//   { format, channel: { title, link, description }, items: [
//     { title, link, guid, date, summary, author, categories }
//   ] }
//
// `format` is `"rss2"` or `"atom"` (best guess from the root tag).
// Items are deduplicated by `link`. Dates are passed through as
// strings (RFC822 for RSS, ISO 8601 for Atom) — callers can
// re-parse to Date if they want.

const FEED_KIND = (xml) => {
  if (/<feed\b[^>]*xmlns=["'][^"']*atom/i.test(xml) || /<feed\b/i.test(xml)) return 'atom';
  if (/<rss\b/i.test(xml)) return 'rss2';
  return 'unknown';
};

function decodeEntities(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g,        (_, n) => String.fromCharCode(Number(n)))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickInner(block, tag) {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = block.match(re);
  return m ? decodeEntities(m[1]) : '';
}

// Extract <link href="..."/> for Atom (self-closing) OR
// <link>text</link> for RSS. Atom often has multiple <link> tags
// (rel="self", rel="alternate"); we prefer rel="alternate" or the
// first link without rel.
function pickLink(block) {
  const atomLinks = [...block.matchAll(/<link\b([^>]*?)\/?>(?:<\/link>)?/gi)];
  for (const m of atomLinks) {
    const attrs = m[1] || '';
    const rel  = (attrs.match(/\brel=["']([^"']+)["']/i) || [])[1] || '';
    const href = (attrs.match(/\bhref=["']([^"']+)["']/i) || [])[1];
    if (href && (rel === 'alternate' || rel === '')) return href;
  }
  // RSS-style <link>URL</link>
  const m = block.match(/<link\b[^>]*>([^<]+)<\/link>/i);
  return m ? m[1].trim() : '';
}

function pickAuthor(block) {
  // Atom uses <author><name>X</name></author>; RSS uses <author>X</author>
  const a = block.match(/<author\b[^>]*>([\s\S]*?)<\/author>/i);
  if (!a) {
    const dc = block.match(/<dc:creator\b[^>]*>([\s\S]*?)<\/dc:creator>/i);
    return dc ? decodeEntities(dc[1]) : null;
  }
  const inner = a[1];
  const name = inner.match(/<name\b[^>]*>([\s\S]*?)<\/name>/i);
  return decodeEntities(name ? name[1] : inner);
}

// Item-style block extractor — works for both <item> (RSS) and
// <entry> (Atom). Returns array of normalised items.
function parseItems(xml, tag) {
  const items = [];
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  let m;
  while ((m = re.exec(xml)) !== null) {
    const block = m[1];
    const title    = pickInner(block, 'title');
    const link     = pickLink(block);
    const guid     = pickInner(block, 'guid') || pickInner(block, 'id');
    const date     = pickInner(block, 'pubDate') || pickInner(block, 'published') || pickInner(block, 'updated') || pickInner(block, 'dc:date');
    const summary  = pickInner(block, 'description') || pickInner(block, 'summary') || pickInner(block, 'content:encoded') || pickInner(block, 'content');
    const author   = pickAuthor(block);
    const categories = [...block.matchAll(/<category\b[^>]*>([\s\S]*?)<\/category>/gi)]
                        .map((c) => decodeEntities(c[1])).filter(Boolean);
    if (!title && !link) continue;
    items.push({ title, link, guid, date, summary, author, categories });
  }
  // Dedupe by link.
  const seen = new Set();
  return items.filter((it) => (seen.has(it.link) ? false : (seen.add(it.link), true)));
}

export function parseFeed(xml) {
  const format = FEED_KIND(xml);
  if (format === 'rss2') {
    const channelMatch = xml.match(/<channel\b[^>]*>([\s\S]*?)<\/channel>/i);
    const channelBlock = channelMatch ? channelMatch[1] : xml;
    const channel = {
      title: pickInner(channelBlock, 'title'),
      link:  pickLink(channelBlock),
      description: pickInner(channelBlock, 'description'),
    };
    return { format, channel, items: parseItems(xml, 'item') };
  }
  if (format === 'atom') {
    const channel = {
      title: pickInner(xml, 'title'),
      link:  pickLink(xml),
      description: pickInner(xml, 'subtitle'),
    };
    return { format, channel, items: parseItems(xml, 'entry') };
  }
  return { format: 'unknown', channel: { title: '', link: '', description: '' }, items: [] };
}
