/**
 * Reputation system.
 *
 * Wanderers and empire-builders both earn reputation, but in different ways:
 *  - Wanderers: each newly-discovered planet adds +1.
 *  - Empire-builders: each founded station adds +5 (per planet controlled).
 *
 * Reputation is a simple int counter, persisted in PlayerState. No upper cap
 * in M4 — by design, players can grind indefinitely.
 *
 * Side-effects of reputation: stored alongside other state; future milestones
 * (M5+) may unlock content based on thresholds.
 */

import type { PlayerState } from '@game-types/index';

const REWARD_PER_DISCOVERY = 1;
const REWARD_PER_STATION = 5;

export class ReputationSystem {
  /**
   * Mark a planet as discovered. Idempotent (no duplicate rewards).
   * Returns true if this was a new discovery.
   */
  static discoverPlanet(player: PlayerState, planetId: string): boolean {
    if (player.discoveredPlanets.includes(planetId)) return false;
    player.discoveredPlanets.push(planetId);
    player.reputation = (player.reputation ?? 0) + REWARD_PER_DISCOVERY;
    return true;
  }

  /** Get reputation tier name (M4 placeholder tiers). */
  static tierName(reputation: number): string {
    if (reputation >= 100) return '传奇';
    if (reputation >= 50) return '著名';
    if (reputation >= 20) return '知名';
    if (reputation >= 10) return '活跃';
    if (reputation >= 3) return '初出茅庐';
    return '无名';
  }

  /** Compute total reputation from state (for verification / re-derivation). */
  static computeFromState(player: PlayerState): number {
    const fromDiscoveries = player.discoveredPlanets.length * REWARD_PER_DISCOVERY;
    const fromStations = player.foundedStations.length * REWARD_PER_STATION;
    return fromDiscoveries + fromStations;
  }
}