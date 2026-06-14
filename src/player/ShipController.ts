/**
 * Ship controller — converts input → 6DOF rigid body motion.
 *
 * Physics model:
 *  - 6DOF with separate linear and angular dynamics.
 *  - Linear: thrust = input thrust vector × mainThrottle, with linear damping.
 *  - Angular: torque = input pitch/yaw/roll × angThrottle, with angular damping.
 *  - All "feel" tuned via acceleration curves (ease-out for thrust, ease-in
 *    for braking) per helm agent's spec.
 *
 * Tuning philosophy:
 *  - Realistic Newtonian physics → frustrating (player feels like a fly).
 *  - We bias toward responsiveness: instant thrust response, gradual damping.
 *
 * Inputs consumed:
 *  - thrust-x / thrust-y / thrust-z (WASD + Space/Ctrl)
 *  - roll / pitch / yaw (QE / IK / JL)
 *  - boost (Shift)
 *  - mouseDelta (for yaw/pitch on camera-relative aim)
 */

import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector.js';
import type { Scene } from '@babylonjs/core/scene.js';

import { Ship } from './Ship.js';
import { KeyboardInput } from '@input/keyboard.js';
import { MouseInput } from '@input/mouse.js';

export interface ShipControllerOptions {
  mainThrottle?: number;    // base linear accel (units/s²)
  angThrottle?: number;     // base angular accel (rad/s²)
  boostMultiplier?: number; // boost scalar (1.0 = none)
  linearDamping?: number;   // velocity damping per second (0..1)
  angularDamping?: number;  // angular damping per second (0..1)
  mouseSensitivity?: number;// radians per pixel of mouse delta
  maxSpeed?: number;        // hard cap on linear speed (units/s)
}

const DEFAULTS: Required<ShipControllerOptions> = {
  mainThrottle: 18,
  angThrottle: 2.4,
  boostMultiplier: 2.4,
  linearDamping: 0.5,
  angularDamping: 4.0,
  mouseSensitivity: 0.0025,
  maxSpeed: 80,
};

export class ShipController {
  private readonly opts: Required<ShipControllerOptions>;
  private throttleScale = 1.0; // can be lowered by external braking

  constructor(
    _scene: Scene,
    private readonly ship: Ship,
    private readonly keys: KeyboardInput,
    private readonly mouse: MouseInput,
    options: ShipControllerOptions = {},
  ) {
    this.opts = { ...DEFAULTS, ...options };
    // Ensure ship has a rotation quaternion.
    if (!ship.node.rotationQuaternion) {
      ship.node.rotationQuaternion = Quaternion.Identity();
    }
  }

  /** Per-frame physics step. dt in seconds. */
  update(dt: number): void {
    const opts = this.opts;
    const t = this.throttleScale;

    // ---- Angular: mouse delta + keyboard ----
    const delta = this.mouse.consumeDelta();
    if (delta.dx !== 0 || delta.dy !== 0) {
      // Apply yaw from horizontal delta, pitch from vertical delta.
      const yaw = -delta.dx * opts.mouseSensitivity;
      const pitch = -delta.dy * opts.mouseSensitivity;
      this.applyAngularDelta(yaw, pitch, 0, dt);
    }
    this.applyAngularDelta(
      this.keys.axis('roll') * opts.angThrottle * dt,
      this.keys.axis('pitch') * opts.angThrottle * dt,
      this.keys.axis('yaw') * opts.angThrottle * dt,
      dt,
    );

    // ---- Linear: thrust vector in body frame ----
    const boost = this.keys.axis('boost') ? opts.boostMultiplier : 1.0;
    const tx = this.keys.axis('thrust-x') * opts.mainThrottle * t * boost;
    const ty = this.keys.axis('thrust-y') * opts.mainThrottle * t * boost;
    const tz = this.keys.axis('thrust-z') * opts.mainThrottle * t * boost;

    if (tx !== 0 || ty !== 0 || tz !== 0) {
      // Body-frame thrust (W=+Z forward, A=-X left, Space=+Y up)
      // Transform to world using ship's current orientation.
      const m = this.ship.node.getWorldMatrix();
      const thrustLocal = new Vector3(tx, ty, tz);
      const worldThrust = new Vector3();
      Vector3.TransformNormalToRef(thrustLocal, m, worldThrust);
      this.ship.linearVelocity.addInPlace(worldThrust.scale(dt));
    }

    // ---- Brake: B key applies counter-velocity easing ----
    if (this.keys.isDown('KeyB')) {
      const ease = 4.0; // higher = harder brake
      const v = this.ship.linearVelocity;
      v.scaleInPlace(Math.max(0, 1 - ease * dt));
    }

    // ---- Linear damping ----
    this.ship.linearVelocity.scaleInPlace(Math.max(0, 1 - opts.linearDamping * dt));

    // ---- Angular damping ----
    this.ship.angularVelocity.scaleInPlace(Math.max(0, 1 - opts.angularDamping * dt));

    // ---- Speed cap ----
    const sp = this.ship.speed();
    if (sp > opts.maxSpeed) {
      this.ship.linearVelocity.scaleInPlace(opts.maxSpeed / sp);
    }

    // ---- Integrate position ----
    const v = this.ship.linearVelocity;
    this.ship.position.addInPlace(new Vector3(v.x * dt, v.y * dt, v.z * dt));

    // ---- Integrate rotation ----
    this.integrateRotation(dt);
  }

  /** Apply instantaneous angular impulse (radians), in body axes. */
  private applyAngularDelta(
    roll: number,
    pitch: number,
    yaw: number,
    _dt: number,
  ): void {
    // These are velocity contributions; integrate over dt.
    this.ship.angularVelocity.x += roll;
    this.ship.angularVelocity.y += pitch;
    this.ship.angularVelocity.z += yaw;
  }

  /** Integrate rotation from angular velocity (body-local). */
  private integrateRotation(dt: number): void {
    const av = this.ship.angularVelocity;
    if (av.lengthSquared() < 1e-8) return;

    const angle = av.length() * dt;
    const axis = av.normalize();

    // Build a quaternion that rotates by `angle` around `axis` in body-local space.
    const half = angle * 0.5;
    const s = Math.sin(half);
    const dq = new Quaternion(axis.x * s, axis.y * s, axis.z * s, Math.cos(half));

    // Apply: worldRot = worldRot * dq (since dq is in body frame, we left-multiply).
    const cur = this.ship.node.rotationQuaternion!;
    const out = cur.multiply(dq);
    out.normalize();
    cur.copyFrom(out);
  }

  /** Set throttle scaling (used by warp/brake systems later). */
  setThrottleScale(scale: number): void {
    this.throttleScale = Math.max(0, Math.min(1, scale));
  }
}