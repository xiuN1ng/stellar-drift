/**
 * Landing state machine + ground-walking controller.
 *
 * States:
 *  - orbit (ship flying free)
 *  - landing-transition (animation: descend from orbit to surface)
 *  - landed (player on ground; first-person walking)
 *  - takeoff-transition (rise from surface to orbit)
 *
 * Trigger: L key. Conditions for landing:
 *  - In orbit state
 *  - Within `LANDING_RADIUS` of a planet center
 *  - Ship velocity below `LANDING_SPEED_MAX`
 *
 * Walking:
 *  - WASD moves player on the surface (great-circle arc, scaled to local
 *    tangent plane — for MVP we just use small linear offsets)
 *  - Mouse delta rotates view direction
 *  - Gravity-locked to surface normal (no falling off)
 *
 * This module does NOT own the meshes; the caller (main.ts) wires up
 * which meshes are visible in which state.
 */

import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector.js';
import type { Scene } from '@babylonjs/core/scene.js';

import { Ship } from './Ship.js';
import { KeyboardInput } from '@input/keyboard.js';
import { MouseInput } from '@input/mouse.js';

export type LandingState = 'orbit' | 'landing' | 'landed' | 'taking-off';

export interface LandingControllerOptions {
  landingRadius?: number;     // distance from planet center at which landing triggers
  landingSpeedMax?: number;   // max speed to allow landing (units/sec)
  walkSpeed?: number;         // walking speed (units/sec)
  mouseSensitivity?: number;
}

const DEFAULTS: Required<LandingControllerOptions> = {
  landingRadius: 4,
  landingSpeedMax: 8,
  walkSpeed: 4,
  mouseSensitivity: 0.003,
};

export interface LandingTarget {
  /** Planet center (Vector3). */
  center: Vector3;
  /** Planet radius. */
  radius: number;
}

export class LandingController {
  private readonly opts: Required<LandingControllerOptions>;
  state: LandingState = 'orbit';
  /** Where on the planet surface the player is standing (planet-local). */
  surfacePosition: Vector3 = new Vector3(0, 0, 0);
  /** Yaw (rotation around surface normal) for walking. */
  yaw = 0;
  pitch = 0;
  /** The planet currently landed on (if landed). */
  currentPlanet: LandingTarget | null = null;

  private landingProgress = 0;
  private lastLState = false;

  constructor(
    _scene: Scene,
    private readonly ship: Ship,
    private readonly keys: KeyboardInput,
    private readonly mouse: MouseInput,
    options: LandingControllerOptions = {},
  ) {
    this.opts = { ...DEFAULTS, ...options };
  }

  /**
   * Check if L was just pressed (edge-triggered) and conditions allow landing/takeoff.
   * Returns the new state if transitioned, null otherwise.
   */
  poll(planet: LandingTarget | null): LandingState | null {
    const lDown = this.keys.isDown('KeyL');
    const justPressed = lDown && !this.lastLState;
    this.lastLState = lDown;
    if (!justPressed) return null;

    if (this.state === 'orbit' && planet) {
      const d = Vector3.Distance(this.ship.position, planet.center);
      const speed = this.ship.speed();
      if (d <= planet.radius * this.opts.landingRadius && speed < this.opts.landingSpeedMax) {
        this.state = 'landing';
        this.landingProgress = 0;
        this.currentPlanet = planet;
        return 'landing';
      }
    } else if (this.state === 'landed') {
      this.state = 'taking-off';
      this.landingProgress = 0;
      return 'taking-off';
    }
    return null;
  }

  /** Update during orbit state (no-op for now; physics handled by ShipController). */
  updateOrbit(_dt: number): void {
    // The ship controller handles its own physics. We just sit in orbit.
  }

  /** Animate landing (descent from orbit to surface). */
  updateLanding(dt: number): boolean {
    if (!this.currentPlanet) return true;
    this.landingProgress += dt * 0.6; // ~1.6s descent
    const t = Math.min(1, this.landingProgress);
    // Lerp ship position from orbit to just above surface.
    const planet = this.currentPlanet;
    const startPos = this.ship.position.clone();
    const dir = startPos.subtract(planet.center).normalize();
    const surfacePos = dir.scale(planet.radius * 1.05);
    this.ship.node.position.copyFrom(Vector3.Lerp(startPos, surfacePos, t));
    if (t >= 1) {
      this.state = 'landed';
      this.surfacePosition.copyFrom(surfacePos);
      // Compute initial yaw from direction.
      this.yaw = Math.atan2(dir.x, dir.z);
      this.pitch = 0;
      return true; // done
    }
    return false;
  }

  /** Animate takeoff. */
  updateTakeoff(dt: number): boolean {
    if (!this.currentPlanet) return true;
    this.landingProgress += dt * 0.6;
    const t = Math.min(1, this.landingProgress);
    const planet = this.currentPlanet;
    const surfacePos = this.surfacePosition.clone();
    // Take off straight up to radius * 1.3.
    const dir = surfacePos.subtract(planet.center).normalize();
    const targetPos = dir.scale(planet.radius * 1.3);
    this.ship.node.position.copyFrom(Vector3.Lerp(surfacePos, targetPos, t));
    if (t >= 1) {
      this.state = 'orbit';
      this.currentPlanet = null;
      return true;
    }
    return false;
  }

  /** Update walking on surface. */
  updateWalking(dt: number): void {
    if (!this.currentPlanet) return;

    // Mouse look.
    const delta = this.mouse.consumeDelta();
    if (delta.dx !== 0 || delta.dy !== 0) {
      this.yaw -= delta.dx * this.opts.mouseSensitivity;
      this.pitch -= delta.dy * this.opts.mouseSensitivity;
      this.pitch = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, this.pitch));
    }

    // Walking: build forward/right vectors in tangent plane.
    const planet = this.currentPlanet;
    const up = this.surfacePosition.subtract(planet.center).normalize();
    // Forward = -up rotated by yaw around world Y.
    const yawQ = Quaternion.RotationAxis(new Vector3(0, 1, 0), this.yaw);
    const fwdLocal = new Vector3(0, 0, 1).applyRotationQuaternion(yawQ);
    // Project onto tangent plane.
    const fwd = fwdLocal.subtract(up.scale(Vector3.Dot(fwdLocal, up))).normalize();
    const right = Vector3.Cross(up, fwd).normalize();

    const moveSpeed = this.opts.walkSpeed * dt;
    const move = new Vector3(0, 0, 0);
    move.addInPlace(fwd.scale(this.keys.axis('thrust-z') * moveSpeed));
    move.addInPlace(right.scale(this.keys.axis('thrust-x') * moveSpeed));

    if (move.lengthSquared() > 0) {
      this.surfacePosition.addInPlace(move);
      // Keep on sphere surface.
      const newDir = this.surfacePosition.subtract(planet.center).normalize();
      this.surfacePosition.copyFrom(newDir.scale(planet.radius * 1.05));
      this.ship.node.position.copyFrom(this.surfacePosition);
    }

    // Update yaw/pitch on ship so external cameras can read.
    this.applyYawPitchToShip();
  }

  private applyYawPitchToShip(): void {
    if (!this.currentPlanet) return;
    const up = this.surfacePosition.subtract(this.currentPlanet.center).normalize();
    // Build rotation: yaw around world Y, pitch around right axis, then align up to surface normal.
    const yawQ = Quaternion.RotationAxis(new Vector3(0, 1, 0), this.yaw);
    const pitchQ = Quaternion.RotationAxis(new Vector3(1, 0, 0), this.pitch);
    // Aligned rotation: align local +Y with surface normal.
    const baseQ = Quaternion.FromUnitVectorsToRef(new Vector3(0, 1, 0), up, new Quaternion());
    const composed = yawQ.multiply(pitchQ).multiply(baseQ);
    this.ship.setRotation(composed);
  }
}