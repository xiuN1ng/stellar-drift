/**
 * Station manager — empire-builder exclusive.
 *
 * Players can found a station on a discovered planet (M4 simplified):
 *  - Must be in 'landed' state (M4 placeholder: actually any state).
 *  - Must have ≥ 50 credits (configurable).
 *  - One station per planet (deduplicated).
 *
 * Station record:
 *  - id: derived from planetId
 *  - planetId: where it lives
 *  - foundedAt: timestamp
 *
 * This module is pure logic — no mesh/spawn. The caller renders a beacon.
 */

import type { PlayerState } from '@game-types/index';
import { getArchetypeBehavior } from './archetype.js';

export const STATION_FOUND_COST = 50;

export interface StationRecord {
  id: string;
  planetId: string;
  foundedAt: number;
}

export interface FoundResult {
  ok: boolean;
  reason?: 'not-empire-builder' | 'insufficient-credits' | 'already-exists' | 'invalid-planet';
  station?: StationRecord;
}

export class StationManager {
  /**
   * Try to found a station on the given planet. Mutates PlayerState.
   */
  static found(player: PlayerState, planetId: string, now: number = Date.now()): FoundResult {
    if (player.archetype !== 'empire-builder') {
      return { ok: false, reason: 'not-empire-builder' };
    }
    if (!planetId) {
      return { ok: false, reason: 'invalid-planet' };
    }
    const id = `station-${planetId}`;
    if (player.foundedStations.includes(id)) {
      return { ok: false, reason: 'already-exists' };
    }
    if (player.credits < STATION_FOUND_COST) {
      return { ok: false, reason: 'insufficient-credits' };
    }
    player.credits -= STATION_FOUND_COST;
    player.foundedStations.push(id);
    const station: StationRecord = { id, planetId, foundedAt: now };
    return { ok: true, station };
  }

  /** Remove a station (refund 50%). */
  static dismantle(player: PlayerState, planetId: string): boolean {
    const id = `station-${planetId}`;
    const idx = player.foundedStations.indexOf(id);
    if (idx < 0) return false;
    player.foundedStations.splice(idx, 1);
    player.credits += Math.floor(STATION_FOUND_COST / 2);
    return true;
  }

  /**
   * Apply passive tax income (called once per second from main loop).
   * Only empire-builders with stations generate passive income.
   * Wanderers: 0.
   */
  static applyPassiveIncome(player: PlayerState, dtSec: number): number {
    if (player.archetype !== 'empire-builder') return 0;
    const behavior = getArchetypeBehavior('empire-builder');
    const gross = player.foundedStations.length * 0.5 * dtSec;
    const net = gross * (1 - behavior.passiveTaxRate);
    player.credits += net;
    return net;
  }
}