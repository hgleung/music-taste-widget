export { createClient, type ClientOptions, type LastfmClient, type Period } from "./lastfm.ts";
export {
  getRecentTrack,
  getTasteReport,
  getTopArtists,
  getWidgetData,
  SECTIONS,
  type DataOptions,
  type RecentTrack,
  type Section,
  type TasteOptions,
  type WidgetData,
} from "./data.ts";
export {
  analyzeTaste,
  type Archetype,
  type ArtistMove,
  type ArtistPlays,
  type ArtistShare,
  type GenreShare,
  type GenreShift,
  type TasteInput,
  type TasteReport,
  type TrackPlays,
} from "./taste.ts";
export { cleanTags, type RawTag, type TagOptions } from "./tags.ts";
export { genreVector, giniCoefficient, jensenShannonDivergence, normalizedEntropy, shannonEntropy, type Distribution } from "./metrics.ts";
export { formatAgo, renderSection, renderWidget, type Headings, type RenderOptions } from "./render.ts";
export { createHandler, type HandlerOptions } from "./handler.ts";
