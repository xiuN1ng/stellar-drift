import { describe, expect, it } from 'vitest';
import { generateGalaxy } from './galaxy.js';

describe('galaxy generation', () => {
  it('is deterministic for same coord', () => {
    const a = generateGalaxy({ x: 7, y: 13, z: -4 });
    const b = generateGalaxy({ x: 7, y: 13, z: -4 });
    expect(a.seed).toBe(b.seed);
    expect(a.starCount).toBe(b.starCount);
    expect(a.stars.length).toBe(b.stars.length);
    for (let i = 0; i < a.stars.length; i++) {
      expect(a.stars[i].class).toBe(b.stars[i].class);
      expect(a.stars[i].position).toEqual(b.stars[i].position);
      expect(a.stars[i].planets.length).toBe(b.stars[i].planets.length);
    }
  });

  it('produces different galaxies for different coords', () => {
    const a = generateGalaxy({ x: 0, y: 0, z: 0 });
    const b = generateGalaxy({ x: 0, y: 0, z: 1 });
    expect(a.seed).not.toBe(b.seed);
    expect(a.name).not.toBe(b.name);
  });

  it('has sensible star count range', () => {
    const g = generateGalaxy({ x: 5, y: 5, z: 5 });
    expect(g.starCount).toBeGreaterThanOrEqual(180);
    expect(g.starCount).toBeLessThanOrEqual(420);
  });

  it('every star has a name and a class', () => {
    const g = generateGalaxy({ x: 1, y: 2, z: 3 });
    for (const s of g.stars) {
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.class).toBeTruthy();
      expect(s.luminosity).toBeGreaterThanOrEqual(0);
      expect(s.luminosity).toBeLessThanOrEqual(1);
    }
  });

  it('planet orbits are sorted by index', () => {
    const g = generateGalaxy({ x: 2, y: 2, z: 2 });
    for (const star of g.stars) {
      for (let i = 1; i < star.planets.length; i++) {
        expect(star.planets[i].orbitRadius).toBeGreaterThan(star.planets[i - 1].orbitRadius);
      }
    }
  });
});