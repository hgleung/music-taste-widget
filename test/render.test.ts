import assert from "node:assert/strict";
import { test } from "node:test";
import { renderSection, renderWidget } from "../src/render.ts";

test("escapes Last.fm-supplied text and URLs", () => {
  const html = renderSection("top", { top: [{ name: `<img src=x onerror="alert(1)">`, plays: 3, url: `https://x/"><script>` }] });
  assert.ok(!html.includes("<img") && !html.includes("<script>"));
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
});

test("missing or unavailable sections render as hidden slots in the requested order", () => {
  const html = renderWidget({ now: null }, { sections: ["top", "now"] });
  assert.deepEqual([...html.matchAll(/data-mtw-section="(\w+)" hidden/g)].map((m) => m[1]), ["top", "now"]);
});

test("render options survive the round trip through data-mtw-options", () => {
  const options = { sections: ["now" as const], headings: { lastPlayed: `Last "heard"` }, attribution: false };
  const attr = /data-mtw-options="([^"]*)"/.exec(renderWidget({}, options))![1]!;
  const decoded = attr.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  assert.deepEqual(JSON.parse(decoded), options);
});

test("last-played tracks carry a machine-readable timestamp for live relative times", () => {
  const html = renderSection("now", { now: { track: "take my hand", artist: "riensu", url: "https://x", nowPlaying: false, playedAt: 1_700_000_000 } });
  assert.match(html, /<time datetime="2023-11-14T22:13:20.000Z" data-mtw-ago="1700000000">/);
});
