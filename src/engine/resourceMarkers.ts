/**
 * Resource markers — glowing shapes placed on the planet surface.
 *
 * Each marker:
 *  - Floats slightly above the surface (bob animation).
 *  - Pulses (emissive intensity).
 *  - Color-coded by resource type.
 *
 * In M4 the player will mine them. For M3 they just visualize.
 */

import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { Scene } from '@babylonjs/core/scene.js';

import type { ResourceKind } from '@game-types/index';

const KIND_COLORS: Record<ResourceKind, Color3> = {
  carbon:    new Color3(0.30, 0.30, 0.30),
  iron:      new Color3(0.70, 0.45, 0.30),
  copper:    new Color3(0.95, 0.55, 0.25),
  platinum:  new Color3(0.85, 0.85, 0.95),
  water:     new Color3(0.30, 0.60, 0.95),
  'helium-3': new Color3(0.95, 0.85, 0.50),
  uranium:   new Color3(0.30, 0.95, 0.30),
  exotic:    new Color3(0.95, 0.20, 0.85),
};

export interface ResourceMarkerHandle {
  meshes: Mesh[];
  materials: StandardMaterial[];
  update: (elapsedSec: number) => void;
  dispose: () => void;
}

export function createResourceMarkers(
  scene: Scene,
  positions: Array<{ kind: ResourceKind | string; pos: Vector3; richness: number }>,
): ResourceMarkerHandle {
  const meshes: Mesh[] = [];
  const materials: StandardMaterial[] = [];
  const baseYs: number[] = [];

  for (let i = 0; i < positions.length; i++) {
    const r = positions[i];
    const color = KIND_COLORS[r.kind as ResourceKind] ?? new Color3(1, 1, 1);

    const marker = MeshBuilder.CreateBox(
      `marker-${i}`,
      { size: 0.12 + r.richness * 0.1 },
      scene,
    );
    marker.position = r.pos.clone();
    marker.position.y += 0.15; // float slightly above surface
    marker.isPickable = true;

    const mat = new StandardMaterial(`marker-mat-${i}`, scene);
    mat.emissiveColor = color;
    mat.diffuseColor = color.scale(0.4);
    mat.specularColor = new Color3(0.8, 0.8, 0.8);
    mat.disableLighting = false;
    marker.material = mat;
    marker.metadata = { kind: r.kind, richness: r.richness };

    meshes.push(marker);
    materials.push(mat);
    baseYs.push(marker.position.y);
  }

  let elapsed = 0;
  const update = (dt: number): void => {
    elapsed += dt;
    for (let i = 0; i < meshes.length; i++) {
      const m = meshes[i];
      const bob = Math.sin(elapsed * 2 + i * 0.7) * 0.05;
      m.position.y = baseYs[i] + bob;
      m.rotation.y = elapsed * 0.5;
      m.rotation.x = elapsed * 0.3;
      // Pulse emissive.
      const pulse = 0.7 + Math.sin(elapsed * 3 + i) * 0.3;
      const c = materials[i].emissiveColor;
      materials[i].emissiveColor = new Color3(c.r * pulse, c.g * pulse, c.b * pulse);
    }
  };

  const dispose = (): void => {
    for (const m of meshes) m.dispose();
    for (const mat of materials) mat.dispose();
  };

  return { meshes, materials, update, dispose };
}