import { describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';

import { KeyboardInput } from '@input/keyboard.js';
import { MouseInput } from '@input/mouse.js';
import { Ship } from './Ship.js';
import { ShipController } from './ShipController.js';

function makeController(): {
  engine: NullEngine;
  scene: Scene;
  ship: Ship;
  keys: KeyboardInput;
  mouse: MouseInput;
  controller: ShipController;
} {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const ship = new Ship(scene, 'test-ship');
  const keys = new KeyboardInput();
  const mouse = new MouseInput();
  const controller = new ShipController(scene, ship, keys, mouse);
  return { engine, scene, ship, keys, mouse, controller };
}

function dispose(engine: NullEngine, scene: Scene): void {
  scene.dispose();
  engine.dispose();
}

describe('ShipController angular controls', () => {
  it('maps mouse horizontal movement to yaw, not pitch or roll', () => {
    const { engine, scene, ship, mouse, controller } = makeController();
    mouse.injectDelta(100, 0);
    controller.update(1 / 60);

    expect(Math.abs(ship.angularVelocity.x)).toBeLessThan(1e-6);
    expect(ship.angularVelocity.y).toBeGreaterThan(0);
    expect(Math.abs(ship.angularVelocity.z)).toBeLessThan(1e-6);
    dispose(engine, scene);
  });

  it('maps keyboard pitch, yaw, and roll to separate local axes', () => {
    const { engine, scene, ship, keys, controller } = makeController();

    keys.injectKey('KeyI', true);
    controller.update(1 / 60);
    expect(ship.angularVelocity.x).toBeGreaterThan(0);
    expect(Math.abs(ship.angularVelocity.y)).toBeLessThan(1e-6);
    expect(Math.abs(ship.angularVelocity.z)).toBeLessThan(1e-6);

    ship.angularVelocity.set(0, 0, 0);
    keys.injectKey('KeyI', false);
    keys.injectKey('ArrowRight', true);
    controller.update(1 / 60);
    expect(Math.abs(ship.angularVelocity.x)).toBeLessThan(1e-6);
    expect(ship.angularVelocity.y).toBeGreaterThan(0);
    expect(Math.abs(ship.angularVelocity.z)).toBeLessThan(1e-6);

    ship.angularVelocity.set(0, 0, 0);
    keys.injectKey('ArrowRight', false);
    keys.injectKey('KeyE', true);
    controller.update(1 / 60);
    expect(Math.abs(ship.angularVelocity.x)).toBeLessThan(1e-6);
    expect(Math.abs(ship.angularVelocity.y)).toBeLessThan(1e-6);
    expect(ship.angularVelocity.z).toBeGreaterThan(0);

    dispose(engine, scene);
  });

  it('does not treat L as yaw because L is reserved for landing', () => {
    const { engine, scene, ship, keys, controller } = makeController();
    keys.injectKey('KeyL', true);
    controller.update(1 / 60);

    expect(ship.angularVelocity.length()).toBeLessThan(1e-6);
    dispose(engine, scene);
  });

  it('lets angular velocity decay instead of normalizing it back to full strength', () => {
    const { engine, scene, ship, mouse, controller } = makeController();
    mouse.injectDelta(100, 0);
    controller.update(1 / 60);
    const initialYaw = Math.abs(ship.angularVelocity.y);

    for (let i = 0; i < 120; i++) {
      controller.update(1 / 60);
    }

    expect(initialYaw).toBeGreaterThan(0);
    expect(Math.abs(ship.angularVelocity.y)).toBeLessThan(initialYaw * 0.1);
    dispose(engine, scene);
  });
});
