/**
 * LOD (Level of Detail) management for planets and stars.
 *
 * Babylons Mesh.addLODLevel() lets us register simplified meshes at distance
 * thresholds. This module is a thin orchestrator that picks:
 *
 *   Planet LODs:
 *     - L1 (>= 200 units): billboard sprite (flat colored disc)
 *     - L2 (>= 30 units): simple sphere with emissive tint
 *     - L3 (>= 5 units): terrain sphere (heightmap mesh, no atmosphere)
 *     - L4 (< 5 units): full terrain + atmosphere + collider (helm hookup)
 *
 *   Star LODs:
 *     - L1 (>= 500 units): billboard with glow
 *     - L2 (< 500 units): sphere with point light + halo billboard
 *
 * Performance:
 *   - We add the high-detail mesh as the canonical one, then add LOD siblings.
 *   - Babylon auto-switches based on camera distance.
 *   - We keep L1/L2 always resident (small footprint) so jumps are seamless.
 */

import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { PlanetRecord, StarRecord } from '@game-types/index';

export const PLANET_LOD = {
  L1_DISTANCE: 200,
  L2_DISTANCE: 30,
  L3_DISTANCE: 5,
} as const;

export const STAR_LOD = {
  L1_DISTANCE: 500,
} as const;

/** Build a tiny colored billboard plane (no texture, just material color). */
export function createBillboard(name: string, scene: Scene, color: Color3, size: number = 1): Mesh {
  const plane = MeshBuilder.CreatePlane(name, { size }, scene);
  plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
  plane.isPickable = false;
  const mat = new StandardMaterial(`${name}-mat`, scene);
  mat.emissiveColor = color;
  mat.diffuseColor = new Color3(0, 0, 0);
  mat.specularColor = new Color3(0, 0, 0);
  mat.disableLighting = true;
  mat.backFaceCulling = false;
  plane.material = mat;
  return plane;
}

/**
 * Apply LOD to a planet mesh.
 * Caller passes the canonical (high-detail) mesh; we generate siblings.
 * Returns all LOD meshes so caller can dispose later.
 */
export function applyPlanetLOD(
  scene: Scene,
  canonical: Mesh,
  planet: PlanetRecord,
  starColor: Color3,
): { lod1: Mesh; lod2: Mesh; canonical: Mesh } {
  // L1: billboard (color = average from palette base hue, simple)
  const lod1 = createBillboard(`${canonical.name}-lod1`, scene, starColor, planet.radius * 1.2);
  lod1.parent = canonical.parent;
  lod1.position = canonical.position.clone();
  canonical.addLODLevel(PLANET_LOD.L1_DISTANCE, lod1);

  // L2: simple sphere with emissive tint (no atmosphere)
  const lod2 = MeshBuilder.CreateSphere(`${canonical.name}-lod2`, { diameter: planet.radius * 2 }, scene);
  const lod2Mat = new StandardMaterial(`${canonical.name}-lod2-mat`, scene);
  lod2Mat.emissiveColor = starColor;
  lod2Mat.diffuseColor = new Color3(0, 0, 0);
  lod2Mat.specularColor = new Color3(0, 0, 0);
  lod2.material = lod2Mat;
  lod2.parent = canonical.parent;
  lod2.position = canonical.position.clone();
  lod2.isPickable = false;
  canonical.addLODLevel(PLANET_LOD.L2_DISTANCE, lod2);

  return { lod1, lod2, canonical };
}

/**
 * Apply LOD to a star mesh.
 */
export function applyStarLOD(
  scene: Scene,
  canonical: Mesh,
  star: StarRecord,
): { lod1: Mesh; canonical: Mesh } {
  const starColor = new Color3(star.color.r, star.color.g, star.color.b);
  const lod1 = createBillboard(`${canonical.name}-lod1`, scene, starColor, Math.max(1.5, star.luminosity * 2.5));
  lod1.parent = canonical.parent;
  lod1.position = canonical.position.clone();
  canonical.addLODLevel(STAR_LOD.L1_DISTANCE, lod1);

  return { lod1, canonical };
}

/**
 * Quick helper to compute a planet's tint color from its class + star color
 * (visual heuristic: hot star = bluer planets, cold star = redder planets).
 */
export function planetTint(planet: PlanetRecord, starColor: Color3): Color3 {
  // Average between star color and class-specific base.
  let baseHue = 0.6; // default: blue-ish
  switch (planet.class) {
    case 'rocky-desert': baseHue = 0.08; break; // warm
    case 'rocky-ocean': baseHue = 0.55; break;  // blue
    case 'rocky-ice':   baseHue = 0.55; break;  // pale blue
    case 'rocky-lava':  baseHue = 0.04; break;  // red
    case 'gas-giant':   baseHue = 0.12; break;  // orange
    case 'ice-giant':   baseHue = 0.55; break;  // pale blue
    case 'moon':        baseHue = 0.10; break;  // gray-orange
  }
  const t = (baseHue + (starColor.r + starColor.b) * 0.5) * 0.5;
  return new Color3(
    Math.min(1, 0.4 + t * 0.6),
    Math.min(1, 0.4 + (1 - Math.abs(0.5 - t)) * 0.5),
    Math.min(1, 0.4 + (1 - t) * 0.7),
  );
}

/** Utility: ensure a vector is normalized; default to Vector3.Up(). */
export function safeNormal(v: Vector3): Vector3 {
  const len = v.length();
  return len > 1e-6 ? v.scale(1 / len) : Vector3.Up();
}