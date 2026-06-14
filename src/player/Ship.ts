/**
 * Ship entity — a Babylon TransformNode acting as a 6DOF rigid body proxy.
 *
 * State stored on this node:
 *  - position (Vector3, world)
 *  - rotation (Quaternion, world)
 *  - linearVelocity (Vector3, world)
 *  - angularVelocity (Vector3, body-local axes: roll=X, pitch=Y, yaw=Z)
 *
 * Performance: 200 stars × ~3 planets = 600 moving objects, so we keep
 * math minimal — no Havok for the MVP (Havok is great but adds 4MB+ to
 * bundle and the rules are simple enough for hand-rolled integration).
 */

import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Quaternion } from '@babylonjs/core/Maths/math.vector.js';
import type { Scene } from '@babylonjs/core/scene.js';

export class Ship {
  readonly node: TransformNode;
  readonly linearVelocity = new Vector3(0, 0, 0);
  /** Body-local angular velocity. Roll=X, Pitch=Y, Yaw=Z (radians/sec). */
  readonly angularVelocity = new Vector3(0, 0, 0);

  constructor(scene: Scene, name: string = 'player-ship') {
    this.node = new TransformNode(name, scene);
  }

  get position(): Vector3 {
    return this.node.position;
  }

  get rotation(): Quaternion {
    return this.node.rotationQuaternion!;
  }

  setRotation(q: Quaternion): void {
    if (!this.node.rotationQuaternion) {
      this.node.rotationQuaternion = q.clone();
    } else {
      this.node.rotationQuaternion.copyFrom(q);
    }
  }

  /** Compute world-space forward vector (local +Z). */
  forward(out?: Vector3): Vector3 {
    const target = out ?? new Vector3();
    return Vector3.TransformNormalToRef(new Vector3(0, 0, 1), this.node.getWorldMatrix(), target);
  }

  /** Compute world-space up vector (local +Y). */
  up(out?: Vector3): Vector3 {
    const target = out ?? new Vector3();
    return Vector3.TransformNormalToRef(new Vector3(0, 1, 0), this.node.getWorldMatrix(), target);
  }

  /** Compute world-space right vector (local +X). */
  right(out?: Vector3): Vector3 {
    const target = out ?? new Vector3();
    return Vector3.TransformNormalToRef(new Vector3(1, 0, 0), this.node.getWorldMatrix(), target);
  }

  /** Current speed magnitude (units/sec). */
  speed(): number {
    return this.linearVelocity.length();
  }

  dispose(): void {
    this.node.dispose();
  }
}