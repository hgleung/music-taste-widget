import type { LastfmClient, Period } from "./lastfm.ts";
import { cleanTags, type TagOptions } from "./tags.ts";
import { analyzeTaste, type ArtistPlays, type TasteReport, type TrackPlays } from "./taste.ts";

export interface RecentTrack {
  track: string;
  artist: string;
  url: string;
  nowPlaying: boolean;
  /** Unix seconds; null while the track is playing. */
  playedAt: number | null;
}

export type Section = "now" | "top" | "taste";
export const SECTIONS: readonly Section[] = ["now", "top", "taste"];

/** Everything the widget renders. A missing key means "not requested"; null means "unavailable". */
export interface WidgetData {
  now?: RecentTrack | null;
  top?: ArtistPlays[] | null;
  taste?: TasteReport | null;
}

export interface DataOptions {
  /** Top-artists list ("top" section). Default: last 30 days, 5 artists. */
  top?: { period?: Period; limit?: number };
  /** Taste report ("taste" section). */
  taste?: TasteOptions;
}

export interface TasteOptions {
  /** Artists sampled from each window. Default 50, Last.fm allows up to 1000 (one tag request each). */
  artists?: number;
  tags?: TagOptions;
}

interface RawArtist {
  name: string;
  playcount: string;
  url: string;
}

const DAY = 86_400;
const PERIOD_DAYS = 182; // Last.fm's "6month"
const RECENT_DAYS = 30; // Last.fm's "1month"

export async function getRecentTrack(client: LastfmClient): Promise<RecentTrack | null> {
  const data = await client.call<{
    recenttracks?: {
      track?: { name: string; url: string; artist: { "#text": string }; date?: { uts: string }; "@attr"?: { nowplaying?: string } }[];
    };
  }>({ method: "user.getRecentTracks", user: client.username, limit: "1" });
  const t = data.recenttracks?.track?.[0];
  if (!t) return null;
  return {
    track: t.name,
    artist: t.artist["#text"],
    url: t.url,
    nowPlaying: t["@attr"]?.nowplaying === "true",
    playedAt: t.date ? Number(t.date.uts) : null,
  };
}

async function topArtistsPage(client: LastfmClient, period: Period, limit: number) {
  const data = await client.call<{ topartists?: { artist?: RawArtist[]; "@attr"?: { total?: string } } }>({
    method: "user.getTopArtists",
    user: client.username,
    period,
    limit: String(limit),
  });
  return {
    artists: (data.topartists?.artist ?? []).map((a) => ({ name: a.name, plays: Number(a.playcount), url: a.url })),
    total: Number(data.topartists?.["@attr"]?.total ?? 0),
  };
}

export async function getTopArtists(client: LastfmClient, options: DataOptions["top"] = {}): Promise<ArtistPlays[]> {
  return (await topArtistsPage(client, options.period ?? "1month", options.limit ?? 5)).artists;
}

/** Scrobbles since a unix timestamp; Last.fm reports the total in the paging metadata. */
async function scrobblesSince(client: LastfmClient, from: number): Promise<number> {
  const data = await client.call<{ recenttracks?: { "@attr"?: { total?: string } } }>({
    method: "user.getRecentTracks",
    user: client.username,
    from: String(Math.floor(from)),
    limit: "1",
  });
  return Number(data.recenttracks?.["@attr"]?.total ?? 0);
}

async function topTrack(client: LastfmClient): Promise<TrackPlays | null> {
  const data = await client.call<{
    toptracks?: { track?: { name: string; url: string; playcount: string; artist: { name: string } }[] };
  }>({ method: "user.getTopTracks", user: client.username, period: "6month", limit: "1" });
  const t = data.toptracks?.track?.[0];
  return t ? { name: t.name, artist: t.artist.name, plays: Number(t.playcount), url: t.url } : null;
}

/**
 * Six-month taste report. Costs five list requests plus one tag request per
 * distinct artist across both windows (about 60-80 with the default 50).
 */
export async function getTasteReport(client: LastfmClient, options: TasteOptions = {}): Promise<TasteReport | null> {
  const limit = options.artists ?? 50;
  const now = Date.now() / 1000;
  const [period, recent, scrobblesPeriod, scrobblesRecent, track] = await Promise.all([
    topArtistsPage(client, "6month", limit),
    topArtistsPage(client, "1month", limit),
    scrobblesSince(client, now - PERIOD_DAYS * DAY),
    scrobblesSince(client, now - RECENT_DAYS * DAY),
    topTrack(client),
  ]);

  const names = new Map<string, string>();
  for (const a of [...period.artists, ...recent.artists]) names.set(a.name.toLowerCase(), a.name);
  const queue = [...names.values()];
  const tags = new Map<string, string[]>();
  await Promise.all(
    Array.from({ length: Math.min(client.concurrency, queue.length) }, async () => {
      for (let name = queue.shift(); name !== undefined; name = queue.shift())
        tags.set(name.toLowerCase(), cleanTags(await client.artistTags(name), name, options.tags));
    }),
  );

  return analyzeTaste({
    period: period.artists,
    recent: recent.artists,
    tags,
    scrobbles: { period: scrobblesPeriod, recent: scrobblesRecent },
    periodDays: PERIOD_DAYS,
    artistsTotal: period.total,
    topTrack: track,
  });
}

/** Loads the requested sections in parallel. A section that fails comes back as null so the rest still render. */
export async function getWidgetData(
  client: LastfmClient,
  sections: readonly Section[] = SECTIONS,
  options: DataOptions = {},
): Promise<WidgetData> {
  const loaders = {
    now: () => getRecentTrack(client),
    top: () => getTopArtists(client, options.top),
    taste: () => getTasteReport(client, options.taste),
  };
  const wanted = SECTIONS.filter((s) => sections.includes(s));
  const results = await Promise.allSettled(wanted.map((s) => loaders[s]()));
  return Object.fromEntries(wanted.map((s, i) => [s, results[i]!.status === "fulfilled" ? results[i]!.value : null]));
}
