# Sermon Section Redesign — Design Spec

**Date:** 2026-05-28
**Page:** `src/pages/sermons.astro`
**Status:** Approved, pending implementation plan

## Problem

The sermons page is entirely placeholder. It invents a curated "series" model
(fake series names, "Series Art" swatches, a "Message 3 of 4" progress arc) and
a static graphic standing in for a YouTube embed. None of it reflects real
content. The church's actual content is a flat stream of service recordings on
YouTube (`@newhopechurchsa8573`).

## Goal

Replace the placeholders with real, auto-updating sermon content pulled from the
church's YouTube channel at build time, presented in a hybrid layout: a featured
latest sermon + a grid of recent messages, with an optional manually-curated
"current series" highlight.

## Constraints

- Static Astro 6 site (SSG), no backend/runtime server.
- Keep the project's minimal dependency footprint (currently 3 deps).
- Must not break the build if the network/feed is unavailable.
- Match the existing design system (tokens in `src/styles/globals.css`).

## Data source

YouTube channel RSS/Atom feed (free, no API key):

```
https://www.youtube.com/feeds/videos.xml?channel_id=UCj73pqwo1CxjOkU0OVw5jQQ
```

- Channel handle: `@newhopechurchsa8573`
- Channel ID: `UCj73pqwo1CxjOkU0OVw5jQQ`
- Returns the latest 15 entries with title, videoId, published date, and
  thumbnail URL.

## Architecture

### `src/lib/sermons.ts` (new)

Typed module, fetched at build time from `.astro` frontmatter.

```ts
export interface Sermon {
  id: string;          // YouTube videoId
  title: string;
  url: string;         // https://www.youtube.com/watch?v=<id>
  thumbnail: string;   // hqdefault.jpg from the feed
  published: Date;
}

export async function getSermons(): Promise<Sermon[]>;
```

- Fetches the feed URL, parses the Atom XML into `Sermon[]`, sorted
  newest-first.
- Dependency-free parser scoped to YouTube's stable feed schema (extract each
  `<entry>`, pull `yt:videoId`, `title`, `published`, `media:thumbnail`).
  Decode common XML entities (`&amp;`, `&#39;`, etc.) in titles.
- Wrapped in `try/catch`; returns `[]` on any failure so the build never breaks.
- Channel ID lives in a named constant with the handle in a comment.

Also exports the optional series-highlight config:

```ts
export const currentSeries: {
  title: string;
  blurb: string;
  ctaUrl?: string;
} | null = null; // default hidden
```

### `src/pages/sermons.astro` (rewrite of sections 2–4)

Frontmatter calls `getSermons()` once. Derives:
- `featured = sermons[0]` (newest)
- `recent = sermons.slice(1, 10)` (next 9)
- `hasFeed = sermons.length > 0`

Sections, in order:

1. **Hero** — unchanged (cream, "Recent messages").
2. **Current-series highlight** — existing dark card markup, now data-driven from
   `currentSeries`. Rendered only when `currentSeries` is non-null. The fake
   "Message N of 4" progress dots are removed. CTA uses `ctaUrl` when present,
   else falls back to the channel URL.
3. **Featured latest sermon** — when `hasFeed`: a privacy-friendly
   `youtube-nocookie.com/embed/<id>` iframe in a 16:9 frame (`loading="lazy"`),
   with the real title (serif italic) and formatted published date (mono label).
4. **Recent grid (9)** — when `hasFeed`: responsive grid (1/2/3 cols) of `recent`
   sermons. Each card: real thumbnail (`<img loading="lazy">`, 16:9), title, and
   formatted date; the whole card links to the YouTube watch URL
   (`target="_blank" rel="noopener noreferrer"`). Replaces the six fake
   "Series Art" cards.
5. **Subscribe CTA** — unchanged ("Subscribe on YouTube", real channel link).
6. **Notes/transcripts contact** — unchanged. NOTE: `mailto:hello@newhopechurch.com`
   may not be a real inbox — flag for the owner; out of scope here.

**Fallback (`!hasFeed`):** sections 3 and 4 collapse into a single centered
"Watch on YouTube" CTA card (reusing the existing play-icon treatment) so the
page degrades gracefully instead of showing empty regions.

## Design system

Reuse existing tokens/utilities — no new global CSS unless needed:
- Headings: `font-serif italic`; labels: `font-mono` uppercase
  `tracking-[0.18em]` `text-electric-blue` / `text-black/40`.
- Backgrounds alternate `bg-cream`, `bg-[#1a1a1a]`/`#232323` (series highlight),
  `bg-cream-surface`.
- Cards: `rounded-xl`/`rounded-2xl`, subtle borders, `animate-fade-up`,
  `btn-press` on buttons. Grid card hover lift consistent with current cards.

## Freshness (follow-up, optional)

The list refreshes on every site rebuild. To surface new Sunday sermons without
manual deploys, set up a daily rebuild:
- Create a Netlify **build hook** URL.
- Trigger it on a daily schedule (Netlify scheduled function, or a free external
  cron / GitHub Actions `schedule`).

This requires the build-hook URL (a secret), so it is tracked as an optional
follow-up, not part of the core implementation.

## Out of scope

- Real series/playlist grouping (no series data exists in the feed).
- YouTube Data API integration (RSS is sufficient and key-free).
- Fixing the `mailto:` address and the missing `og-image.jpg` (separate items).

## Success criteria

- `sermons.astro` shows the real latest sermon (playable) and 9 real recent
  messages with correct titles, dates, thumbnails, and working links.
- No placeholder series art or fake progress indicators remain.
- `npm run build` succeeds both online (real data) and with the feed
  unreachable (fallback CTA, empty `recent`).
- `currentSeries = null` hides the highlight; setting it shows it.
