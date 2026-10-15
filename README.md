# music-taste-widget

An embeddable Last.fm listening widget: what you're playing, your top artists, and a six-month taste report built on the metrics from [Music Taste Visualizer](https://github.com/hgleung/music-taste).

```
Last played, 8h ago
take my hand
riensu

Top artists this month
1  Yel            231
2  keshi           87
...

Taste, last 6 months
The Specialist
Listens widely across 63 genres but keeps coming back to Yel and keshi.
Diversity  85%  listens to everything across 63 genres
Loyalty    69%  clear favorites, some variety; Yel is 21% of plays
Drift       8%  small shifts lately: more r&b, less electronic and dubstep
+ Breakdown     top 5 genres as bars
```

No runtime dependencies. Pieces you can use together or alone:

| Import | What it is | Runs on |
| --- | --- | --- |
| `music-taste-widget` | Last.fm client, data loaders, taste analysis, HTML renderer, fetch handler | server (Node 20+, Deno, Bun, Workers) |
| `music-taste-widget/element` | `<music-taste-widget>` custom element | browser |
| `music-taste-widget/styles.css` | default styles, themed with CSS custom properties | browser |

Your Last.fm API key stays on the server: the browser only ever talks to your own endpoint.

## Install

```bash
npm install github:hgleung/music-taste-widget
```

Get an API key at <https://www.last.fm/api/account/create>.

## Usage

### 1. Client-side only (any site)

Expose an endpoint with `createHandler`. It's a standard `(Request) => Promise<Response>`, so it mounts anywhere the Fetch API exists:

```ts
// Next.js: app/api/music/route.ts
import { createHandler } from "music-taste-widget";

export const GET = createHandler({
  apiKey: process.env.LASTFM_API_KEY!,
  username: "your-lastfm-username",
});
```

```ts
// Cloudflare Worker
import { createHandler } from "music-taste-widget";

// One handler per isolate, so artist tags stay cached between requests.
let handler: ((request: Request) => Promise<Response>) | undefined;

export default {
  fetch(request: Request, env: { LASTFM_API_KEY: string }) {
    handler ??= createHandler({ apiKey: env.LASTFM_API_KEY, username: "your-lastfm-username" });
    return handler(request);
  },
};
```

Then load the element and styles from your client bundle and drop the element on the page:

```ts
import "music-taste-widget/element";
import "music-taste-widget/styles.css";
```

```html
<music-taste-widget src="/api/music" refresh="60"></music-taste-widget>
```

### 2. Server-rendered, with a live "now playing"

The taste report takes 60-80 Last.fm requests, so it's best computed at build time or on a long cache. Render everything on the server, then let the element refresh just the current track:

```astro
---
// Astro component
import "music-taste-widget/styles.css";
import { createClient, getWidgetData, renderWidget } from "music-taste-widget";

const client = createClient({ apiKey: import.meta.env.LASTFM_API_KEY, username: "you" });
const data = await getWidgetData(client, ["top", "taste"]);
---
<music-taste-widget src="/api/now-playing.json" sections="now" set:html={renderWidget(data)} />
<script>import "music-taste-widget/element";</script>
```

```ts
// src/pages/api/now-playing.json.ts
import { createHandler } from "music-taste-widget";

export const prerender = false;
const handler = createHandler({ apiKey: import.meta.env.LASTFM_API_KEY, username: "you", sections: ["now"] });
export const GET = ({ request }: { request: Request }) => handler(request);
```

`renderWidget` returns a plain string, so the same pattern works with any server template (`dangerouslySetInnerHTML`, `{@html}`, `v-html`, `innerHTML`, ...).

## Reference

### Data

```ts
const client = createClient({ apiKey, username, concurrency?: 4, fetch?: customFetch });

await getWidgetData(client, sections?: ("now" | "top" | "taste")[], options?: {
  top?: { period?: "7day" | "1month" | ... ; limit?: number },   // default 1month, 5
  taste?: { artists?: number; tags?: TagOptions },             // default 50 artists per window
});
// -> { now?: RecentTrack | null, top?: ArtistPlays[] | null, taste?: TasteReport | null }
```

A section that fails comes back `null` and the rest still load. `getRecentTrack`, `getTopArtists` and `getTasteReport` load one section each. `analyzeTaste(input)` is the pure analysis step if you already have the Last.fm data.

### Rendering

```ts
renderWidget(data, {
  sections?: Section[],       // slots, in order; empty ones render hidden for the element to fill
  headings?: { nowPlaying?, lastPlayed?, top?, taste? },
  attribution?: boolean,      // Music Taste Visualizer footnote, default true
  expanded?: boolean,         // taste breakdown open by default, default false
});
renderSection(section, data, options);
```

All Last.fm text is HTML-escaped.

### Endpoint

```ts
createHandler({
  apiKey, username,
  sections?: Section[],                 // what the endpoint may serve, default all
  cache?: { now?: 60, top?: 3600, taste?: 21600 },  // CDN seconds, per section
  ...DataOptions,
});
```

`GET ?sections=now,top` narrows the response. `Cache-Control` uses the shortest lifetime among the requested sections, and drops to 60 seconds if any section failed.

### Element

```html
<music-taste-widget src="/api/music" sections="now" refresh="60"></music-taste-widget>
```

| Attribute | Meaning |
| --- | --- |
| `src` | Endpoint returning widget JSON (`createHandler`). |
| `sections` | Sent as `?sections=`; only these sections are refreshed. |
| `refresh` | Re-fetch every N seconds. Omit to fetch once. |

Server-rendered markup inside the element is kept and patched section by section; render options travel with it, so headings stay consistent. "8h ago" timestamps update every minute. A failed refresh never blanks a section that's already showing. `element.update(data)` applies data you fetched yourself.

### Styling

Light DOM, so your own CSS applies. Theme the defaults with custom properties on any ancestor:

```css
music-taste-widget {
  --mtw-fg: #333;          /* body text */
  --mtw-fg-strong: #000;   /* track names, hover */
  --mtw-muted: #777;       /* headings, numbers, details */
  --mtw-track: #eee;       /* bar background */
  --mtw-bar: #999;         /* bar fill */
  --mtw-gap: 2rem;         /* space between sections */
}
```

Widget elements carry `mtw-*` classes for anything more.

## How the taste report works

Built from your top 50 artists over the last six months and the last 30 days, their Last.fm tags, and your scrobble counts.

| Metric | Method |
| --- | --- |
| Genre vector | Each artist adds `log2(plays + 1)`, split across its tags with rank decay (1, 1/2, 1/3, ...), normalized. |
| Diversity | Shannon entropy of the genre vector divided by its maximum. |
| Loyalty | Gini coefficient over top-artist playcounts. |
| Drift | Jensen-Shannon divergence between the last 30 days' genre vector and the months before it, plus the genres that gained or lost the most share. |
| Archetype | Music Taste Visualizer's rules over diversity, loyalty and drift; the description is filled in with your own genres and artists. |
| On the rise / cooling off | In the JSON (`taste.rising`, `taste.cooling`), not rendered: artists whose share of plays at least doubled, or fell to a third, in the last 30 days. Artists missing from a top-50 list are assumed to sit at its cutoff, so a move is only reported when it's certain. |
| Concentration, volume | In the JSON, not rendered: top artist's share of all plays, artists needed to cover half, top track, scrobbles per day, distinct artists. |

Differences from Music Taste Visualizer:

- **Tags are cleaned first.** Last.fm tags mix genres with nationalities ("korean"), descriptors ("female vocalists"), personal labels ("seen live") and spelling variants ("Kpop", "k-pop"). They're merged or dropped, along with tags under 5% relevance. Tune with `tags: { minTagCount, ignoreTags }`; `tags: { raw: true }` reproduces the visualizer's genre vector exactly.
- **Drift needs no weekly charts.** The visualizer compares month-by-month charts; this compares the last 30 days with the rest of the window, from the two top-artist lists it already has.

## Cost and rate limits

| Section | Last.fm requests |
| --- | --- |
| `now` | 1 |
| `top` | 1 |
| `taste` | 5 + one per distinct artist (about 60-80) |

Tag requests run 4 at a time (`concurrency`) and are cached for the client's lifetime. Last.fm asks for no more than about 5 requests per second per key; cache the taste section (the handler's default is 6 hours) or compute it at build time.

## Development

```bash
npm install
npm test        # node:test on the TypeScript sources (Node 22.18+)
npm run check   # types
npm run build   # dist/
```

## License

MIT
