// Survey feed liveness AND capture recent items, in one polite pass.
// Writes feeds-liveness.json (per-feed status/items/latest) and
// feeds-items.json (top items per alive feed, for the reader at /kgx/feeds).
import { readFileSync, writeFileSync } from 'node:fs';
const DIR = 'third_party/data/parliament-sitemap';
const feeds = JSON.parse(readFileSync(`${DIR}/feeds.json`, 'utf8')).feeds;
const UA = { 'User-Agent': 'forgetmenot/0.1.0 (+https://github.com/danbri/forgetmenot)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const strip = s => s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const tag = (block, t) => { const m = block.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, 'i')); return m ? strip(m[1]) : null; };
const linkOf = (block) => {
  const a = block.match(/<link[^>]*href="([^"]+)"/i); if (a) return a[1];
  const r = block.match(/<link>([\s\S]*?)<\/link>/i); return r ? strip(r[1]) : null;
};
const dateOf = (block) => { const m = block.match(/<(?:pubDate|updated|published|dc:date)[^>]*>([^<]+)</i); return m ? m[1].trim() : null; };

const liveness = [], items = [];
let i = 0;
for (const f of feeds) {
  i++;
  const rec = { id: f.id, scope: f.scope, url: f.url, status: 0, items: 0, latest: null };
  try {
    const r = await fetch(f.url, { headers: UA }); rec.status = r.status;
    const t = await r.text();
    const blocks = t.match(/<item[\s>][\s\S]*?<\/item>/gi) || t.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
    rec.items = blocks.length;
    const parsed = blocks.map(b => ({ title: tag(b, 'title'), link: linkOf(b), date: dateOf(b) }))
      .filter(x => x.title)
      .sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
    rec.latest = parsed[0] && parsed[0].date ? new Date(parsed[0].date).toISOString().slice(0, 10) : null;
    if (parsed.length) items.push({ id: f.id, title: f.title, scope: f.scope, chamber: f.chamber, url: f.url, items: parsed.slice(0, 8) });
  } catch (e) { rec.error = String(e.message).slice(0, 40); }
  liveness.push(rec);
  if (i % 100 === 0) process.stderr.write(`  ${i}/${feeds.length}\n`);
  await sleep(120);
}
writeFileSync(`${DIR}/feeds-liveness.json`, JSON.stringify(liveness));
writeFileSync(`${DIR}/feeds-items.json`, JSON.stringify(items));
const now = Date.now(), DAY = 864e5;
const alive = liveness.filter(r => r.items > 0);
const rec = d => alive.filter(r => r.latest && (now - Date.parse(r.latest)) < d * DAY).length;
const byScope = liveness.reduce((a, r) => { if (r.items > 0) a[r.scope] = (a[r.scope] || 0) + 1; return a; }, {});
console.log(JSON.stringify({ total: liveness.length, withItems: alive.length, last90d: rec(90), last365d: rec(365), aliveByScope: byScope, itemsFileFeeds: items.length }, null, 1));
