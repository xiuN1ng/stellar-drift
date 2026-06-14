import { describe, expect, it } from 'vitest';
import { ReputationSystem } from './ReputationSystem.js';
import type { PlayerState } from '@game-types/index';

function makePlayer(): PlayerState {
  return {
    archetype: 'wanderer',
    currentGalaxy: { x: 0, y: 0, z: 0 },
    currentSystem: null,
    credits: 0,
    cargo: {},
    upgrades: { engine: 0, cargo: 0, scanner: 0, shield: 0 },
    discoveredPlanets: [],
    foundedStations: [],
    reputation: 0,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('ReputationSystem', () => {
  it('discoverPlanet adds +1 reputation', () => {
    const p = makePlayer();
    const isNew = ReputationSystem.discoverPlanet(p, 'planet-1');
    expect(isNew).toBe(true);
    expect(p.reputation).toBe(1);
    expect(p.discoveredPlanets).toContain('planet-1');
  });

  it('discoverPlanet is idempotent', () => {
    const p = makePlayer();
    ReputationSystem.discoverPlanet(p, 'planet-1');
    const isNew = ReputationSystem.discoverPlanet(p, 'planet-1');
    expect(isNew).toBe(false);
    expect(p.reputation).toBe(1);
  });

  it('tierName classifies reputation correctly', () => {
    expect(ReputationSystem.tierName(0)).toBe('无名');
    expect(ReputationSystem.tierName(2)).toBe('无名');
    expect(ReputationSystem.tierName(3)).toBe('初出茅庐');
    expect(ReputationSystem.tierName(15)).toBe('活跃');
    expect(ReputationSystem.tierName(50)).toBe('著名');
    expect(ReputationSystem.tierName(150)).toBe('传奇');
  });

  it('computeFromState derives reputation correctly', () => {
    const p = makePlayer();
    p.discoveredPlanets = ['a', 'b', 'c']; // +3
    p.foundedStations = ['s1', 's2'];     // +10
    expect(ReputationSystem.computeFromState(p)).toBe(13);
  });
});