/**
 * Laser pickaxe — mining interaction system.
 *
 * Trigger: F key (while landed).
 *
 * Behavior:
 *  - Cast a ray from camera position in look direction.
 *  - If it hits a resource marker mesh, "mine" it:
 *    - Resource kind flows into PlayerState.cargo.
 *    - If cargo is full, mine fails and resource is preserved.
 *    - Mining reduces richness; at 0 the marker is removed.
 *  - Returns a result the caller can surface to HUD/feedback.
 *
 * Visual feedback (caller's responsibility): we expose a "laser flash"
 *   callback hook so the renderer can show a brief beam effect.
 */

import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Ray } from '@babylonjs/core/Culling/ray.js';
import type { Scene, AbstractMesh } from '@babylonjs/core';

import { KeyboardInput } from '@input/keyboard.js';
import { canMineResource } from '@player/archetype.js';
import type { PlayerState, ResourceKind } from '@game-types/index';

export interface MiningResult {
  status: 'no-target' | 'out-of-range' | 'cargo-full' | 'no-access' | 'mined' | 'depleted';
  kind?: ResourceKind;
  amount?: number;
  position?: Vector3 | null;
  mesh?: AbstractMesh;
}

export interface MiningToolOptions {
  /** Max raycast distance (units). */
  maxRange?: number;
  /** Units of resource extracted per successful hit. */
  extractPerHit?: number;
  /** Hit cooldown (ms) — prevents spam. */
  cooldownMs?: number;
}

const DEFAULTS: Required<MiningToolOptions> = {
  maxRange: 4,
  extractPerHit: 1,
  cooldownMs: 350,
};

export class MiningTool {
  private readonly opts: Required<MiningToolOptions>;
  private lastFireTime = 0;
  /** Hook for the renderer to show a brief laser flash. */
  onLaserFired: ((from: Vector3, to: Vector3) => void) | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly keys: KeyboardInput,
    options: MiningToolOptions = {},
  ) {
    this.opts = { ...DEFAULTS, ...options };
  }

  /**
   * Try to mine. Called once per frame from main render loop.
   * Only fires when F key is held AND state is appropriate.
   */
  fire(
    cameraPosition: Vector3,
    lookDirection: Vector3,
    player: PlayerState,
    cargoCap: number,
    archetype: PlayerState['archetype'],
  ): MiningResult {
    if (!this.keys.isDown('KeyF')) {
      return { status: 'no-target' };
    }
    const now = performance.now();
    if (now - this.lastFireTime < this.opts.cooldownMs) {
      return { status: 'no-target' };
    }

    // Raycast.
    const ray = new Ray(cameraPosition.clone(), lookDirection.clone(), this.opts.maxRange);
    const hits = this.scene.pickWithRay(ray, (mesh) => {
      return mesh.name.startsWith('marker-');
    });

    if (!hits || !hits.hit || !hits.pickedMesh) {
      return { status: 'out-of-range' };
    }

    const meta = hits.pickedMesh.metadata as
      | { kind: ResourceKind; richness: number }
      | undefined;
    if (!meta) {
      return { status: 'no-target' };
    }

    // Archetype access check.
    if (!canMineResource(archetype, meta.kind)) {
      return { status: 'no-access' };
    }

    // Cargo capacity check.
    const used = Object.values(player.cargo).reduce<number>(
      (a: number, b: number | undefined) => a + (b ?? 0),
      0,
    );
    if (used >= cargoCap) {
      return { status: 'cargo-full' };
    }

    // Mine!
    const amount = Math.min(this.opts.extractPerHit, meta.richness);
    player.cargo[meta.kind] = (player.cargo[meta.kind] ?? 0) + amount;
    meta.richness -= amount;

    this.lastFireTime = now;

    // Laser flash callback.
    if (this.onLaserFired) {
      this.onLaserFired(cameraPosition.clone(), hits.pickedPoint ?? cameraPosition.add(lookDirection.scale(2)));
    }

    if (meta.richness <= 0) {
      hits.pickedMesh.dispose();
      return {
        status: 'depleted',
        kind: meta.kind,
        amount,
        position: hits.pickedPoint,
        mesh: hits.pickedMesh,
      };
    }

    return {
      status: 'mined',
      kind: meta.kind,
      amount,
      position: hits.pickedPoint,
      mesh: hits.pickedMesh,
    };
  }

  /** Compute current cargo usage from player state. */
  static cargoUsed(player: PlayerState): number {
    return Object.values(player.cargo).reduce<number>(
      (a, b) => a + (b ?? 0),
      0,
    );
  }
}