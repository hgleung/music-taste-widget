import assert from "node:assert/strict";
import { test } from "node:test";
import { createHandler } from "../src/handler.ts";

// Answers user.getRecentTracks and user.getTopArtists; everything else fails.
const fakeFetch = (async (input: URL | RequestInfo) => {
  const method = new URL(String(input)).searchParams.get("method");
  if (method === "user.getRecentTracks")
    return Response.json({ recenttracks: { track: [{ name: "t", url: "u", artist: { "#text": "a" }, "@attr": { nowplaying: "true" } }] } });
  if (method === "user.getTopArtists") return Response.json({ topartists: { artist: [{ name: "Yel", playcount: "231", url: "u" }] } });
  return Response.json({ error: 29, message: "Rate limit exceeded" }, { status: 429 });
}) as typeof fetch;

const handler = createHandler({ apiKey: "k", username: "u", fetch: fakeFetch, sections: ["now", "top"] });

test("serves only requested sections that the endpoint allows", async () => {
  const res = await handler(new Request("https://site/api?sections=top,taste"));
  assert.deepEqual(Object.keys(await res.json()), ["top"]);
});

test("rejects requests naming no allowed section", async () => {
  assert.equal((await handler(new Request("https://site/api?sections=taste"))).status, 400);
});

test("cache lifetime is the shortest among requested sections", async () => {
  const res = await handler(new Request("https://site/api"));
  assert.equal(res.headers.get("Cache-Control"), "public, max-age=0, s-maxage=60, stale-while-revalidate=300");
  const top = await handler(new Request("https://site/api?sections=top"));
  assert.match(top.headers.get("Cache-Control")!, /s-maxage=3600,/);
});

test("a failed section comes back null and shortens the cache", async () => {
  const res = await createHandler({ apiKey: "k", username: "u", fetch: fakeFetch })(new Request("https://site/api?sections=top,taste"));
  const body = await res.json();
  assert.equal(body.taste, null);
  assert.equal(body.top[0].name, "Yel");
  assert.match(res.headers.get("Cache-Control")!, /s-maxage=60,/);
});
