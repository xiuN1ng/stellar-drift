import { describe, expect, it } from 'vitest';
import { generatePalette, paletteRgb, hslToRgb } from './palette.js';

describe('palette generation', () => {
  it('is deterministic for same seed', () => {
    const a = generatePalette(12345);
    const b = generatePalette(12345);
    expect(a.baseHue).toBe(b.baseHue);
    expect(a.roles.peak.h).toBe(b.roles.peak.h);
    expect(a.roles.peak.s).toBe(b.roles.peak.s);
    expect(a.roles.peak.l).toBe(b.roles.peak.l);
  });

  it('produces different palettes for different seeds', () => {
    const a = generatePalette(1);
    const b = generatePalette(2);
    expect(a.baseHue).not.toBe(b.baseHue);
  });

  it('all roles exist with valid HSL', () => {
    const p = generatePalette(42);
    for (const role of Object.keys(p.roles) as Array<keyof typeof p.roles>) {
      const c = p.roles[role];
      expect(c.h).toBeGreaterThanOrEqual(0);
      expect(c.h).toBeLessThan(360);
      expect(c.s).toBeGreaterThanOrEqual(0);
      expect(c.s).toBeLessThanOrEqual(1);
      expect(c.l).toBeGreaterThanOrEqual(0);
      expect(c.l).toBeLessThanOrEqual(1);
    }
  });

  it('RGB output is in [0, 1]', () => {
    const p = generatePalette(99);
    for (const role of ['peak', 'highland', 'lowland', 'beach', 'water', 'flora', 'sky-tint'] as const) {
      const c = paletteRgb(p, role);
      expect(c.r).toBeGreaterThanOrEqual(0);
      expect(c.r).toBeLessThanOrEqual(1);
      expect(c.g).toBeGreaterThanOrEqual(0);
      expect(c.g).toBeLessThanOrEqual(1);
      expect(c.b).toBeGreaterThanOrEqual(0);
      expect(c.b).toBeLessThanOrEqual(1);
    }
  });

  it('hslToRgb of grayscale is grayscale', () => {
    const rgb = hslToRgb({ h: 200, s: 0, l: 0.5 });
    expect(rgb.r).toBeCloseTo(0.5, 5);
    expect(rgb.g).toBeCloseTo(0.5, 5);
    expect(rgb.b).toBeCloseTo(0.5, 5);
  });

  it('hslToRgb of primary red is correct', () => {
    const rgb = hslToRgb({ h: 0, s: 1, l: 0.5 });
    expect(rgb.r).toBeCloseTo(1.0, 5);
    expect(rgb.g).toBeCloseTo(0.0, 5);
    expect(rgb.b).toBeCloseTo(0.0, 5);
  });
});