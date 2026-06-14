import { describe, expect, it } from 'vitest';
import { LandingController } from './LandingController.js';
import type { LandingTarget } from './LandingController.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';

class MockKeyboard {
  private held = new Set<string>();
  down(code: string): void { this.held.add(code); }
  up(code: string): void { this.held.delete(code); }
  isDown(code: string): boolean { return this.held.has(code); }
  heldKeys(): string[] { return Array.from(this.held); }
}

function makeController(state: 'orbit' | 'landed' = 'orbit'): {
  c: LandingController;
  keys: MockKeyboard;
} {
  const keys = new MockKeyboard() as unknown as ConstructorParameters<typeof LandingController>[2];
  const mouse = {} as ConstructorParameters<typeof LandingController>[3];
  const ship = {
    position: new Vector3(0, 0, 0),
    node: { position: new Vector3(0, 0, 0) },
    speed: () => 0,
  } as unknown as ConstructorParameters<typeof LandingController>[1];
  const c = new LandingController(null as never, ship, keys, mouse);
  c.state = state;
  if (state === 'landed') {
    c.currentPlanet = { center: new Vector3(0, 0, 5), radius: 1 };
  }
  return { c, keys: (keys as unknown as MockKeyboard) };
}

describe('LandingController.poll edge-trigger', () => {
  it('triggers only on rising edge of L key (orbit → landing)', () => {
    const { c, keys } = makeController('orbit');
    const planet: LandingTarget = { center: new Vector3(0, 0, 2), radius: 1 };
    expect(c.poll(planet)).toBeNull();
    keys.down('KeyL');
    expect(c.poll(planet)).toBe('landing');
    expect(c.poll(planet)).toBeNull();
    expect(c.poll(planet)).toBeNull();
  });

  it('triggers takeoff from landed state on L rising edge', () => {
    const { c, keys } = makeController('landed');
    const planet: LandingTarget = { center: new Vector3(0, 0, 2), radius: 1 };
    keys.down('KeyL');
    expect(c.poll(planet)).toBe('taking-off');
    expect(c.poll(planet)).toBeNull();
  });

  it('refuses landing if too far from planet', () => {
    const { c, keys } = makeController('orbit');
    const planet: LandingTarget = { center: new Vector3(1000, 0, 0), radius: 1 };
    keys.down('KeyL');
    expect(c.poll(planet)).toBeNull();
    expect(c.state).toBe('orbit');
  });

  it('refuses landing if ship is too fast', () => {
    const { c, keys } = makeController('orbit');
    // Override the ship speed via instance property
    Object.defineProperty(c, 'ship', {
      value: { speed: () => 100, position: new Vector3(0, 0, 0) },
      writable: true,
    });
    const planet: LandingTarget = { center: new Vector3(0, 0, 2), radius: 1 };
    keys.down('KeyL');
    expect(c.poll(planet)).toBeNull();
    expect(c.state).toBe('orbit');
  });

  it('does not re-trigger while state is non-orbit', () => {
    const { c, keys } = makeController('orbit');
    const planet: LandingTarget = { center: new Vector3(0, 0, 2), radius: 1 };
    keys.down('KeyL');
    expect(c.poll(planet)).toBe('landing');
    keys.up('KeyL');
    keys.down('KeyL');
    // State is 'landing', not 'orbit' or 'landed'.
    expect(c.poll(planet)).toBeNull();
  });
});