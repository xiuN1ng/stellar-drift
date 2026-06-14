/**
 * Procedural palette generation.
 *
 * Given a uint32 seed, produces a coherent 5-color palette where:
 * - The hue base is in [0, 360)
 * - Each role (peak, highland, lowland, beach, water) has its own HSL band
 * - Saturation and lightness are clamped per role for visual readability
 *
 * Used by both stars (single tint + halo) and planets (biome coloring).
 *
 * Determinism: same seed -> same palette, every time.
 */

import { Rng } from '@core/rng.js';

/** HSL color. */
export interface Hsl {
  h: number; // 0..360
  s: number; // 0..1
  l: number; // 0..1
}

/** Convert HSL to linear RGB (0..1). */
export function hslToRgb({ h, s, l }: Hsl): { r: number; g: number; b: number } {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0, g1 = 0, b1 = 0;
  if (hp < 1) { r1 = c; g1 = x; b1 = 0; }
  else if (hp < 2) { r1 = x; g1 = c; b1 = 0; }
  else if (hp < 3) { r1 = 0; g1 = c; b1 = x; }
  else if (hp < 4) { r1 = 0; g1 = x; b1 = c; }
  else if (hp < 5) { r1 = x; g1 = 0; b1 = c; }
  else { r1 = c; g1 = 0; b1 = x; }
  const m = l - c / 2;
  return { r: r1 + m, g: g1 + m, b: b1 + m };
}

export type PaletteRole =
  | 'peak'      // brightest accent
  | 'highland'  // main surface
  | 'lowland'   // darker surface
  | 'beach'     // transitional
  | 'water'     // deepest
  | 'flora'     // vegetation accent (optional)
  | 'sky-tint'  // atmospheric hue
  ;

/** 7-role palette. */
export interface Palette {
  seed: number;
  baseHue: number;
  roles: Record<PaletteRole, Hsl>;
}

/** Build a palette deterministically from a seed. */
export function generatePalette(seed: number): Palette {
  const rng = new Rng(seed);
  const baseHue = rng.range(0, 360);

  // Per-role HSL bands tuned for visual harmony:
  // peak:    high lightness, mid sat (catches eye)
  // highland:mid lightness, mid sat (main surface)
  // lowland: low lightness, low-mid sat (shadow areas)
  // beach:   high lightness, low sat (transitional)
  // water:   mid-low lightness, mid sat
  // flora:   variable hue +30deg from base, mid sat/light
  // sky-tint: low sat, mid-high light
  const make = (hOffset: number, sBase: number, sVar: number, lBase: number, lVar: number): Hsl => ({
    h: (baseHue + hOffset + rng.range(-15, 15)) % 360,
    s: Math.max(0, Math.min(1, sBase + rng.range(-sVar, sVar))),
    l: Math.max(0, Math.min(1, lBase + rng.range(-lVar, lVar))),
  });

  return {
    seed,
    baseHue,
    roles: {
      'peak':     make(0,  0.55, 0.15, 0.75, 0.08),
      'highland': make(10, 0.45, 0.10, 0.55, 0.08),
      'lowland':  make(20, 0.35, 0.10, 0.35, 0.08),
      'beach':    make(30, 0.25, 0.10, 0.70, 0.05),
      'water':    make(180 + baseHue, 0.55, 0.10, 0.45, 0.08),
      'flora':    make(120, 0.55, 0.15, 0.45, 0.10),
      'sky-tint': make(0,   0.30, 0.10, 0.65, 0.10),
    },
  };
}

/** Convenience: get RGB tuple for a palette role. */
export function paletteRgb(p: Palette, role: PaletteRole): { r: number; g: number; b: number } {
  return hslToRgb(p.roles[role]);
}