import { SECTIONS, type RecentTrack, type Section, type WidgetData } from "./data.ts";
import type { ArtistPlays, TasteReport } from "./taste.ts";

export interface Headings {
  nowPlaying: string;
  lastPlayed: string;
  top: string;
  taste: string;
}

export interface RenderOptions {
  /** Section slots, in order. Empty or unavailable sections render hidden so the element can fill them later. */
  sections?: readonly Section[];
  headings?: Partial<Headings>;
  /** Footnote crediting Music Taste Visualizer. Default true. */
  attribution?: boolean;
}

const DEFAULT_HEADINGS: Headings = {
  nowPlaying: "Listening now",
  lastPlayed: "Last played",
  top: "Top artists this month",
  taste: "Taste, last 6 months",
};

const VISUALIZER_URL = "https://github.com/hgleung/music-taste";
const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s: string | number) => String(s).replace(/[&<>"']/g, (c) => ESCAPES[c]!);

const pct = (v: number) => (v > 0 && v < 0.005 ? "<1%" : `${Math.round(v * 100)}%`);
const int = (v: number) => Math.round(v).toLocaleString("en-US");
const link = (href: string, text: string, cls = "") =>
  `<a${cls && ` class="${cls}"`} href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`;
const bar = (v: number) =>
  `<span class="mtw-bar" aria-hidden="true"><span class="mtw-fill" style="width:${(Math.min(1, Math.max(0, v)) * 100).toFixed(1)}%"></span></span>`;

/** "5m ago", "8h ago", "3d ago". */
export function formatAgo(unix: number, now = Date.now() / 1000): string {
  const mins = Math.round((now - unix) / 60);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}

/** The whole widget as an HTML string. Works anywhere strings become markup (SSR, templates, innerHTML). */
export function renderWidget(data: WidgetData, options: RenderOptions = {}): string {
  const sections = options.sections ?? SECTIONS;
  // Options ride along in the markup so <music-taste-widget> re-renders sections the same way.
  const config = esc(JSON.stringify({ ...options, sections }));
  return `<div class="mtw" data-mtw-options="${config}">${sections.map((s) => renderSection(s, data, options)).join("")}</div>`;
}

export function renderSection(section: Section, data: WidgetData, options: RenderOptions = {}): string {
  const h = { ...DEFAULT_HEADINGS, ...options.headings };
  const body =
    section === "now" ? data.now && nowSection(data.now, h)
    : section === "top" ? data.top?.length && topSection(data.top, h.top)
    : data.taste && tasteSection(data.taste, h.taste, options);
  return body
    ? `<section class="mtw-section" data-mtw-section="${section}">${body}</section>`
    : `<section class="mtw-section" data-mtw-section="${section}" hidden></section>`;
}

function nowSection(t: RecentTrack, h: Headings): string {
  const label = t.nowPlaying
    ? esc(h.nowPlaying)
    : t.playedAt
      ? `${esc(h.lastPlayed)}, <time datetime="${new Date(t.playedAt * 1000).toISOString()}" data-mtw-ago="${t.playedAt}">${formatAgo(t.playedAt)}</time>`
      : esc(h.lastPlayed);
  return (
    `<h3 class="mtw-heading">${label}</h3>` +
    `<a class="mtw-track" href="${esc(t.url)}" target="_blank" rel="noopener noreferrer">` +
    `<span class="mtw-track-name">${esc(t.track)}</span><span class="mtw-track-artist">${esc(t.artist)}</span></a>`
  );
}

function topSection(artists: ArtistPlays[], heading: string): string {
  const rows = artists
    .map((a, i) => `<li class="mtw-row"><span class="mtw-rank">${i + 1}</span>${link(a.url, a.name, "mtw-name")}<span class="mtw-num">${int(a.plays)}</span></li>`)
    .join("");
  return `<h3 class="mtw-heading">${esc(heading)}</h3><ol class="mtw-list">${rows}</ol>`;
}

function metric(name: string, score: number, detail: string): string {
  return (
    `<div class="mtw-metric"><div class="mtw-row"><span class="mtw-name">${esc(name)}</span><span class="mtw-num">${pct(score)}</span></div>` +
    `${bar(score)}<p class="mtw-detail">${detail}</p></div>`
  );
}

function tasteSection(t: TasteReport, heading: string, options: RenderOptions): string {
  const { diversity: d, loyalty: l, drift } = t;

  let driftDetail = "";
  if (drift) {
    const shifts = [
      drift.rising.length ? `more ${drift.rising.map((s) => esc(s.genre)).join(" and ")}` : "",
      drift.falling.length ? `less ${drift.falling.map((s) => esc(s.genre)).join(" and ")}` : "",
    ].filter(Boolean);
    driftDetail = `${esc(drift.label)}${shifts.length ? `: ${shifts.join(", ")}` : ""}`;
  }

  const genres = d.topGenres
    .map((g) => `<li class="mtw-genre"><span class="mtw-name">${esc(g.genre)}</span>${bar(g.share / (d.topGenres[0]?.share || 1))}<span class="mtw-num">${pct(g.share)}</span></li>`)
    .join("");

  return (
    `<h3 class="mtw-heading">${esc(heading)}</h3>` +
    `<p class="mtw-archetype">${esc(t.archetype.name)}</p>` +
    `<p class="mtw-detail">${esc(t.archetype.description)}</p>` +
    `<div class="mtw-metrics">` +
    metric("Diversity", d.score, `${esc(d.label)} across ${int(d.genres)} genres`) +
    metric("Loyalty", l.score, `${esc(l.label)}; ${link(l.topArtist.url, l.topArtist.name)} is ${pct(l.topArtist.share)} of plays`) +
    (drift ? metric("Drift", drift.score, driftDetail) : "") +
    `</div>` +
    (genres ? `<div class="mtw-block"><h4 class="mtw-subheading">Top genres</h4><ol class="mtw-list">${genres}</ol></div>` : "") +
    (options.attribution ?? true
      ? `<p class="mtw-footnote">From the top ${t.artistsSampled} artists, scored with ${link(VISUALIZER_URL, "Music Taste Visualizer")}'s method.</p>`
      : "")
  );
}
