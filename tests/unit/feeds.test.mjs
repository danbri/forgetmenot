// Unit tests for lib/feeds.mjs.
// Cover: format detection, RSS 2.0 parse, Atom parse, CDATA, dedup.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed } from '../../lib/feeds.mjs';

test('parseFeed identifies RSS 2.0', () => {
  const xml = `<?xml version="1.0"?>
    <rss version="2.0"><channel>
      <title>Test feed</title>
      <link>https://example.org/</link>
      <description>desc</description>
      <item>
        <title>First post</title>
        <link>https://example.org/p/1</link>
        <pubDate>Mon, 01 Apr 2026 10:00:00 GMT</pubDate>
        <description>summary one</description>
        <category>policy</category>
      </item>
      <item>
        <title>Second post</title>
        <link>https://example.org/p/2</link>
        <pubDate>Tue, 02 Apr 2026 10:00:00 GMT</pubDate>
      </item>
    </channel></rss>`;
  const f = parseFeed(xml);
  assert.equal(f.format, 'rss2');
  assert.equal(f.channel.title, 'Test feed');
  assert.equal(f.items.length, 2);
  assert.equal(f.items[0].title, 'First post');
  assert.equal(f.items[0].link,  'https://example.org/p/1');
  assert.match(f.items[0].date,  /01 Apr 2026/);
  assert.equal(f.items[0].summary, 'summary one');
  assert.deepEqual(f.items[0].categories, ['policy']);
});

test('parseFeed identifies Atom 1.0', () => {
  const xml = `<?xml version="1.0"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <title>Test atom</title>
      <link href="https://example.org/" rel="alternate"/>
      <link href="https://example.org/feed.xml" rel="self"/>
      <subtitle>desc</subtitle>
      <entry>
        <title>Atom post</title>
        <link href="https://example.org/2026/04/01/atom-post" rel="alternate"/>
        <link href="https://example.org/api/post/1" rel="self"/>
        <id>tag:example.org,2026:1</id>
        <published>2026-04-01T10:00:00Z</published>
        <author><name>Test MP</name></author>
        <summary>atom summary</summary>
      </entry>
    </feed>`;
  const f = parseFeed(xml);
  assert.equal(f.format, 'atom');
  assert.equal(f.items.length, 1);
  assert.equal(f.items[0].title, 'Atom post');
  // Prefers rel="alternate" over rel="self" for the canonical link.
  assert.equal(f.items[0].link, 'https://example.org/2026/04/01/atom-post');
  assert.equal(f.items[0].author, 'Test MP');
  assert.equal(f.items[0].date, '2026-04-01T10:00:00Z');
});

test('parseFeed handles CDATA + entity decoding', () => {
  const xml = `<rss version="2.0"><channel><title>X</title>
    <item>
      <title><![CDATA[Title with <b>HTML</b> and &amp; ampersands]]></title>
      <link>https://example.org/p/3</link>
    </item>
  </channel></rss>`;
  const f = parseFeed(xml);
  assert.match(f.items[0].title, /Title with HTML and & ampersands/);
});

test('parseFeed dedupes items by link', () => {
  const xml = `<rss version="2.0"><channel>
    <item><title>One</title><link>https://example.org/p/1</link></item>
    <item><title>Same URL</title><link>https://example.org/p/1</link></item>
    <item><title>Two</title><link>https://example.org/p/2</link></item>
  </channel></rss>`;
  const f = parseFeed(xml);
  assert.equal(f.items.length, 2);
});
