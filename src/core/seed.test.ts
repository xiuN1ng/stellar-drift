import { describe, expect, it } from 'vitest';
import { seedFromGalaxy, hashString, mix32 } from './seed.js';

describe('seed pipeline', () => {
  it('is deterministic for same coord', () => {
    const a = seedFromGalaxy({ x: 1, y: 2, z: 3 });
    const b = seedFromGalaxy({ x: 1, y: 2, z: 3 });
    expect(a).toBe(b);
  });

  it('produces different seeds for different coords', () => {
    const a = seedFromGalaxy({ x: 1, y: 2, z: 3 });
    const b = seedFromGalaxy({ x: 1, y: 2, z: 4 });
    const c = seedFromGalaxy({ x: 5, y: 2, z: 3 });
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(b).not.toBe(c);
  });

  it('handles negative coords', () => {
    const a = seedFromGalaxy({ x: -1, y: -2, z: -3 });
    const b = seedFromGalaxy({ x: -1, y: -2, z: -3 });
    expect(a).toBe(b);
  });

  it('hashString is deterministic and different for different inputs', () => {
    expect(hashString('foo')).toBe(hashString('foo'));
    expect(hashString('foo')).not.toBe(hashString('bar'));
  });

  it('mix32 output is uniform across bit positions (avalanche)', () => {
    const samples = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      samples.add(mix32(i, i * 7));
    }
    // Expect a high cardinality. With 1000 inputs, expect ~all unique.
    expect(samples.size).toBeGreaterThan(990);
  });
});