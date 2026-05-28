// sermons.ts
// Build-time data layer for the sermons page. Pulls the church's latest
// YouTube uploads from the channel Atom feed (no API key required).

export interface Sermon {
  id: string;          // YouTube videoId
  title: string;
  url: string;         // canonical watch URL
  thumbnail: string;   // hqdefault image
  published: Date;
}

export const CHANNEL_ID = "UCj73pqwo1CxjOkU0OVw5jQQ"; // @newhopechurchsa8573
export const CHANNEL_URL = "https://youtube.com/@newhopechurchsa8573";
export const FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&"); // must run last
}

export function parseSermonFeed(xml: string): Sermon[] {
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
  const sermons: Sermon[] = [];
  for (const entry of entries) {
    const id = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
    if (!id) continue;
    const rawTitle = entry.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "";
    const publishedStr = entry.match(/<published>([^<]+)<\/published>/)?.[1];
    const thumbnail =
      entry.match(/<media:thumbnail\s+url="([^"]+)"/)?.[1] ??
      `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    sermons.push({
      id,
      title: decodeEntities(rawTitle).trim(),
      url: `https://www.youtube.com/watch?v=${id}`,
      thumbnail,
      published: publishedStr ? new Date(publishedStr) : new Date(0),
    });
  }
  return sermons.sort((a, b) => b.published.getTime() - a.published.getTime());
}

export async function getSermons(): Promise<Sermon[]> {
  try {
    const res = await fetch(FEED_URL);
    if (!res.ok) return [];
    return parseSermonFeed(await res.text());
  } catch {
    return [];
  }
}

export function formatSermonDate(d: Date): string {
  return d.toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// Optional, manually-curated highlight. Leave null to hide the block.
// To feature a series, set: { title, blurb, ctaUrl? }
export const currentSeries: {
  title: string;
  blurb: string;
  ctaUrl?: string;
} | null = null;
