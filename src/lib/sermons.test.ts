import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSermonFeed, formatSermonDate } from "./sermons.ts";

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"
      xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
  <title>New Hope Church SA</title>
  <entry>
    <id>yt:video:AAA111</id>
    <yt:videoId>AAA111</yt:videoId>
    <title>NEW HOPE CHURCH: Pentecost &amp; Fire</title>
    <published>2026-05-24T21:08:24+00:00</published>
    <media:group>
      <media:thumbnail url="https://i.ytimg.com/vi/AAA111/hqdefault.jpg" width="480" height="360"/>
    </media:group>
  </entry>
  <entry>
    <id>yt:video:BBB222</id>
    <yt:videoId>BBB222</yt:videoId>
    <title>NEW HOPE CHURCH: Ascension Day</title>
    <published>2026-05-17T22:24:32+00:00</published>
    <media:group>
      <media:thumbnail url="https://i.ytimg.com/vi/BBB222/hqdefault.jpg"/>
    </media:group>
  </entry>
</feed>`;

test("parses entries into sermons, newest first", () => {
  const s = parseSermonFeed(SAMPLE);
  assert.equal(s.length, 2);
  assert.equal(s[0].id, "AAA111");
  assert.equal(s[1].id, "BBB222");
});

test("decodes XML entities in titles", () => {
  const s = parseSermonFeed(SAMPLE);
  assert.equal(s[0].title, "NEW HOPE CHURCH: Pentecost & Fire");
});

test("builds watch url and keeps thumbnail", () => {
  const s = parseSermonFeed(SAMPLE);
  assert.equal(s[0].url, "https://www.youtube.com/watch?v=AAA111");
  assert.equal(s[0].thumbnail, "https://i.ytimg.com/vi/AAA111/hqdefault.jpg");
});

test("does not treat the feed-level channel title as an entry", () => {
  const s = parseSermonFeed(SAMPLE);
  assert.ok(!s.some((x) => x.title === "New Hope Church SA"));
});

test("returns [] for empty or entry-less input", () => {
  assert.deepEqual(parseSermonFeed(""), []);
  assert.deepEqual(parseSermonFeed("<feed></feed>"), []);
});

test("formatSermonDate renders a readable date", () => {
  assert.equal(
    formatSermonDate(new Date("2026-05-24T21:08:24+00:00")),
    "24 May 2026",
  );
});
