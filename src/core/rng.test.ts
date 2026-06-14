import { describe, expect, it } from 'vitest';
import { Rng } from './rng.js';

describe('Rng', () => {
  it('is deterministic for the same seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it('produces different sequences for different seeds', () => {
    const a = new Rng(42);
    const b = new Rng(43);
    const as = Array.from({ length: 10 }, () => a.next());
    const bs = Array.from({ length: 10 }, () => b.next());
    expect(as).not.toEqual(bs);
  });

  it('next() is in [0, 1)', () => {
    const r = new Rng(123);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('range() respects bounds', () => {
    const r = new Rng(7);
    for (let i = 0; i < 100; i++) {
      const v = r.range(5, 10);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThan(10);
    }
  });

  it('weighted() respects probabilities', () => {
    const r = new Rng(99);
    const counts: Record<string, number> = { a: 0, b: 0 };
    for (let i = 0; i < 5000; i++) {
      const v = r.weighted([['a', 1], ['b', 9]]);
      counts[v]++;
    }
    // b should be ~9x of a; tolerate wide range.
    expect(counts.b).toBeGreaterThan(counts.a * 5);
  });

  it('handles seed=0 without degenerating', () => {
    const r = new Rng(0);
    expect(r.next()).toBeGreaterThan(0); // not stuck at 0
    expect(r.next()).toBeLessThan(1);
  });
});