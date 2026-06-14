/**
 * Third-person chase camera with FOV scaling based on ship speed.
 *
 * Behavior:
 *  - Trail ship position with lerp (smoothing).
 *  - Look at point slightly ahead of ship (predicts motion).
 *  - FOV opens up at high speed ("speed lines" feel).
 *
 * Tunables exposed so helm agent can iterate on feel.
 */

import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { Scene } from '@babylonjs/core/scene.js';

import { Ship } from './Ship.js';

export interface ShipCameraOptions {
  /** Distance behind ship (in ship-local -Z direction). */
  distance?: number;
  /** Height offset above ship. */
  height?: number;
  /** Position lerp factor (0..1, higher = snappier). */
  positionLerp?: number;
  /** Base FOV (radians). */
  baseFov?: number;
  /** Max FOV (radians) at top speed. */
  maxFov?: number;
  /** Speed at which FOV starts widening (units/sec). */
  fovSpeedStart?: number;
  /** Speed at which FOV reaches max (units/sec). */
  fovSpeedMax?: number;
}

const DEFAULTS: Required<ShipCameraOptions> = {
  distance: 6,
  height: 1.5,
  positionLerp: 0.18,
  baseFov: Math.PI / 3.2, // ~56 deg
  maxFov: Math.PI / 2.4,  // ~75 deg
  fovSpeedStart: 5,
  fovSpeedMax: 60,
};

export class ShipCamera {
  readonly camera: UniversalCamera;
  private readonly opts: Required<ShipCameraOptions>;
  private readonly lookAhead = new Vector3(0, 0, 0);
  private readonly targetPos = new Vector3();
  private readonly targetLook = new Vector3();

  constructor(
    scene: Scene,
    private readonly ship: Ship,
    options: ShipCameraOptions = {},
  ) {
    this.opts = { ...DEFAULTS, ...options };
    this.camera = new UniversalCamera(
      'shipCam',
      new Vector3(0, 0, -this.opts.distance),
      scene,
    );
    this.camera.minZ = 0.05;
    this.camera.maxZ = 8000;
    this.camera.fov = this.opts.baseFov;
    this.camera.inertia = 0;
    // We do NOT call attachControl — mouse is consumed by MouseInput instead.
  }

  update(dt: number): void {
    const opts = this.opts;
    const sp = this.ship.speed();
    const speedRatio = Math.max(0, Math.min(1,
      (sp - opts.fovSpeedStart) / (opts.fovSpeedMax - opts.fovSpeedStart),
    ));
    // Ease-in FOV change (no sudden jumps).
    const targetFov = opts.baseFov + (opts.maxFov - opts.baseFov) * speedRatio;
    this.camera.fov += (targetFov - this.camera.fov) * 0.1;

    // Desired position: behind and above ship (in body frame).
    const back = new Vector3(0, 0, -opts.distance);
    const world = new Vector3();
    Vector3.TransformNormalToRef(back, this.ship.node.getWorldMatrix(), world);
    this.targetPos.copyFrom(this.ship.position);
    this.targetPos.addInPlace(world);
    // Height offset in world up (not body up, to avoid roll sickness).
    this.targetPos.y += opts.height;

    // Lerp camera toward target position.
    const k = 1 - Math.pow(1 - opts.positionLerp, dt * 60); // frame-rate independent
    this.camera.position.x += (this.targetPos.x - this.camera.position.x) * k;
    this.camera.position.y += (this.targetPos.y - this.camera.position.y) * k;
    this.camera.position.z += (this.targetPos.z - this.camera.position.z) * k;

    // Look target: ship position + forward * lookahead scaled by speed.
    const fwd = new Vector3();
    Vector3.TransformNormalToRef(new Vector3(0, 0, 1), this.ship.node.getWorldMatrix(), fwd);
    const lookDist = 5 + speedRatio * 20;
    this.targetLook.copyFrom(this.ship.position);
    this.targetLook.addInPlace(fwd.scale(lookDist));

    // Lerp lookAt.
    this.lookAhead.x += (this.targetLook.x - this.lookAhead.x) * k;
    this.lookAhead.y += (this.targetLook.y - this.lookAhead.y) * k;
    this.lookAhead.z += (this.targetLook.z - this.lookAhead.z) * k;
    this.camera.setTarget(this.lookAhead);
  }

  dispose(): void {
    this.camera.dispose();
  }
}