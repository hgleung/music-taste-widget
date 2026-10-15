import assert from "node:assert/strict";
import { test } from "node:test";
import { genreVector, giniCoefficient, jensenShannonDivergence, normalizedEntropy } from "../src/metrics.ts";

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test("gini is 0 for equal playcounts and (n-1)/n when one artist has everything", () => {
  close(giniCoefficient([5, 5, 5, 5]), 0);
  close(giniCoefficient([0, 0, 0, 10]), 0.75);
  close(giniCoefficient([]), 0);
});

test("normalized entropy spans 0 (one genre) to 1 (uniform)", () => {
  close(normalizedEntropy(new Map([["pop", 1]])), 0);
  close(normalizedEntropy(new Map(["a", "b", "c", "d"].map((k) => [k, 0.25]))), 1);
});

test("jensen-shannon divergence is 0 for identical and 1 for disjoint distributions", () => {
  const a = new Map([["pop", 0.5], ["rock", 0.5]]);
  close(jensenShannonDivergence(a, new Map(a)), 0);
  close(jensenShannonDivergence(a, new Map([["jazz", 1]])), 1);
});

test("genre vector decays by tag rank, log-weights plays, and skips unplayed artists", () => {
  const v = genreVector([
    { plays: 3, tags: ["a", "b"] }, // weight log2(4) = 2 -> a 2, b 1
    { plays: 1, tags: ["b"] }, // weight log2(2) = 1 -> b 1
    { plays: 0, tags: ["c"] },
  ]);
  close(v.get("a")!, 0.5);
  close(v.get("b")!, 0.5);
  assert.equal(v.has("c"), false);
});
