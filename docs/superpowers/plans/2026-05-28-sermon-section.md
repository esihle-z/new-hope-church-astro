# Sermon Section Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the all-placeholder sermons page with real, auto-updating content fetched from the church's YouTube channel at build time.

**Architecture:** A dependency-free `src/lib/sermons.ts` fetches and parses the channel's Atom feed into typed `Sermon` objects (pure parser unit-tested with `node:test`). `src/pages/sermons.astro` renders a featured embedded latest sermon, a 9-card recent grid, an optional manual "current series" highlight, and a graceful fallback when the feed is unreachable.

**Tech Stack:** Astro 6 (SSG), TypeScript (strict), Tailwind v4, Node `node:test` + native type stripping, YouTube channel RSS/Atom feed.

---

## File Structure

- **Create** `src/lib/sermons.ts` — data layer: types, channel constants, pure `parseSermonFeed(xml)`, async `getSermons()`, `formatSermonDate()`, `currentSeries` config.
- **Create** `src/lib/sermons.test.ts` — `node:test` unit tests for the pure parser + date formatter.
- **Modify** `package.json` — add a `test` script.
- **Rewrite** `src/pages/sermons.astro` — replace placeholder sections (current-series, series-archive, youtube-placeholder) with real data-driven sections; keep hero and notes/contact.
- **Create (optional)** `.github/workflows/daily-rebuild.yml` — scheduled trigger of a Netlify build hook for hands-off freshness.

Channel facts (verified against the live feed):
- Handle `@newhopechurchsa8573`, Channel ID `UCj73pqwo1CxjOkU0OVw5jQQ`
- Feed: `https://www.youtube.com/feeds/videos.xml?channel_id=UCj73pqwo1CxjOkU0OVw5jQQ`

---

## Task 1: Data layer + parser (TDD)

**Files:**
- Create: `src/lib/sermons.ts`
- Test: `src/lib/sermons.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing test**

Create `src/lib/sermons.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --experimental-strip-types --test src/lib/sermons.test.ts`
Expected: FAIL — cannot resolve `./sermons.ts` (module does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/lib/sermons.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --experimental-strip-types --test src/lib/sermons.test.ts`
Expected: PASS — `# pass 6`, `# fail 0`.

- [ ] **Step 5: Add a test script**

In `package.json`, add to `"scripts"` (after `"astro": "astro"`):

```json
    "test": "node --experimental-strip-types --test src/lib/*.test.ts"
```

Then run: `npm test`
Expected: PASS — `# pass 6`, `# fail 0`.

- [ ] **Step 6: Smoke-test the live fetch**

Run: `node --experimental-strip-types -e "import('./src/lib/sermons.ts').then(async m => { const s = await m.getSermons(); console.log(s.length, s[0]?.title); })"`
Expected: prints a count around `15` and a real sermon title (e.g. a "NEW HOPE CHURCH: ..." string). If offline, prints `0 undefined` — acceptable (fallback path).

- [ ] **Step 7: Commit**

```bash
git add src/lib/sermons.ts src/lib/sermons.test.ts package.json
git commit -m "feat: add YouTube feed data layer for sermons"
```

---

## Task 2: Rewrite the sermons page

**Files:**
- Modify: `src/pages/sermons.astro` (full rewrite of the body; hero and contact sections preserved)

- [ ] **Step 1: Replace the file contents**

Overwrite `src/pages/sermons.astro` with:

```astro
---
// sermons.astro
// Sermons page for New Hope Church. Real content pulled from the church
// YouTube channel at build time via src/lib/sermons.ts.
//
// Sections: Hero, optional Current-Series highlight, Featured latest sermon
// (embedded) OR fallback CTA, Recent grid (9), Subscribe CTA, Notes/contact.
import BranchLayout from "../layouts/BranchLayout.astro";
import Nav from "../components/Nav.astro";
import Footer from "../components/Footer.astro";
import {
  getSermons,
  formatSermonDate,
  currentSeries,
  CHANNEL_URL,
} from "../lib/sermons";

const sermons = await getSermons();
const hasFeed = sermons.length > 0;
const featured = hasFeed ? sermons[0] : null;
const recent = sermons.slice(1, 10);
---

<BranchLayout
  locationName="The Next"
  description="Watch sermons from New Hope Church — The Next campus. Browse recent messages and subscribe on YouTube."
  canonical="/sermons"
>
  <main>
    <Nav />

    <!-- 1. HERO -->
    <section
      id="hero"
      class="bg-cream min-h-[40vh] flex flex-col items-center justify-center text-center px-6 py-20 md:py-28 animate-fade-up"
    >
      <p class="font-mono text-[10px] uppercase tracking-[0.18em] text-electric-blue mb-3">
        Sermons
      </p>
      <h1 class="font-serif italic text-4xl md:text-5xl text-black leading-tight">
        Recent messages
      </h1>
      <p class="text-black/70 mt-4 max-w-lg text-base md:text-lg leading-relaxed">
        Watch past services, catch up on what we've been teaching, or subscribe to follow along.
      </p>
    </section>

    <!-- 2. CURRENT SERIES (optional, hidden when currentSeries is null) -->
    {currentSeries && (
      <section id="current-series" class="bg-[#1a1a1a] py-20 md:py-28 px-6 md:px-16 animate-fade-up">
        <div class="max-w-4xl mx-auto">
          <div class="bg-[#232323] border border-white/[0.08] rounded-2xl p-8 md:p-12">
            <p class="font-mono text-[10px] uppercase tracking-[0.18em] text-cream/50 mb-4">
              Current Series
            </p>
            <h2 class="font-serif italic text-3xl md:text-5xl text-white leading-tight mb-4">
              {currentSeries.title}
            </h2>
            <p class="text-cream/70 leading-relaxed mb-8 max-w-2xl">
              {currentSeries.blurb}
            </p>
            <a
              href={currentSeries.ctaUrl ?? CHANNEL_URL}
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center border border-white text-white px-6 py-3 rounded-full text-sm font-semibold hover:bg-white/10 transition-all duration-300 btn-press"
            >
              Watch Series
            </a>
          </div>
        </div>
      </section>
    )}

    <!-- 3a. FEATURED LATEST SERMON (embedded) -->
    {featured && (
      <section id="featured" class="bg-[#1a1a1a] py-20 md:py-28 px-6 md:px-16 animate-fade-up">
        <div class="max-w-4xl mx-auto">
          <p class="font-mono text-[10px] uppercase tracking-[0.18em] text-cream/50 mb-4">
            Latest Message
          </p>
          <div class="aspect-video w-full rounded-2xl overflow-hidden border border-white/[0.08] mb-5">
            <iframe
              class="w-full h-full"
              src={`https://www.youtube-nocookie.com/embed/${featured.id}`}
              title={featured.title}
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowfullscreen
            ></iframe>
          </div>
          <h2 class="font-serif italic text-2xl md:text-3xl text-white leading-tight">
            {featured.title}
          </h2>
          <p class="font-mono text-[10px] uppercase tracking-[0.18em] text-cream/50 mt-2">
            {formatSermonDate(featured.published)}
          </p>
        </div>
      </section>
    )}

    <!-- 3b. FALLBACK when the feed is unavailable -->
    {!hasFeed && (
      <section id="youtube-fallback" class="bg-[#1a1a1a] py-20 md:py-28 px-6 md:px-16 animate-fade-up">
        <div class="max-w-4xl mx-auto text-center">
          <h2 class="font-serif italic text-3xl text-white mb-3">Watch on YouTube</h2>
          <p class="text-cream/60 mb-8">New messages go up on our channel every week.</p>
          <div
            class="w-full aspect-video rounded-2xl border border-white/[0.08] flex flex-col items-center justify-center mb-8"
            style="background: repeating-linear-gradient(135deg, #232323 0 8px, #2b2b2b 8px 16px)"
          >
            <svg class="w-16 h-16 text-white/30 mb-3" viewBox="0 0 68 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="0.5" y="0.5" width="67" height="47" rx="8" stroke="currentColor" stroke-opacity="0.3" />
              <path d="M28 16v16l14-8L28 16z" fill="currentColor" fill-opacity="0.3" />
            </svg>
            <span class="text-white/30 font-mono text-[10px] uppercase tracking-[0.18em]">
              Watch our latest service on YouTube
            </span>
          </div>
          <a
            href={CHANNEL_URL}
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center border border-white text-white px-6 py-3 rounded-full text-sm font-semibold hover:bg-white/10 transition-all duration-300 btn-press"
          >
            Go to YouTube
          </a>
        </div>
      </section>
    )}

    <!-- 4. RECENT GRID -->
    {recent.length > 0 && (
      <section id="recent" class="bg-cream py-20 md:py-28 px-6 md:px-16 animate-fade-up">
        <div class="max-w-6xl mx-auto">
          <h2 class="font-serif italic text-2xl md:text-3xl text-black mb-10">
            More recent messages
          </h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {recent.map((s) => (
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                class="bg-white border border-black/[0.06] rounded-xl overflow-hidden group transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
              >
                <div class="aspect-[16/9] overflow-hidden bg-black/5">
                  <img
                    src={s.thumbnail}
                    alt={s.title}
                    loading="lazy"
                    class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
                <div class="p-5">
                  <h3 class="font-serif italic text-xl text-black mb-1 leading-snug">
                    {s.title}
                  </h3>
                  <p class="font-mono text-[10px] uppercase tracking-[0.18em] text-black/40">
                    {formatSermonDate(s.published)}
                  </p>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>
    )}

    <!-- 5. SUBSCRIBE CTA -->
    <section id="subscribe" class="bg-cream-surface py-20 md:py-28 px-6 md:px-16 animate-fade-up">
      <div class="max-w-2xl mx-auto text-center">
        <h2 class="font-serif italic text-3xl text-black mb-3">Never miss a message</h2>
        <p class="text-black/60 mb-8">
          New sermons go up on YouTube every week. Subscribe to follow along.
        </p>
        <a
          href={CHANNEL_URL}
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center border border-black text-black px-6 py-3 rounded-full text-sm font-semibold hover:bg-black/5 transition-all duration-300 btn-press"
        >
          Subscribe on YouTube
        </a>
      </div>
    </section>

    <!-- 6. NOTES / TRANSCRIPTS CONTACT -->
    <section id="contact-notes" class="bg-cream py-20 md:py-28 px-6 md:px-16 animate-fade-up">
      <div class="max-w-2xl mx-auto text-center">
        <p class="font-serif italic text-2xl md:text-3xl text-black mb-4">
          Missed a message? Want the notes?
        </p>
        <p class="text-black/60 mb-8 leading-relaxed">
          We have discussion guides and transcripts available for every series. Drop us a line and we'll get them to you.
        </p>
        <a
          href="mailto:hello@newhopechurch.com"
          class="inline-flex items-center bg-electric-blue text-white px-6 py-3 rounded-full text-sm font-semibold hover:bg-blue-700 transition-all duration-300 btn-press"
        >
          Get in Touch
        </a>
      </div>
    </section>

    <Footer />
  </main>
</BranchLayout>
```

- [ ] **Step 2: Build to verify it compiles with real data**

Run: `npm run build`
Expected: Build completes with no errors; output written to `dist/`.

- [ ] **Step 3: Verify rendered output on the dev server**

Run:
```bash
npm run dev > /tmp/sermons-dev.log 2>&1 &
sleep 6
echo "embeds:"; curl -s http://localhost:4321/sermons | grep -c 'youtube-nocookie.com/embed'
echo "thumbnails:"; curl -s http://localhost:4321/sermons | grep -oE 'ytimg\.com/vi/[A-Za-z0-9_-]+' | sort -u | wc -l
echo "placeholders left:"; curl -s http://localhost:4321/sermons | grep -c 'Series Art'
pkill -f "astro dev"
```
Expected: `embeds: 1`, `thumbnails:` around `9`–`10`, `placeholders left: 0`.

- [ ] **Step 4: Commit**

```bash
git add src/pages/sermons.astro
git commit -m "feat: rebuild sermons page with real YouTube content"
```

---

## Task 3 (Optional): Daily auto-rebuild for freshness

Only do this if the owner wants new Sunday sermons to appear without a manual deploy. It requires a Netlify **build hook** URL (treated as a secret).

**Files:**
- Create: `.github/workflows/daily-rebuild.yml`

- [ ] **Step 1: Create the workflow**

Create `.github/workflows/daily-rebuild.yml`:

```yaml
name: Daily site rebuild
on:
  schedule:
    - cron: "0 4 * * *" # 04:00 UTC daily
  workflow_dispatch: {}
jobs:
  rebuild:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Netlify build hook
        run: curl -fsS -X POST -d '{}' "${{ secrets.NETLIFY_BUILD_HOOK }}"
```

- [ ] **Step 2: Document the manual setup**

These steps are performed by the owner, not the agent:
1. Netlify → Site settings → Build & deploy → Build hooks → "Add build hook" → copy the URL.
2. GitHub repo → Settings → Secrets and variables → Actions → New repository secret named `NETLIFY_BUILD_HOOK`, value = the hook URL.
3. Push the workflow file; confirm it appears under the repo's Actions tab.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/daily-rebuild.yml
git commit -m "ci: add daily rebuild to refresh sermon feed"
```

---

## Self-Review

- **Spec coverage:** Data layer (Task 1) ✓; featured embed, recent grid of 9, optional series highlight, fallback, kept subscribe/notes (Task 2) ✓; freshness follow-up (Task 3) ✓; dependency-free + build-safe via try/catch ✓; design tokens reused ✓.
- **Placeholder scan:** No "TODO"/"TBD"; every code step has complete code. `${{ secrets.NETLIFY_BUILD_HOOK }}` is a real GitHub Actions secret reference, not a plan placeholder.
- **Type consistency:** `Sermon`, `getSermons`, `parseSermonFeed`, `formatSermonDate`, `currentSeries`, `CHANNEL_URL` are defined in Task 1 and used with identical names/signatures in Task 2.
- **Out of scope (unchanged):** real series grouping, YouTube Data API, the `mailto:` address, and the missing `og-image.jpg`.
