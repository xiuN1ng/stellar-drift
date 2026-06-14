import { describe, expect, it } from 'vitest';
import { generateSurface, SURFACE_GRID_SIZE, BIOME_ID } from './planet.js';
import type { PlanetRecord } from '@game-types/index';

function makePlanet(seed: number, overrides: Partial<PlanetRecord> = {}): PlanetRecord {
  return {
    id: 'test-planet',
    name: 'Test',
    class: 'rocky-ocean',
    biomes: ['ocean', 'plains', 'forest'],
    radius: 1.5,
    orbitRadius: 50,
    orbitPeriod: 100,
    seed,
    resources: [
      { kind: 'iron', richness: 0.8 },
      { kind: 'water', richness: 0.6 },
    ],
    hasAtmosphere: true,
    hasWater: true,
    hasLife: true,
    ...overrides,
  };
}

describe('planet surface generation', () => {
  it('is deterministic for same seed', () => {
    const p = makePlanet(12345);
    const a = generateSurface(p);
    const b = generateSurface(p);
    expect(a.heights.length).toBe(b.heights.length);
    for (let i = 0; i < a.heights.length; i++) {
      expect(a.heights[i]).toBeCloseTo(b.heights[i], 5);
    }
    expect(a.seaLevel).toBeCloseTo(b.seaLevel, 5);
  });

  it('produces different surfaces for different seeds', () => {
    const a = generateSurface(makePlanet(1));
    const b = generateSurface(makePlanet(2));
    // Some height sample should differ
    let anyDiff = false;
    for (let i = 0; i < a.heights.length; i += 100) {
      if (Math.abs(a.heights[i] - b.heights[i]) > 0.01) {
        anyDiff = true;
        break;
      }
    }
    expect(anyDiff).toBe(true);
  });

  it('heightmap is normalized to roughly [-1, 1]', () => {
    const s = generateSurface(makePlanet(42));
    for (let i = 0; i < s.heights.length; i++) {
      expect(s.heights[i]).toBeGreaterThanOrEqual(-1.01);
      expect(s.heights[i]).toBeLessThanOrEqual(1.01);
    }
  });

  it('has correct grid size', () => {
    const s = generateSurface(makePlanet(42));
    expect(s.gridSize).toBe(SURFACE_GRID_SIZE);
    expect(s.heights.length).toBe(SURFACE_GRID_SIZE * SURFACE_GRID_SIZE);
    expect(s.biomes.length).toBe(SURFACE_GRID_SIZE * SURFACE_GRID_SIZE);
  });

  it('moon class skews surface lower', () => {
    const moon = generateSurface(makePlanet(7, { class: 'moon' }));
    const planet = generateSurface(makePlanet(7, { class: 'rocky-ocean' }));
    const moonAvg = avg(moon.heights);
    const planetAvg = avg(planet.heights);
    expect(moonAvg).toBeLessThan(planetAvg);
  });

  it('resources are scattered (non-empty, in [0,1])', () => {
    const s = generateSurface(makePlanet(123));
    expect(s.resources.length).toBeGreaterThan(0);
    for (const r of s.resources) {
      expect(r.u).toBeGreaterThanOrEqual(0);
      expect(r.u).toBeLessThanOrEqual(1);
      expect(r.v).toBeGreaterThanOrEqual(0);
      expect(r.v).toBeLessThanOrEqual(1);
    }
  });

  it('biome IDs are valid enum values', () => {
    const s = generateSurface(makePlanet(42));
    for (let i = 0; i < s.biomes.length; i++) {
      expect(s.biomes[i]).toBeLessThanOrEqual(Object.keys(BIOME_ID).length);
    }
  });
});

function avg(arr: Float32Array): number {
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return s / arr.length;
}