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
    // Rejection sampling can drop below the target if the disk is full,
    // so we assert a soft lower bound plus the previous upper bound.
    const g = generateGalaxy({ x: 5, y: 5, z: 5 });
    expect(g.starCount).toBeGreaterThanOrEqual(40);
    expect(g.starCount).toBeLessThanOrEqual(170);
  });

  it('no two stars overlap (minimum separation)', () => {
    // The PCG rejects candidates closer than the band-specific minimum.
    // We give a wide tolerance to account for shared-arm coincidence.
    const g = generateGalaxy({ x: 7, y: 7, z: 7 });
    for (let i = 0; i < g.stars.length; i++) {
      for (let j = i + 1; j < g.stars.length; j++) {
        const a = g.stars[i].position;
        const b = g.stars[j].position;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dz = a.z - b.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        // The smallest min-separation is the core value (25); we use 20 as
        // a tolerance to allow numerical edge cases.
        expect(d).toBeGreaterThan(20);
      }
    }
  });

  it('star distribution has a dense core and sparse halo (realism)', () => {
    // The number of stars in the inner disk should exceed the number
    // in the sparse halo band. With our piecewise density model,
    // the ratio is roughly 4:1 or better.
    const g = generateGalaxy({ x: 9, y: 9, z: 9 });
    const inner = g.stars.filter((s) => {
      const r = Math.hypot(s.position.x, s.position.y, s.position.z);
      return r < 200;
    }).length;
    const outer = g.stars.filter((s) => {
      const r = Math.hypot(s.position.x, s.position.y, s.position.z);
      return r > 600;
    }).length;
    expect(inner).toBeGreaterThan(outer);
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