import { genreVector, giniCoefficient, jensenShannonDivergence, normalizedEntropy, type Distribution } from "./metrics.ts";

export interface ArtistPlays {
  name: string;
  plays: number;
  url: string;
}

export interface TrackPlays {
  name: string;
  artist: string;
  plays: number;
  url: string;
}

export interface TasteInput {
  /** Top artists over the long window (Last.fm "6month"), most played first. */
  period: readonly ArtistPlays[];
  /** Top artists over the last 30 days (Last.fm "1month"), most played first. */
  recent: readonly ArtistPlays[];
  /** Cleaned tags, keyed by lowercased artist name. */
  tags: ReadonlyMap<string, readonly string[]>;
  /** Total scrobbles in each window. `recent` is part of `period`. */
  scrobbles: { period: number; recent: number };
  /** Days in the long window, for the per-day rate. */
  periodDays: number;
  /** Distinct artists played in the long window. */
  artistsTotal: number;
  topTrack: TrackPlays | null;
}

export type Archetype = "The Loyalist" | "The Explorer" | "The Specialist" | "The Phase Shifter" | "The Deep Diver";

export interface GenreShare {
  genre: string;
  share: number;
}

export interface GenreShift {
  genre: string;
  /** Recent share minus earlier share, in [-1, 1]. */
  change: number;
}

export interface ArtistShare {
  name: string;
  url: string;
  share: number;
}

export interface ArtistMove {
  name: string;
  url: string;
  /** Share of plays before the last 30 days. */
  before: number;
  /** Share of plays in the last 30 days. */
  now: number;
}

export interface TasteReport {
  archetype: { name: Archetype; description: string };
  /** Normalized Shannon entropy of the genre distribution. */
  diversity: { score: number; label: string; genres: number; topGenres: GenreShare[] };
  /** Gini coefficient over top-artist playcounts, plus plain-language concentration facts. */
  loyalty: {
    score: number;
    label: string;
    topArtist: ArtistShare;
    topFiveShare: number;
    /** Fewest artists that together cover half of all plays; null if the sampled artists don't reach half. */
    artistsForHalf: number | null;
  };
  /** Jensen-Shannon divergence between the last 30 days and the months before. Null without enough history. */
  drift: { score: number; label: string; rising: GenreShift[]; falling: GenreShift[] } | null;
  /** Artists whose share of plays at least doubled in the last 30 days. */
  rising: ArtistMove[];
  /** Earlier favorites whose share of plays fell to a third or less in the last 30 days. */
  cooling: ArtistMove[];
  topTrack: TrackPlays | null;
  scrobbles: number;
  perDay: number;
  artistsTotal: number;
  artistsSampled: number;
}

const MIN_ARTISTS = 5;
const MIN_MOVE_PLAYS = 5;
const MIN_MOVE_SHARE = 0.02;
const MIN_GENRE_SHIFT = 0.02;

const diversityLabel = (d: number) =>
  d < 0.3 ? "niche listener" : d < 0.5 ? "a few key genres" : d < 0.7 ? "balanced explorer" : d < 0.85 ? "wide-ranging taste" : "listens to everything";

const loyaltyLabel = (g: number) =>
  g > 0.7 ? "a handful of artists dominate" : g > 0.5 ? "clear favorites, some variety" : g > 0.3 ? "no single artist dominates" : "spread very evenly";

const driftLabel = (j: number) =>
  j < 0.05 ? "steady lately" : j < 0.1 ? "small shifts lately" : j < 0.2 ? "noticeably different lately" : "a big change lately";

/**
 * Builds the taste report. Diversity, loyalty, drift and archetype rules follow
 * Music Taste Visualizer; drift compares the last 30 days with the rest of the
 * window instead of month-by-month charts, so it needs no extra requests.
 * Returns null with fewer than five artists.
 */
export function analyzeTaste(input: TasteInput): TasteReport | null {
  const { period, recent, tags, scrobbles } = input;
  if (period.length < MIN_ARTISTS) return null;

  const tagsOf = (name: string) => tags.get(name.toLowerCase()) ?? [];
  const recentPlays = new Map(recent.map((a) => [a.name.toLowerCase(), a.plays]));
  const periodPlays = new Map(period.map((a) => [a.name.toLowerCase(), a.plays]));
  // Lists are truncated: an artist missing from one played at most as much as its last entry.
  const periodFloor = period.at(-1)!.plays;
  const recentFloor = recent.at(-1)?.plays ?? 0;

  const vector = genreVector(period.map((a) => ({ plays: a.plays, tags: tagsOf(a.name) })));
  const byShare = [...vector].sort((x, y) => y[1] - x[1]);
  const topGenres = byShare.slice(0, 5).map(([genre, share]) => ({ genre, share }));
  const diversity = normalizedEntropy(vector);

  const total = Math.max(scrobbles.period, period.reduce((s, a) => s + a.plays, 0));
  const loyalty = giniCoefficient(period.map((a) => a.plays).filter((p) => p > 0));
  let covered = 0;
  const half = period.findIndex((a) => (covered += a.plays) >= total / 2);
  const top = period[0]!;

  // Earlier = the long window minus the last 30 days.
  const earlierTotal = scrobbles.period - scrobbles.recent;
  const hasHistory = earlierTotal > 0 && scrobbles.recent > 0 && recent.length > 0;

  let drift: TasteReport["drift"] = null;
  const rising: ArtistMove[] = [];
  const cooling: ArtistMove[] = [];

  if (hasHistory) {
    const earlier = genreVector(
      period.map((a) => ({ plays: a.plays - (recentPlays.get(a.name.toLowerCase()) ?? 0), tags: tagsOf(a.name) })),
    );
    const lately = genreVector(recent.map((a) => ({ plays: a.plays, tags: tagsOf(a.name) })));
    if (earlier.size > 0 && lately.size > 0) {
      const score = jensenShannonDivergence(lately, earlier);
      const shifts = genreShifts(lately, earlier);
      drift = {
        score,
        label: driftLabel(score),
        rising: shifts.filter((s) => s.change >= MIN_GENRE_SHIFT).slice(0, 2),
        falling: shifts.filter((s) => s.change <= -MIN_GENRE_SHIFT).reverse().slice(0, 2),
      };
    }

    // Both lists use the conservative bound for missing entries, so neither overstates a move.
    for (const a of recent) {
      if (a.plays < MIN_MOVE_PLAYS) continue;
      const inPeriod = periodPlays.get(a.name.toLowerCase());
      const before = (inPeriod === undefined ? periodFloor : Math.max(0, inPeriod - a.plays)) / earlierTotal;
      const now = a.plays / scrobbles.recent;
      if (now >= MIN_MOVE_SHARE && now >= 2 * before) rising.push({ name: a.name, url: a.url, before, now });
    }
    for (const a of period.slice(0, 10)) {
      const recentUpper = recentPlays.get(a.name.toLowerCase()) ?? recentFloor;
      const before = Math.max(0, a.plays - recentUpper) / earlierTotal;
      const now = recentUpper / scrobbles.recent;
      if (before >= MIN_MOVE_SHARE && now <= before / 3) cooling.push({ name: a.name, url: a.url, before, now });
    }
    rising.sort((x, y) => y.now - y.before - (x.now - x.before));
    cooling.sort((x, y) => y.before - y.now - (x.before - x.now));
  }

  return {
    archetype: classify({
      diversity,
      loyalty,
      drift: drift?.score ?? null,
      genres: topGenres.map((g) => g.genre),
      genreCount: vector.size,
      artists: period.map((a) => a.name),
      artistsTotal: input.artistsTotal,
      risingGenre: drift?.rising[0]?.genre,
    }),
    diversity: { score: diversity, label: diversityLabel(diversity), genres: vector.size, topGenres },
    loyalty: {
      score: loyalty,
      label: loyaltyLabel(loyalty),
      topArtist: { name: top.name, url: top.url, share: top.plays / total },
      topFiveShare: period.slice(0, 5).reduce((s, a) => s + a.plays, 0) / total,
      artistsForHalf: half === -1 ? null : half + 1,
    },
    drift,
    rising: rising.slice(0, 3),
    cooling: cooling.slice(0, 3),
    topTrack: input.topTrack,
    scrobbles: total,
    perDay: total / input.periodDays,
    artistsTotal: Math.max(input.artistsTotal, period.length),
    artistsSampled: period.length,
  };
}

/** Per-genre share change, largest gain first. */
function genreShifts(lately: Distribution, earlier: Distribution): GenreShift[] {
  return [...new Set([...lately.keys(), ...earlier.keys()])]
    .map((genre) => ({ genre, change: (lately.get(genre) ?? 0) - (earlier.get(genre) ?? 0) }))
    .sort((x, y) => y.change - x.change);
}

interface ClassifyInput {
  diversity: number;
  loyalty: number;
  drift: number | null;
  genres: string[];
  genreCount: number;
  artists: string[];
  artistsTotal: number;
  risingGenre: string | undefined;
}

/** Music Taste Visualizer's archetype rules, with descriptions filled in from the listener's own data. */
function classify(m: ClassifyInput): TasteReport["archetype"] {
  const highEntropy = m.diversity > 0.6;
  const lowEntropy = m.diversity < 0.4;
  const highGini = m.loyalty > 0.55;
  const lowGini = m.loyalty < 0.35;
  // Without drift data neither drift condition holds.
  const highDrift = m.drift !== null && m.drift > 0.15;
  const lowDrift = m.drift !== null && m.drift < 0.08;

  const [g1 = "one sound", g2 = "a few others"] = m.genres;
  const [a1, a2] = m.artists as [string, string];
  const genres = `${m.genreCount} genres`;

  if (lowEntropy && highGini && lowDrift)
    return { name: "The Loyalist", description: `A tight rotation built on ${g1} and ${a1}, barely changing month to month.` };
  if (highEntropy && lowGini && highDrift)
    return { name: "The Explorer", description: `Always moving: ${genres}, ${m.artistsTotal} artists, and a mix that keeps shifting.` };
  if (highEntropy && highGini && lowDrift)
    return { name: "The Specialist", description: `Listens widely across ${genres} but keeps coming back to ${a1} and ${a2}.` };
  if (lowEntropy && lowGini && highDrift)
    return { name: "The Phase Shifter", description: `Goes deep on one sound at a time, then moves on. Right now that's ${m.risingGenre ?? g1}.` };
  if (highEntropy && highDrift)
    return { name: "The Explorer", description: `Broad and restless: ${genres} in rotation, and the mix keeps changing.` };
  if (highGini && lowDrift)
    return { name: "The Deep Diver", description: `Goes deep on a few artists, ${a1} above all, and stays there.` };
  return { name: "The Specialist", description: `Balanced: ${g1} and ${g2} at the center, with room for ${a1}, ${a2} and plenty else.` };
}
