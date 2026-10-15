/*
 * Distribution math. Formulas match Music Taste Visualizer
 * (github.com/hgleung/music-taste, src/utils/math.ts and src/metrics/genre-vector.ts).
 */

/** Category -> probability; values sum to 1 (or the map is empty). */
export type Distribution = Map<string, number>;

export function shannonEntropy(probs: Iterable<number>): number {
  let h = 0;
  for (const p of probs) if (p > 0) h -= p * Math.log2(p);
  return h;
}

/** Shannon entropy divided by its maximum, log2(categories). 0 for fewer than two categories. */
export function normalizedEntropy(dist: Distribution): number {
  return dist.size > 1 ? shannonEntropy(dist.values()) / Math.log2(dist.size) : 0;
}

/** Gini coefficient of non-negative values: 0 = perfectly even, 1 = one value holds everything. */
export function giniCoefficient(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const total = sorted.reduce((s, v) => s + v, 0);
  if (n === 0 || total === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += (2 * (i + 1) - n - 1) * sorted[i]!;
  return sum / (n * total);
}

/** Jensen-Shannon divergence (base 2, so the result is in [0, 1]) between two distributions. */
export function jensenShannonDivergence(a: Distribution, b: Distribution): number {
  let js = 0;
  for (const key of new Set([...a.keys(), ...b.keys()])) {
    const p = a.get(key) ?? 0;
    const q = b.get(key) ?? 0;
    const m = (p + q) / 2;
    if (p > 0) js += 0.5 * p * Math.log2(p / m);
    if (q > 0) js += 0.5 * q * Math.log2(q / m);
  }
  return js;
}

/**
 * Weighted genre distribution: each artist contributes log2(plays + 1), split
 * across its tags with rank decay (1, 1/2, 1/3, ...), then normalized.
 */
export function genreVector(artists: readonly { plays: number; tags: readonly string[] }[]): Distribution {
  const raw = new Map<string, number>();
  let total = 0;
  for (const a of artists) {
    if (a.plays <= 0) continue;
    const weight = Math.log2(a.plays + 1);
    a.tags.forEach((tag, i) => {
      const w = weight / (i + 1);
      raw.set(tag, (raw.get(tag) ?? 0) + w);
      total += w;
    });
  }
  if (total === 0) return new Map();
  for (const [k, v] of raw) raw.set(k, v / total);
  return raw;
}
