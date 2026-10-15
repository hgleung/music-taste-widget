import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanTags } from "../src/tags.ts";

const tags = (...pairs: [string, number][]) => pairs.map(([name, count]) => ({ name, count }));

test("merges spelling variants and keeps relevance order", () => {
  assert.deepEqual(cleanTags(tags(["k-pop", 100], ["Kpop", 60], ["rnb", 30], ["rhythm and blues", 20]), "aespa"), ["k-pop", "r&b"]);
});

test("drops places, descriptors, decades, the artist's own name and low-relevance tags", () => {
  const result = cleanTags(
    tags(["Korean", 100], ["seen live", 90], ["female vocalists", 80], ["2010s", 70], ["aespa", 60], ["hyperpop", 12], ["Ador", 1]),
    "aespa",
  );
  assert.deepEqual(result, ["hyperpop"]);
});

test("ignoreTags and minTagCount extend the filter", () => {
  assert.deepEqual(cleanTags(tags(["pop", 100], ["girl crush", 50], ["dance", 8]), "x", { ignoreTags: ["Girl Crush"], minTagCount: 10 }), ["pop"]);
});

test("raw mode keeps every non-zero tag, lowercased, like Music Taste Visualizer", () => {
  assert.deepEqual(cleanTags(tags(["Korean", 100], ["seen live", 1], ["junk", 0]), "x", { raw: true }), ["korean", "seen live"]);
});
