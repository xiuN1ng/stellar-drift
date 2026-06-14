/**
 * Performance benchmarks for core systems.
 *
 * Run with `vitest` in node env (no DOM). These are smoke tests that
 * establish upper bounds on critical operations.
 *
 * Baselines (calibrated on a modern desktop, 2024):
 *  - generateGalaxy  (200 stars):     < 50ms
 *  - generateSurface (64×64 heightmap): < 100ms
 *  - 100 galaxy generations in series: < 5s
 *
 * Mobile baselines (iPhone 12 / Pixel 6):
 *  - generateGalaxy: < 200ms
 *  - generateSurface: < 400ms
 *
 * If a benchmark regresses by > 50%, fail the test.
 */

import { describe, expect, it } from 'vitest';
import { generateGalaxy } from '@pcg/galaxy.js';
import { generateSurface } from '@pcg/planet.js';
import { generatePalette } from '@pcg/palette.js';
import type { PlanetRecord } from '@game-types/index';

const REGRESSION_FACTOR = 1.5; // 50% slack above baseline

function makePlanet(seed: number, overrides: Partial<PlanetRecord> = {}): PlanetRecord {
  return {
    id: 'bench-planet',
    name: 'Bench',
    class: 'rocky-ocean',
    biomes: ['ocean', 'plains', 'forest'],
    radius: 1.5,
    orbitRadius: 50,
    orbitPeriod: 100,
    seed,
    resources: [{ kind: 'iron', richness: 0.8 }, { kind: 'water', richness: 0.6 }],
    hasAtmosphere: true,
    hasWater: true,
    hasLife: true,
    ...overrides,
  };
}

describe('PCG benchmarks (desktop baseline)', () => {
  it('generateGalaxy (200 stars) < 75ms', () => {
    const t0 = performance.now();
    const g = generateGalaxy({ x: 5, y: 5, z: 5 });
    const t1 = performance.now();
    expect(g.starCount).toBeGreaterThanOrEqual(180);
    expect(g.stars.length).toBeGreaterThan(0);
    expect(t1 - t0).toBeLessThan(50 * REGRESSION_FACTOR);
  });

  it('generateSurface (64×64 heightmap) < 150ms', () => {
    const planet = makePlanet(12345);
    const t0 = performance.now();
    const s = generateSurface(planet);
    const t1 = performance.now();
    expect(s.gridSize).toBe(64);
    expect(t1 - t0).toBeLessThan(100 * REGRESSION_FACTOR);
  });

  it('generatePalette < 5ms', () => {
    const t0 = performance.now();
    for (let i = 0; i < 1000; i++) {
      generatePalette(i);
    }
    const t1 = performance.now();
    const perCall = (t1 - t0) / 1000;
    expect(perCall).toBeLessThan(5 * REGRESSION_FACTOR);
  });

  it('100 galaxies in series < 5s', () => {
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) {
      generateGalaxy({ x: i, y: i * 2, z: i * 3 });
    }
    const t1 = performance.now();
    expect(t1 - t0).toBeLessThan(5000);
  });

  it('planet surface is reusable (10 regenerations < 1s)', () => {
    const planet = makePlanet(42);
    const t0 = performance.now();
    for (let i = 0; i < 10; i++) {
      generateSurface(planet);
    }
    const t1 = performance.now();
    expect(t1 - t0).toBeLessThan(1000);
  });

  it('surface determinism: 10 generations produce same shape', () => {
    const planet = makePlanet(7777);
    const reference = generateSurface(planet);
    for (let i = 0; i < 10; i++) {
      const s = generateSurface(planet);
      expect(s.heights[100]).toBeCloseTo(reference.heights[100], 5);
      expect(s.seaLevel).toBeCloseTo(reference.seaLevel, 5);
    }
  });
});

describe('PCG benchmarks (mobile budget)', () => {
  // Mobile baselines are looser.
  const MOBILE_FACTOR = 3;

  it('generateGalaxy (mobile) < 150ms', () => {
    const t0 = performance.now();
    generateGalaxy({ x: 10, y: 20, z: 30 });
    const t1 = performance.now();
    expect(t1 - t0).toBeLessThan(50 * MOBILE_FACTOR);
  });

  it('generateSurface (mobile) < 300ms', () => {
    const planet = makePlanet(12345);
    const t0 = performance.now();
    generateSurface(planet);
    const t1 = performance.now();
    expect(t1 - t0).toBeLessThan(100 * MOBILE_FACTOR);
  });
});