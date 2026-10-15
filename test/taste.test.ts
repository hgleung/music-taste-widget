import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeTaste, type ArtistPlays, type TasteInput } from "../src/taste.ts";

const artists = (spec: Record<string, number>): ArtistPlays[] =>
  Object.entries(spec).map(([name, plays]) => ({ name, plays, url: `https://last.fm/${name}` }));

const tagsFor = (spec: Record<string, string[]>) => new Map(Object.entries(spec).map(([k, v]) => [k.toLowerCase(), v]));

// 6-month window: 1000 scrobbles; last 30 days: 200 of them.
const base: TasteInput = {
  period: artists({ A: 300, B: 150, C: 100, D: 80, E: 60, F: 50, G: 40, H: 30, I: 20, J: 30 }),
  recent: artists({ A: 100, K: 20, C: 10, L: 6, B: 5 }),
  tags: tagsFor({ A: ["pop"], B: ["rock"], C: ["jazz"], D: ["jazz"], E: ["jazz"], F: ["jazz"], G: ["jazz"], H: ["jazz"], I: ["jazz"], J: ["jazz"], K: ["house"], L: ["house"] }),
  scrobbles: { period: 1000, recent: 200 },
  periodDays: 182,
  artistsTotal: 120,
  topTrack: null,
};

test("needs at least five artists", () => {
  assert.equal(analyzeTaste({ ...base, period: base.period.slice(0, 4) }), null);
});

test("concentration facts are shares of all scrobbles, not just the sampled artists", () => {
  const r = analyzeTaste(base)!;
  assert.equal(r.loyalty.topArtist.share, 0.3);
  assert.equal(r.loyalty.topFiveShare, 0.69);
  assert.equal(r.loyalty.artistsForHalf, 3); // 300 + 150 + 100 >= 500
  assert.equal(r.scrobbles, 1000);
});

test("artistsForHalf is null when the sample never reaches half of all plays", () => {
  const r = analyzeTaste({ ...base, scrobbles: { period: 5000, recent: 200 } })!;
  assert.equal(r.loyalty.artistsForHalf, null);
});

test("rising artists use the list cutoff as an upper bound for unseen earlier plays", () => {
  const r = analyzeTaste(base)!;
  // K: 10% now vs at most 30/800 before -> rising. L: 3% now vs at most 3.75% before -> not proven.
  assert.deepEqual(r.rising.map((m) => m.name), ["A", "K"]);
  assert.equal(r.rising[0]!.before, 0.25);
  assert.equal(r.rising[0]!.now, 0.5);
});

test("cooling artists missing from the recent list count as playing the recent cutoff", () => {
  const r = analyzeTaste(base)!;
  // D: 75/800 before vs at most 5/200 now -> cooled. E: 55/800 vs 5/200 isn't a drop to a third.
  assert.deepEqual(r.cooling.map((m) => m.name), ["B", "D"]);
});

test("drift reports genres that gained share in the last 30 days", () => {
  const r = analyzeTaste(base)!;
  assert.ok(r.drift && r.drift.score > 0);
  assert.equal(r.drift.rising[0]?.genre, "house");
});

test("no history before the last 30 days means no drift or artist movement", () => {
  const r = analyzeTaste({ ...base, scrobbles: { period: 1000, recent: 1000 } })!;
  assert.equal(r.drift, null);
  assert.deepEqual([r.rising, r.cooling], [[], []]);
});

test("a single-genre, top-heavy, unchanging listener is a Loyalist described with their own data", () => {
  const period = artists({ Yel: 1000, B: 5, C: 4, D: 3, E: 2 });
  const r = analyzeTaste({
    ...base,
    period,
    recent: artists({ Yel: 200, B: 1, C: 1, D: 1, E: 1 }),
    tags: tagsFor({ Yel: ["k-indie"], B: ["k-indie"], C: ["k-indie"], D: ["k-indie"], E: ["k-indie"] }),
    scrobbles: { period: 1014, recent: 204 },
  })!;
  assert.equal(r.drift?.score, 0);
  assert.equal(r.archetype.name, "The Loyalist");
  assert.match(r.archetype.description, /k-indie and Yel/);
});
