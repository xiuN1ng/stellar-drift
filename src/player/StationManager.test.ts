import { describe, expect, it } from 'vitest';
import { StationManager, STATION_FOUND_COST } from './StationManager.js';
import type { PlayerState } from '@game-types/index';

function makePlayer(archetype: PlayerState['archetype'] = 'empire-builder'): PlayerState {
  return {
    archetype,
    currentGalaxy: { x: 0, y: 0, z: 0 },
    currentSystem: null,
    credits: STATION_FOUND_COST * 2,
    cargo: {},
    upgrades: { engine: 0, cargo: 0, scanner: 0, shield: 0 },
    discoveredPlanets: [],
    foundedStations: [],
    reputation: 0,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('StationManager', () => {
  it('empire-builder can found a station', () => {
    const p = makePlayer();
    const r = StationManager.found(p, 'planet-1');
    expect(r.ok).toBe(true);
    expect(p.credits).toBe(STATION_FOUND_COST);
    expect(p.foundedStations).toContain('station-planet-1');
  });

  it('wanderer cannot found a station', () => {
    const p = makePlayer('wanderer');
    const r = StationManager.found(p, 'planet-1');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('not-empire-builder');
    expect(p.foundedStations).toHaveLength(0);
  });

  it('rejects duplicate station on same planet', () => {
    const p = makePlayer();
    StationManager.found(p, 'planet-1');
    const r2 = StationManager.found(p, 'planet-1');
    expect(r2.ok).toBe(false);
    expect(r2.reason).toBe('already-exists');
  });

  it('rejects when insufficient credits', () => {
    const p = makePlayer();
    p.credits = 10;
    const r = StationManager.found(p, 'planet-1');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('insufficient-credits');
  });

  it('dismantle refunds half and removes from list', () => {
    const p = makePlayer();
    StationManager.found(p, 'planet-1');
    const before = p.credits;
    const ok = StationManager.dismantle(p, 'planet-1');
    expect(ok).toBe(true);
    expect(p.foundedStations).toHaveLength(0);
    expect(p.credits).toBe(before + Math.floor(STATION_FOUND_COST / 2));
  });

  it('dismantle returns false if station not found', () => {
    const p = makePlayer();
    expect(StationManager.dismantle(p, 'planet-99')).toBe(false);
  });

  it('passive income for empire-builder scales with station count', () => {
    const p = makePlayer('empire-builder');
    StationManager.found(p, 'planet-1');
    StationManager.found(p, 'planet-2');
    const before = p.credits;
    // 2 stations × 0.5/sec × 10 sec = 10 (gross), minus 5% tax → 9.5
    const earned = StationManager.applyPassiveIncome(p, 10);
    expect(earned).toBeGreaterThan(0);
    expect(p.credits).toBeCloseTo(before + earned, 5);
  });

  it('passive income is zero for wanderer', () => {
    const p = makePlayer('wanderer');
    p.foundedStations.push('station-illegal');
    const earned = StationManager.applyPassiveIncome(p, 10);
    expect(earned).toBe(0);
  });
});