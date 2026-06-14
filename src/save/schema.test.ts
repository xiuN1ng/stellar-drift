import { describe, expect, it } from 'vitest';
import {
  makeDefaultPlayerState, envelope, migrate, isPlayerState,
  CURRENT_SCHEMA_VERSION, ARCHETYPE_LIST,
} from './schema.js';

describe('save schema', () => {
  it('default state has valid shape', () => {
    const s = makeDefaultPlayerState({ x: 1, y: 2, z: 3 });
    expect(isPlayerState(s)).toBe(true);
    expect(s.archetype).toBe('wanderer');
    expect(s.credits).toBeGreaterThanOrEqual(0);
  });

  it('envelope wraps with current version', () => {
    const s = makeDefaultPlayerState();
    const env = envelope(s);
    expect(env.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('migrates current version back to PlayerState', () => {
    const s = makeDefaultPlayerState();
    const env = envelope(s);
    const out = migrate(env);
    expect(out.archetype).toBe('wanderer');
    expect(out.createdAt).toBe(s.createdAt);
  });

  it('rejects future versions', () => {
    const env = { schemaVersion: 999, payload: {} };
    expect(() => migrate(env)).toThrow(/schema version/i);
  });

  it('rejects invalid payload at current version', () => {
    const env = { schemaVersion: CURRENT_SCHEMA_VERSION, payload: { archetype: 'wrong' } };
    expect(() => migrate(env)).toThrow();
  });

  it('ARCHETYPE_LIST has both archetypes', () => {
    const ids = ARCHETYPE_LIST.map((a) => a.id);
    expect(ids).toContain('wanderer');
    expect(ids).toContain('empire-builder');
  });
});