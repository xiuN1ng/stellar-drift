/**
 * localStorage save service.
 *
 * Wraps PlayerState in an envelope with schemaVersion. On load, migrates
 * forward. On quota error, falls back to an in-memory buffer and surfaces
 * the error to caller.
 */

import {
  SAVE_KEY, CURRENT_SCHEMA_VERSION, envelope, migrate,
  makeDefaultPlayerState, isPlayerState,
} from './schema.js';
import type { PlayerState } from '@game-types/index';

export interface SaveResult {
  ok: boolean;
  reason?: string;
}

const memoryFallback: Record<string, string> = {};

/**
 * Save current PlayerState to localStorage.
 * Auto-debounced; callers can call frequently.
 */
let saveTimer: number | null = null;
let pendingState: PlayerState | null = null;

export function save(state: PlayerState, immediate: boolean = false): SaveResult {
  pendingState = { ...state, updatedAt: Date.now() };

  const flush = (): void => {
    if (!pendingState) return;
    const env = envelope(pendingState);
    const json = JSON.stringify(env);
    try {
      localStorage.setItem(SAVE_KEY, json);
      memoryFallback[SAVE_KEY] = json;
    } catch (err) {
      // QuotaExceeded or SecurityError (private mode).
      try {
        memoryFallback[SAVE_KEY] = json;
      } catch {
        // ignore
      }
      if (immediate) {
        throw err;
      }
    }
    pendingState = null;
    saveTimer = null;
  };

  if (immediate) {
    flush();
    return { ok: true };
  }

  if (saveTimer !== null) {
    clearTimeout(saveTimer);
  }
  saveTimer = window.setTimeout(flush, 800);
  return { ok: true };
}

/**
 * Force-flush any pending debounced save.
 * Call this on page unload.
 */
export function flushSave(): void {
  if (saveTimer !== null && pendingState) {
    clearTimeout(saveTimer);
    const env = envelope(pendingState);
    const json = JSON.stringify(env);
    try {
      localStorage.setItem(SAVE_KEY, json);
    } catch {
      memoryFallback[SAVE_KEY] = json;
    }
    saveTimer = null;
    pendingState = null;
  }
}

/**
 * Load PlayerState from storage. Returns null if no save exists.
 * Throws if save exists but cannot be migrated.
 */
export function load(): PlayerState | null {
  const raw = localStorage.getItem(SAVE_KEY) ?? memoryFallback[SAVE_KEY];
  if (!raw) return null;

  let env: { schemaVersion: number; payload: unknown };
  try {
    env = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Save file is corrupted: ${(err as Error).message}`);
  }
  if (typeof env.schemaVersion !== 'number') {
    throw new Error('Save file missing schemaVersion');
  }
  if (env.schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Save is from a newer version (v${env.schemaVersion}) — please update`,
    );
  }
  return migrate(env);
}

/** Drop the current save (for "new game" flow). */
export function resetSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
  delete memoryFallback[SAVE_KEY];
}

/**
 * Convenience: load existing save or create a fresh one.
 */
export function loadOrCreate(): PlayerState {
  try {
    const existing = load();
    if (existing) return existing;
  } catch (err) {
    console.warn('[save] failed to load:', err);
    // Continue to fresh state.
  }
  return makeDefaultPlayerState();
}

/** Test helper: inspect raw storage without migration. */
export function _debugRaw(): string | null {
  return localStorage.getItem(SAVE_KEY) ?? memoryFallback[SAVE_KEY] ?? null;
}

/** Re-export for callers who want the schema validator. */
export { isPlayerState };
export { CURRENT_SCHEMA_VERSION };