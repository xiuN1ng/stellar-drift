/**
 * Seed pipeline: deterministic GalaxyCoord / StarCoord -> uint32 seed.
 *
 * Uses splitmix-style integer mixing so different coords produce
 * well-distributed, uncorrelated seeds.
 *
 * Same input -> same output across platforms (no Math.random involvement).
 */

import type { GalaxyCoord, StarCoord } from '@game-types/index';

/** 32-bit integer hash of arbitrary string. */
export function hashString(s: string): number {
  let h = 0x811c9dc5; // FNV-1a offset basis
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193); // FNV prime, kept 32-bit via imul
  }
  return h >>> 0;
}

/** Mix two 32-bit ints to one. Asymmetric + avalanche-friendly. */
export function mix32(a: number, b: number): number {
  // Distinct multipliers per input break the XOR symmetry (a^b == b^a),
  // so swapped inputs produce different outputs.
  const x = Math.imul(a | 0, 0x85ebca6b) >>> 0;
  const y = Math.imul(b | 0, 0xc2b2ae35) >>> 0;
  let z = (x ^ y) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
  z = (z ^ (z >>> 16)) >>> 0;
  return z;
}

/** GalaxyCoord -> seed. */
export function seedFromGalaxy(coord: GalaxyCoord): number {
  return mix32(
    mix32(coord.x | 0, coord.y | 0),
    coord.z | 0,
  );
}

/** StarCoord -> seed. Combines a parent galaxy seed with the local coord. */
export function seedFromStar(galaxy: GalaxyCoord, star: StarCoord): number {
  const parent = seedFromGalaxy(galaxy);
  return mix32(parent, mix32(star.sector | 0, star.orbit | 0));
}

/** Composite planet id (used as savegame key). */
export function planetId(galaxy: GalaxyCoord, sector: number, orbit: number): string {
  return `${galaxy.x},${galaxy.y},${galaxy.z}:${sector}.${orbit}`;
}