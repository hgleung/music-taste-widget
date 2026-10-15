/*
 * Last.fm artist tags are crowd-sourced: alongside genres they carry
 * nationalities, descriptors ("female vocalists"), personal labels ("seen live"),
 * decades and near-duplicate spellings ("Kpop", "k-pop"). Music Taste Visualizer
 * feeds them in as-is; this widget cleans them first so genre shares and
 * diversity describe sound rather than metadata.
 */

export interface RawTag {
  name: string;
  count: number;
}

export interface TagOptions {
  /** Drop tags whose Last.fm relevance (0-100) is below this. Default 5. */
  minTagCount?: number;
  /** Extra tags to ignore (case-insensitive), on top of the built-in list. */
  ignoreTags?: readonly string[];
  /** Skip all cleanup except lowercasing; reproduces Music Taste Visualizer's genre vector. */
  raw?: boolean;
}

const ALIASES: Record<string, string> = {
  kpop: "k-pop",
  "k pop": "k-pop",
  jpop: "j-pop",
  "j pop": "j-pop",
  cpop: "c-pop",
  mandopop: "c-pop",
  rnb: "r&b",
  "r and b": "r&b",
  "r'n'b": "r&b",
  "r n b": "r&b",
  "rhythm and blues": "r&b",
  "contemporary r&b": "r&b",
  krnb: "k-r&b",
  "k-rnb": "k-r&b",
  "hip hop": "hip-hop",
  hiphop: "hip-hop",
  lofi: "lo-fi",
  "lo fi": "lo-fi",
  synthpop: "synth-pop",
  "synth pop": "synth-pop",
  "electro pop": "electropop",
  "electro-pop": "electropop",
  "drum n bass": "drum and bass",
  "drum & bass": "drum and bass",
  dnb: "drum and bass",
  "indie-pop": "indie pop",
  "indie-rock": "indie rock",
  "alt rock": "alternative rock",
  "dream-pop": "dream pop",
  "post rock": "post-rock",
  "singer songwriter": "singer-songwriter",
  electronica: "electronic",
};

const IGNORED: Record<string, true> = {
  // Personal labels and descriptors
  "seen live": true, live: true, favorites: true, favourites: true, favorite: true, favourite: true,
  "my favorite": true, "my favourite": true, love: true, awesome: true, beautiful: true, amazing: true,
  "albums i own": true, "under 2000 listeners": true, spotify: true, all: true, unknown: true,
  "female vocalists": true, "female vocalist": true, "male vocalists": true, "male vocalist": true,
  singer: true, vocalist: true, "girl group": true, "boy band": true, "boy group": true,
  // Places and nationalities
  american: true, usa: true, us: true, "united states": true, canadian: true, canada: true,
  british: true, uk: true, "united kingdom": true, english: true, england: true, scottish: true,
  irish: true, australian: true, australia: true, "new zealand": true, korean: true, korea: true,
  "south korea": true, "south korean": true, japanese: true, japan: true, chinese: true, china: true,
  taiwanese: true, taiwan: true, "hong kong": true, singapore: true, singaporean: true,
  indonesian: true, indonesia: true, filipino: true, philippines: true, thai: true, vietnamese: true,
  malaysian: true, indian: true, german: true, germany: true, french: true, france: true,
  swedish: true, sweden: true, norwegian: true, norway: true, danish: true, finnish: true,
  icelandic: true, iceland: true, dutch: true, netherlands: true, belgian: true, estonian: true,
  polish: true, russian: true, italian: true, spanish: true, brazilian: true, brazil: true,
  mexican: true, "los angeles": true, "new york": true, london: true, california: true,
};

const DECADE = /^(?:\d{2}|\d{4})s?$/;

/** Cleaned, de-duplicated tag names in relevance order. */
export function cleanTags(tags: readonly RawTag[], artist: string, options: TagOptions = {}): string[] {
  const out: string[] = [];
  const self = artist.toLowerCase().trim();
  const extra = new Set(options.ignoreTags?.map((t) => t.toLowerCase().trim()));
  const minCount = options.minTagCount ?? 5;

  for (const t of tags) {
    if (!(t.count > 0)) continue;
    let name = t.name.toLowerCase().trim().replace(/\s+/g, " ");
    if (!options.raw) {
      if (t.count < minCount) continue;
      name = ALIASES[name] ?? name;
      if (IGNORED[name] || DECADE.test(name) || name === self || extra.has(name)) continue;
    }
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}
