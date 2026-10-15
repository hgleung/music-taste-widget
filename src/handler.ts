import { getWidgetData, SECTIONS, type DataOptions, type Section } from "./data.ts";
import { createClient, type ClientOptions } from "./lastfm.ts";

export interface HandlerOptions extends ClientOptions, DataOptions {
  /** Sections this endpoint will serve. Default: all. */
  sections?: readonly Section[];
  /** CDN cache lifetime in seconds per section; a response uses the shortest among those requested. */
  cache?: Partial<Record<Section, number>>;
}

const DEFAULT_CACHE: Record<Section, number> = { now: 60, top: 3600, taste: 21600 };
const FAILURE_CACHE = 60;

/**
 * A standard `(Request) => Promise<Response>` JSON endpoint for <music-taste-widget>.
 * `?sections=now,top` narrows the response. Mount it on any runtime with the
 * Fetch API: Astro and Next.js route handlers, Cloudflare Workers, Deno, Bun.
 */
export function createHandler(options: HandlerOptions): (request: Request) => Promise<Response> {
  const client = createClient(options);
  const allowed = options.sections ?? SECTIONS;
  const cache = { ...DEFAULT_CACHE, ...options.cache };

  return async (request) => {
    const param = new URL(request.url).searchParams.get("sections");
    const asked = param?.split(",").map((s) => s.trim());
    const sections = asked ? allowed.filter((s) => asked.includes(s)) : allowed;
    if (!sections.length) return Response.json({ error: `sections must include one of: ${allowed.join(", ")}` }, { status: 400 });

    const data = await getWidgetData(client, sections, options);
    // Don't let a failed section sit in the CDN for hours.
    const failed = sections.some((s) => data[s] === null);
    const ttl = Math.min(...sections.map((s) => cache[s]), failed ? FAILURE_CACHE : Infinity);
    return Response.json(data, {
      headers: { "Cache-Control": `public, max-age=0, s-maxage=${ttl}, stale-while-revalidate=${ttl * 5}` },
    });
  };
}
