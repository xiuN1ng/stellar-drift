/**
 * Mulberry32: a tiny, deterministic 32-bit PRNG.
 *
 * Pass the same seed -> get the same sequence forever.
 * Use this everywhere instead of Math.random so PCG output is reproducible.
 *
 * Ref: https://gist.github.com/tommyettinger/46a3a48b8e3e0b6e2ce4a8b9f6e7d2c1
 */

export class Rng {
  private state: number;

  constructor(seed: number) {
    // Avoid 0 state (Mulberry32 degenerates). Force a non-zero starting value.
    this.state = (seed === 0 ? 0xdeadbeef : seed) >>> 0;
  }

  /** Returns uint32 in [0, 2^32). */
  nextUint32(): number {
    let t = (this.state += 0x6d2b79f5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  /** Float in [0, 1). */
  next(): number {
    return this.nextUint32() / 0x100000000;
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Integer in [min, max] inclusive. */
  intRange(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** Pick one element from an array uniformly. */
  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('Rng.pick: empty array');
    return arr[this.intRange(0, arr.length - 1)];
  }

  /** Pick one element with weighted probabilities. */
  weighted<T>(arr: readonly [T, number][]): T {
    const total = arr.reduce((s, [, w]) => s + w, 0);
    let r = this.next() * total;
    for (const [v, w] of arr) {
      r -= w;
      if (r <= 0) return v;
    }
    return arr[arr.length - 1][0];
  }

  /** Boolean with given probability of true. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Derive a child Rng with a deterministic sub-seed. */
  child(salt: number): Rng {
    return new Rng((this.nextUint32() ^ (salt | 0)) >>> 0);
  }
}