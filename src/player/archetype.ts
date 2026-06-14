/**
 * Player archetype system.
 *
 * Two archetypes:
 *  - wanderer: free exploration, no station pressure, exploration bonuses.
 *  - empire-builder: can found stations, has faction reputation, taxes income.
 *
 * Each archetype gets a small set of behavior modifiers that other systems
 * query. Adding new modifiers here is fine; behavior is centralized.
 *
 * Single source of truth: see ARCHETYPE_LIST in save/schema.ts.
 */

import type { PlayerArchetype, ResourceKind } from '@game-types/index';

export interface ArchetypeBehavior {
  /** Can player found a station at a discovered planet? */
  canFoundStation: boolean;
  /** Multiplier on credits earned from selling cargo (1.0 = baseline). */
  sellMultiplier: number;
  /** Tax rate on passive income (only empire-builder applies tax to self). */
  passiveTaxRate: number;
  /** Free cargo capacity bonus (units). */
  cargoBonus: number;
  /** Starting credits (replaces default when creating new player). */
  startingCredits: number;
  /** Resources the archetype can mine without specialized gear. */
  baselineResourceAccess: ResourceKind[];
}

const WANDERER: ArchetypeBehavior = {
  canFoundStation: false,
  sellMultiplier: 1.10, // wanderer gets a small "trade bonus"
  passiveTaxRate: 0.0,
  cargoBonus: 5,
  startingCredits: 250,
  baselineResourceAccess: ['carbon', 'iron', 'water'],
};

const EMPIRE_BUILDER: ArchetypeBehavior = {
  canFoundStation: true,
  sellMultiplier: 1.0,
  passiveTaxRate: 0.05, // 5% tax (applied to passive income only)
  cargoBonus: 15,
  startingCredits: 500,
  baselineResourceAccess: ['carbon', 'iron', 'copper', 'water'],
};

const BEHAVIORS: Record<PlayerArchetype, ArchetypeBehavior> = {
  wanderer: WANDERER,
  'empire-builder': EMPIRE_BUILDER,
};

export function getArchetypeBehavior(archetype: PlayerArchetype): ArchetypeBehavior {
  return BEHAVIORS[archetype];
}

/**
 * Whether a player can mine a given resource, considering upgrades (placeholder)
 * and archetype access.
 */
export function canMineResource(archetype: PlayerArchetype, kind: ResourceKind): boolean {
  return BEHAVIORS[archetype].baselineResourceAccess.includes(kind);
}