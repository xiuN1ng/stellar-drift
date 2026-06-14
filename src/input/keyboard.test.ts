import { describe, expect, it } from 'vitest';
import { KeyboardInput } from './keyboard.js';

describe('KeyboardInput', () => {
  it('axis thrust-z: W=+1, S=-1, both=0', () => {
    const k = new KeyboardInput();
    // Simulate by directly manipulating the held set.
    // (Bypassing DOM events because we're in node env.)
    (k as unknown as { down: Set<string> }).down.add('KeyW');
    expect(k.axis('thrust-z')).toBe(1);
    (k as unknown as { down: Set<string> }).down.delete('KeyW');
    (k as unknown as { down: Set<string> }).down.add('KeyS');
    expect(k.axis('thrust-z')).toBe(-1);
    (k as unknown as { down: Set<string> }).down.add('KeyW');
    expect(k.axis('thrust-z')).toBe(0);
  });

  it('axis thrust-x: D=+1, A=-1', () => {
    const k = new KeyboardInput();
    (k as unknown as { down: Set<string> }).down.add('KeyD');
    expect(k.axis('thrust-x')).toBe(1);
    (k as unknown as { down: Set<string> }).down.add('KeyA');
    expect(k.axis('thrust-x')).toBe(0);
  });

  it('axis roll: E=+1, Q=-1', () => {
    const k = new KeyboardInput();
    (k as unknown as { down: Set<string> }).down.add('KeyE');
    expect(k.axis('roll')).toBe(1);
    (k as unknown as { down: Set<string> }).down.delete('KeyE');
    (k as unknown as { down: Set<string> }).down.add('KeyQ');
    expect(k.axis('roll')).toBe(-1);
  });

  it('axis boost: ShiftLeft=1', () => {
    const k = new KeyboardInput();
    expect(k.axis('boost')).toBe(0);
    (k as unknown as { down: Set<string> }).down.add('ShiftLeft');
    expect(k.axis('boost')).toBe(1);
    (k as unknown as { down: Set<string> }).down.add('ShiftRight');
    expect(k.axis('boost')).toBe(1);
  });

  it('isDown reflects held set', () => {
    const k = new KeyboardInput();
    expect(k.isDown('KeyW')).toBe(false);
    (k as unknown as { down: Set<string> }).down.add('KeyW');
    expect(k.isDown('KeyW')).toBe(true);
  });
});