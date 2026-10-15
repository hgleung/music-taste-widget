import type { RawTag } from "./tags.ts";

const BASE = "https://ws.audioscrobbler.com/2.0/";

export type Period = "7day" | "1month" | "3month" | "6month" | "12month" | "overall";

export interface ClientOptions {
  /** Last.fm API key (https://www.last.fm/api/account/create). Keep it server-side. */
  apiKey: string;
  username: string;
  /** Parallel artist-tag requests while building a taste report. Default 4. */
  concurrency?: number;
  /** Custom fetch (tests, proxies, caching layers). Defaults to global fetch. */
  fetch?: typeof fetch;
}

export interface LastfmClient {
  readonly username: string;
  readonly concurrency: number;
  call<T>(params: Record<string, string>): Promise<T>;
  /** Raw top tags for an artist, cached for the client's lifetime; [] on failure. */
  artistTags(artist: string): Promise<RawTag[]>;
}

export function createClient(options: ClientOptions): LastfmClient {
  const doFetch = options.fetch ?? fetch;
  const tagCache = new Map<string, Promise<RawTag[]>>();

  async function call<T>(params: Record<string, string>): Promise<T> {
    const url = new URL(BASE);
    url.searchParams.set("api_key", options.apiKey);
    url.searchParams.set("format", "json");
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    const res = await doFetch(url);
    const body = (await res.json().catch(() => null)) as (T & { error?: number; message?: string }) | null;
    if (!res.ok || !body || body.error)
      throw new Error(`Last.fm ${params.method} failed: ${body?.message ?? res.status}`);
    return body;
  }

  return {
    username: options.username,
    concurrency: Math.max(1, options.concurrency ?? 4),
    call,
    artistTags(artist) {
      const key = artist.toLowerCase();
      let tags = tagCache.get(key);
      if (!tags) {
        tags = call<{ toptags?: { tag?: { name: string; count: number | string }[] } }>({
          method: "artist.getTopTags",
          artist,
          autocorrect: "1",
        }).then(
          (data) => (data.toptags?.tag ?? []).slice(0, 10).map((t) => ({ name: t.name, count: Number(t.count) })),
          () => {
            tagCache.delete(key); // retry next time instead of pinning a transient failure
            return [];
          },
        );
        tagCache.set(key, tags);
      }
      return tags;
    },
  };
}
