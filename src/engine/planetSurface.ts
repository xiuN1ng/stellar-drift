/**
 * Build a Babylon.js mesh from a SurfaceRecord.
 *
 * Approach:
 *  - Generate a UV sphere mesh (lat/lon grid).
 *  - For each vertex, look up the corresponding height sample from the
 *    SurfaceRecord heightmap (bilinear interpolation between samples).
 *  - Apply per-vertex color based on biome map (vertex colors feed PBR).
 *  - Resource nodes are returned separately as a list of 3D positions so the
 *    caller can spawn markers.
 *
 * Performance:
 *  - 64x64 surface + sphere segments=64 → ~8000 vertices, < 1ms build.
 *  - PBR material with vertex colors; no textures needed.
 *
 * Determinism: same SurfaceRecord → identical mesh.
 */

import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { Scene } from '@babylonjs/core/scene.js';

import {
  type SurfaceRecord, BIOME_FROM_ID,
} from '@pcg/planet.js';
import { generatePalette, paletteRgb, type PaletteRole } from '@pcg/palette.js';
import type { BiomeId } from '@pcg/planet.js';
import type { PlanetRecord } from '@game-types/index';

const SPHERE_SEGMENTS = 48;

/** Approximate color for a BiomeId, using palette roles. */
function biomeColor(
  biome: BiomeId,
  pal: ReturnType<typeof generatePalette>,
): { r: number; g: number; b: number } {
  // Map biome → palette role. Water biomes use 'water', ice uses 'peak' as bright, etc.
  let role: PaletteRole = 'highland';
  switch (biome) {
    case 'deep-water':
    case 'ocean':
      role = 'water'; break;
    case 'shallow-water': role = 'water'; break;
    case 'beach':         role = 'beach'; break;
    case 'lowland':
    case 'plains':        role = 'lowland'; break;
    case 'highland':      role = 'highland'; break;
    case 'peak':          role = 'peak'; break;
    case 'ice':
    case 'tundra':        role = 'peak'; break;  // bright snow
    case 'volcanic':      role = 'lowland'; break; // dark rock
    case 'crystal':       role = 'peak'; break;
    case 'forest':        role = 'flora'; break;
    case 'desert':        role = 'beach'; break;
  }
  return paletteRgb(pal, role);
}

/** Sample heightmap at (u, v) with bilinear interpolation. */
function sampleHeight(
  heights: Float32Array,
  N: number,
  u: number,
  v: number,
): number {
  const fx = u * (N - 1);
  const fy = v * (N - 1);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(N - 1, x0 + 1);
  const y1 = Math.min(N - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const h00 = heights[y0 * N + x0];
  const h10 = heights[y0 * N + x1];
  const h01 = heights[y1 * N + x0];
  const h11 = heights[y1 * N + x1];
  return h00 * (1 - tx) * (1 - ty) + h10 * tx * (1 - ty)
       + h01 * (1 - tx) * ty + h11 * tx * ty;
}

/** Sample biome at (u, v). */
function sampleBiome(biomes: Uint8Array, N: number, u: number, v: number): BiomeId {
  const x = Math.min(N - 1, Math.floor(u * (N - 1)));
  const y = Math.min(N - 1, Math.floor(v * (N - 1)));
  return BIOME_FROM_ID[biomes[y * N + x]];
}

/** Convert (u, v) in [0, 1]^2 to a unit vector on the sphere. */
function uvToSphere(u: number, v: number): Vector3 {
  const theta = u * Math.PI * 2; // longitude
  const phi = v * Math.PI;       // latitude (0 = north pole)
  return new Vector3(
    Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta),
  );
}

/** Convert (u, v) to a 3D position on the planet surface. */
export function uvToSurfacePosition(
  surface: SurfaceRecord,
  radius: number,
  heightScale: number,
  u: number,
  v: number,
): Vector3 {
  const sphere = uvToSphere(u, v);
  const h = sampleHeight(surface.heights, surface.gridSize, u, v); // [-1, 1]
  const surfaceRadius = radius * (1 + h * heightScale);
  return sphere.scale(surfaceRadius);
}

export interface PlanetSurfaceMesh {
  mesh: Mesh;
  material: PBRMaterial;
  /** Resource node 3D positions (planet-local space). */
  resourcePositions: Array<{ kind: string; pos: Vector3; richness: number }>;
  /** Disposal handle. */
  dispose: () => void;
}

export function createPlanetSurfaceMesh(
  scene: Scene,
  planet: PlanetRecord,
  surface: SurfaceRecord,
  options: { heightScale?: number } = {},
): PlanetSurfaceMesh {
  const heightScale = options.heightScale ?? 0.06;
  const radius = planet.radius;
  const N = surface.gridSize;
  const palette = generatePalette(planet.seed);

  // Build UV sphere mesh.
  const mesh = MeshBuilder.CreateSphere(
    `surface-${planet.id}`,
    { diameter: radius * 2, segments: SPHERE_SEGMENTS },
    scene,
  );

  // Compute custom vertex data: positions on deformed sphere + colors.
  const positions = mesh.getVerticesData('position');
  const indices = mesh.getIndices();
  if (!positions || !indices) {
    throw new Error('Failed to get sphere vertex data');
  }
  const newPositions: number[] = new Array(positions.length);
  const colors: number[] = [];
  const uvs: number[] = new Array((positions.length / 3) * 2);

  for (let i = 0, ci = 0; i < positions.length; i += 3, ci += 2) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];

    // Compute u, v from current sphere position.
    const r = Math.sqrt(x * x + y * y + z * z);
    const norm = new Vector3(x / r, y / r, z / r);
    const u = (Math.atan2(z, x) / (2 * Math.PI) + 1) % 1;
    const v = Math.acos(Math.max(-1, Math.min(1, norm.y))) / Math.PI;

    const h = sampleHeight(surface.heights, N, u, v); // [-1, 1]
    const surfaceR = r * (1 + h * heightScale);
    newPositions[i] = norm.x * surfaceR;
    newPositions[i + 1] = norm.y * surfaceR;
    newPositions[i + 2] = norm.z * surfaceR;
    uvs[ci] = u;
    uvs[ci + 1] = v;

    // Biome color.
    const biome = sampleBiome(surface.biomes, N, u, v);
    const c = biomeColor(biome, palette);
    colors.push(c.r, c.g, c.b, 1.0);
  }

  const vertexData = new VertexData();
  vertexData.positions = newPositions;
  vertexData.indices = indices;
  vertexData.colors = colors;
  vertexData.uvs = uvs;
  // Recompute normals so lighting matches deformed surface.
  const normals: number[] = [];
  VertexData.ComputeNormals(newPositions, indices, normals);
  vertexData.normals = normals;
  vertexData.applyToMesh(mesh, true);

  // PBR material with vertex colors.
  const material = new PBRMaterial(`surface-mat-${planet.id}`, scene);
  material.albedoColor = new Color3(1, 1, 1); // multiplied by vertex color
  material.metallic = 0.0;
  material.roughness = 0.85;
  material.ambientColor = new Color3(0.05, 0.07, 0.12);
  material.backFaceCulling = true;
  mesh.material = material;
  mesh.useVertexColors = true; // mesh flag, not material
  mesh.isPickable = false;

  // Pre-compute resource node 3D positions.
  const resourcePositions = surface.resources.map((r) => ({
    kind: r.kind,
    pos: uvToSurfacePosition(surface, radius, heightScale, r.u, r.v),
    richness: r.richness,
  }));

  return {
    mesh,
    material,
    resourcePositions,
    dispose: () => {
      material.dispose();
      mesh.dispose();
    },
  };
}