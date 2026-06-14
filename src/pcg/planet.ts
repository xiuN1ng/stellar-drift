/**
 * Planet surface generation: heightmap + biome map + resource map.
 *
 * Produces a deterministic, sphere-mapped surface ready to be turned into
 * a Babylon.js mesh by the rendering layer (prism agent).
 *
 * Implementation notes:
 * - We sample noise on a 2D grid (u, v) in [0, 1]^2 — the renderer maps
 *   this onto a UV sphere later.
 * - Heightmap is stored as Float32Array of size N*N (default 64x64 = 4096).
 *   64x64 is a sweet spot for a planet mesh — enough detail, low memory.
 * - Biome per cell is a small enum so the renderer can pick a palette role.
 * - Resources are scattered on top of the heightmap at predictable seeds.
 *
 * Determinism: same PlanetRecord -> same SurfaceRecord, every time.
 */

import { Rng } from '@core/rng.js';
import { makeNoise2D, fbm2D, ridge2D } from '@core/noise.js';
import type { PlanetRecord, BiomeClass, ResourceKind } from '@game-types/index';

export const SURFACE_GRID_SIZE = 64; // 64x64 = 4096 samples per planet

/** Surface biome classification per cell. */
export type BiomeId =
  | 'deep-water' | 'shallow-water' | 'beach'
  | 'lowland' | 'highland' | 'peak'
  | 'ice' | 'volcanic' | 'crystal'
  | 'forest' | 'desert' | 'plains' | 'tundra' | 'ocean';

export interface ResourceNode {
  u: number;     // 0..1
  v: number;     // 0..1
  kind: ResourceKind;
  richness: number; // 0..1
}

export interface SurfaceRecord {
  planetId: string;
  seed: number;
  gridSize: number;
  heights: Float32Array;     // length = gridSize * gridSize, values in [-1, 1]
  biomes: Uint8Array;        // length = gridSize * gridSize, BiomeId enum
  seaLevel: number;          // threshold for water (in [-1, 1])
  resources: ResourceNode[];
}

/** Map BiomeId enum to a stable numeric ID. */
export const BIOME_ID: Record<BiomeId, number> = {
  'deep-water': 0,
  'shallow-water': 1,
  'beach': 2,
  'lowland': 3,
  'highland': 4,
  'peak': 5,
  'ice': 6,
  'volcanic': 7,
  'crystal': 8,
  'forest': 9,
  'desert': 10,
  'plains': 11,
  'tundra': 12,
  'ocean': 13,
};

/** Reverse mapping. */
export const BIOME_FROM_ID: BiomeId[] = Object.keys(BIOME_ID) as BiomeId[];

/**
 * Compute sea level from a heightmap (heuristic: 35th percentile).
 */
function computeSeaLevel(heights: Float32Array): number {
  const sorted = Array.from(heights).sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.35)];
}

/** Classify a single cell into a BiomeId given height, moisture, planet biomes. */
function classifyCell(
  height: number,
  _moisture: number,
  seaLevel: number,
  _planetBiomes: readonly BiomeClass[],
): BiomeId {
  // Water cells first (height below sea level).
  if (height < seaLevel) {
    if (height < seaLevel - 0.15) return 'deep-water';
    return 'shallow-water';
  }

  // Beach: just above sea level.
  if (height < seaLevel + 0.04) return 'beach';

  // Mountain vs flatland.
  if (height > 0.65) return 'peak';
  if (height > 0.35) return 'highland';
  return 'lowland';
}

/** Map planet's biome class hints to actual BiomeId overlays. */
function overlayBiome(
  base: BiomeId,
  moisture: number,
  _height: number,
  planetBiomes: readonly BiomeClass[],
  rng: Rng,
): BiomeId {
  // Forest overlay: high moisture + lowland + biome hint
  if (planetBiomes.includes('forest') && base === 'lowland' && moisture > 0.2 && rng.chance(0.55)) {
    return 'forest';
  }
  // Desert overlay: low moisture + lowland/highland
  if (planetBiomes.includes('desert') && (base === 'lowland' || base === 'highland') && moisture < -0.1) {
    return 'desert';
  }
  // Volcanic overlay: peak + lava biome hint
  if (planetBiomes.includes('volcanic') && base === 'peak' && rng.chance(0.4)) {
    return 'volcanic';
  }
  // Crystal overlay: highland + crystal hint (rare)
  if (planetBiomes.includes('crystal') && base === 'highland' && rng.chance(0.25)) {
    return 'crystal';
  }
  // Tundra / ice overlay: planet ice biome, or just low moisture at high elevation
  if (planetBiomes.includes('tundra') && (base === 'highland' || base === 'peak')) {
    return rng.chance(0.4) ? 'tundra' : 'ice';
  }
  // Plains filler
  if (base === 'lowland' && planetBiomes.includes('plains')) {
    return rng.chance(0.4) ? 'plains' : 'lowland';
  }
  return base;
}

/**
 * Generate a SurfaceRecord for a planet. Deterministic.
 */
export function generateSurface(planet: PlanetRecord): SurfaceRecord {
  const seed = planet.seed !== 0 ? planet.seed : hashString(planet.id);
  const rng = new Rng(seed);
  const N = SURFACE_GRID_SIZE;
  const total = N * N;

  const heights = new Float32Array(total);
  const biomeArr = new Uint8Array(total);

  // Two noise channels: elevation + moisture. Slight offset to decorrelate.
  const elevNoise = makeNoise2D(seed);
  const moistNoise = makeNoise2D((seed * 16807) >>> 0);

  // Step 1: fill heights with FBM elevation + ridge detail.
  let minH = Infinity, maxH = -Infinity;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const u = i / (N - 1);
      const v = j / (N - 1);

      // Multi-scale: continents (low freq) + mountains (ridge) + detail (high freq).
      const continent = fbm2D(elevNoise, u * 2, v * 2, 4, 2.0, 0.5);
      const ridge = ridge2D(elevNoise, u * 6 + 100, v * 6 + 100, 5, 2.0, 0.55);
      const detail = fbm2D(elevNoise, u * 16, v * 16, 3, 2.0, 0.5) * 0.1;

      // Mix: continent provides base, ridge adds mountains, detail adds texture.
      let h = continent * 0.6 + ridge * 0.35 + detail;

      // Bias moons low (small bodies don't hold much atmosphere/water).
      if (planet.class === 'moon') h -= 0.25;

      // Ice planets biased high (snow caps).
      if (planet.class === 'rocky-ice') h += 0.1;

      heights[i * N + j] = h;
      if (h < minH) minH = h;
      if (h > maxH) maxH = h;
    }
  }

  // Normalize to [-1, 1].
  const range = maxH - minH || 1;
  for (let k = 0; k < total; k++) {
    heights[k] = ((heights[k] - minH) / range) * 2 - 1;
  }

  const seaLevel = computeSeaLevel(heights);

  // Step 2: classify biomes with moisture + overlays.
  const overlayRng = new Rng(seed ^ 0x5151);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const k = i * N + j;
      const u = i / (N - 1);
      const v = j / (N - 1);
      const h = heights[k];
      const m = fbm2D(moistNoise, u * 3, v * 3, 4);
      const base = classifyCell(h, m, seaLevel, planet.biomes);
      const final = overlayBiome(base, m, h, planet.biomes, overlayRng);
      biomeArr[k] = BIOME_ID[final];
    }
  }

  // Step 3: scatter resource nodes — pick a few high-quality spots.
  const resources: ResourceNode[] = [];
  for (const res of planet.resources) {
    const count = 4 + Math.floor(res.richness * 8);
    for (let i = 0; i < count; i++) {
      // Sample a few candidates; keep the one with highest elevation nearby
      // (resources prefer mountain peaks or volcanic craters).
      let bestU = rng.next(), bestV = rng.next(), bestScore = -Infinity;
      for (let t = 0; t < 6; t++) {
        const cu = rng.next();
        const cv = rng.next();
        const ci = Math.min(N - 1, Math.floor(cu * N));
        const cj = Math.min(N - 1, Math.floor(cv * N));
        const ck = ci * N + cj;
        const score = heights[ck] + rng.range(-0.1, 0.1);
        if (score > bestScore) {
          bestScore = score;
          bestU = cu;
          bestV = cv;
        }
      }
      resources.push({
        u: bestU,
        v: bestV,
        kind: res.kind,
        richness: res.richness * rng.range(0.7, 1.0),
      });
    }
  }

  return {
    planetId: planet.id,
    seed,
    gridSize: N,
    heights,
    biomes: biomeArr,
    seaLevel,
    resources,
  };
}

/** Hash string into uint32 (same algorithm as core/seed). */
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}