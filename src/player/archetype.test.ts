import { describe, expect, it } from 'vitest';
import {
  getArchetypeBehavior, canMineResource,
} from './archetype.js';

describe('archetype behavior', () => {
  it('wanderer cannot found station', () => {
    const b = getArchetypeBehavior('wanderer');
    expect(b.canFoundStation).toBe(false);
  });

  it('empire-builder can found station', () => {
    const b = getArchetypeBehavior('empire-builder');
    expect(b.canFoundStation).toBe(true);
  });

  it('empire-builder gets more starting credits', () => {
    const w = getArchetypeBehavior('wanderer');
    const e = getArchetypeBehavior('empire-builder');
    expect(e.startingCredits).toBeGreaterThan(w.startingCredits);
  });

  it('wanderer can mine basic resources', () => {
    expect(canMineResource('wanderer', 'carbon')).toBe(true);
    expect(canMineResource('wanderer', 'iron')).toBe(true);
    expect(canMineResource('wanderer', 'water')).toBe(true);
  });

  it('wanderer cannot mine exotic by default', () => {
    expect(canMineResource('wanderer', 'exotic')).toBe(false);
  });

  it('empire-builder can mine copper', () => {
    expect(canMineResource('empire-builder', 'copper')).toBe(true);
  });

  it('empire-builder passive tax rate > 0', () => {
    expect(getArchetypeBehavior('empire-builder').passiveTaxRate).toBeGreaterThan(0);
  });

  it('wanderer passive tax rate is 0', () => {
    expect(getArchetypeBehavior('wanderer').passiveTaxRate).toBe(0);
  });
});