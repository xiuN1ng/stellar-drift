/**
 * Save schema definitions and migrations.
 *
 * Rules:
 * - `schemaVersion` MUST be bumped on any breaking change to PlayerState.
 * - Migrations are applied in order. If we can't migrate forward, we surface
 *   an error to the user instead of silently losing data.
 */

import type {
  PlayerState, PlayerArchetype, GalaxyCoord,
} from '@game-types/index';

export const SAVE_KEY = 'stellar-drift:save';
export const CURRENT_SCHEMA_VERSION = 1;

/** A snapshot we accept on load. Older versions are migrated up. */
export interface SaveEnvelope {
  schemaVersion: number;
  payload: unknown;
}

/**
 * Make a fresh default PlayerState.
 */
export function makeDefaultPlayerState(coord: GalaxyCoord = { x: 0, y: 0, z: 0 }): PlayerState {
  const now = Date.now();
  return {
    archetype: 'wanderer',
    currentGalaxy: coord,
    currentSystem: null,
    credits: 100,
    cargo: {},
    upgrades: {
      engine: 0,
      cargo: 0,
      scanner: 0,
      shield: 0,
    },
    discoveredPlanets: [],
    foundedStations: [],
    reputation: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Type guard: is the unknown blob a valid v1 PlayerState?
 * Used after migrations to assert the output is loadable.
 */
export function isPlayerState(v: unknown): v is PlayerState {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  if (o.archetype !== 'wanderer' && o.archetype !== 'empire-builder') return false;
  if (!o.currentGalaxy || typeof o.currentGalaxy !== 'object') return false;
  if (typeof o.credits !== 'number') return false;
  if (!o.upgrades || typeof o.upgrades !== 'object') return false;
  if (!Array.isArray(o.discoveredPlanets)) return false;
  if (!Array.isArray(o.foundedStations)) return false;
  if (typeof o.reputation !== 'number') return false;
  return true;
}

/**
 * Migrate any prior-version envelope up to CURRENT_SCHEMA_VERSION.
 * Throws on data that can't be migrated.
 */
export function migrate(env: SaveEnvelope): PlayerState {
  let p: unknown = env.payload;

  if (env.schemaVersion === CURRENT_SCHEMA_VERSION) {
    if (!isPlayerState(p)) {
      throw new Error('Save payload failed v1 validation');
    }
    return p;
  }

  // Future migrations:
  // if (env.schemaVersion === 1) p = migrateV1ToV2(p);
  // if (env.schemaVersion === 2) p = migrateV2ToV3(p);

  throw new Error(
    `Unsupported save schema version: ${env.schemaVersion} ` +
    `(current: ${CURRENT_SCHEMA_VERSION})`,
  );
}

/**
 * Wrap a PlayerState into an envelope at the current version.
 */
export function envelope(state: PlayerState): SaveEnvelope {
  return { schemaVersion: CURRENT_SCHEMA_VERSION, payload: state };
}

/** Pick a player archetype by index (used by startup menu). */
export const ARCHETYPE_LIST: Array<{ id: PlayerArchetype; title: string; desc: string }> = [
  {
    id: 'wanderer',
    title: '旅行者',
    desc: '自由探索，没有基地压力。适合想慢慢逛宇宙的玩家。',
  },
  {
    id: 'empire-builder',
    title: '帝国建造者',
    desc: '可占点建空间站、有派系声望、税收收入。适合喜欢经营的玩家。',
  },
];