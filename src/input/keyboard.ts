/**
 * Keyboard input layer — key down/up aggregator.
 *
 * Decouples key binding logic from controllers. Exposes:
 *  - isDown(code) for held keys
 *  - axis(name) for combined WASD-like vectors
 *  - subscribe(event) for tap-style events (fire on initial press only)
 *
 * Designed to be engine-agnostic: no Babylon imports.
 */

export type KeyCode = string; // event.code, e.g. 'KeyW', 'Space', 'ShiftLeft'

export type AxisName =
  | 'thrust-x'   // strafe left/right (A/D)
  | 'thrust-y'   // lift up/down (Space/Shift)
  | 'thrust-z'   // forward/back (W/S)
  | 'roll'       // Q/E
  | 'pitch'      // I/K
  | 'yaw'        // J/L
  | 'boost';     // Shift modifier

export interface KeyEvent {
  code: KeyCode;
  type: 'down' | 'up';
}

export class KeyboardInput {
  private readonly down = new Set<KeyCode>();
  private readonly listeners = new Set<(e: KeyEvent) => void>();

  /** Attach to a window/element. Idempotent. */
  attach(target: Window | HTMLElement = window): void {
    target.addEventListener('keydown', this.onDown as EventListener);
    target.addEventListener('keyup', this.onUp as EventListener);
    // Drop focus loss drops all keys (otherwise stuck-key bug).
    if (target === window) {
      window.addEventListener('blur', this.onBlur as EventListener);
    }
  }

  detach(target: Window | HTMLElement = window): void {
    target.removeEventListener('keydown', this.onDown as EventListener);
    target.removeEventListener('keyup', this.onUp as EventListener);
    if (target === window) {
      window.removeEventListener('blur', this.onBlur as EventListener);
    }
  }

  subscribe(fn: (e: KeyEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  isDown(code: KeyCode): boolean {
    return this.down.has(code);
  }

  /** Returns combined axis value in [-1, 1]. */
  axis(name: AxisName): number {
    switch (name) {
      case 'thrust-x':
        return (this.down.has('KeyD') ? 1 : 0) - (this.down.has('KeyA') ? 1 : 0);
      case 'thrust-y':
        return (this.down.has('Space') ? 1 : 0) - (this.down.has('ControlLeft') ? 1 : 0);
      case 'thrust-z':
        return (this.down.has('KeyW') ? 1 : 0) - (this.down.has('KeyS') ? 1 : 0);
      case 'roll':
        return (this.down.has('KeyE') ? 1 : 0) - (this.down.has('KeyQ') ? 1 : 0);
      case 'pitch':
        return (this.down.has('KeyI') ? 1 : 0) - (this.down.has('KeyK') ? 1 : 0);
      case 'yaw':
        return (this.down.has('KeyL') ? 1 : 0) - (this.down.has('KeyJ') ? 1 : 0);
      case 'boost':
        return this.down.has('ShiftLeft') || this.down.has('ShiftRight') ? 1 : 0;
    }
  }

  /** Snapshot of all held keys (for debug/UI). */
  heldKeys(): KeyCode[] {
    return Array.from(this.down);
  }

  /**
   * Inject a held key state from an external input source (e.g., touch button).
   * Use to merge touch + keyboard input without forcing all sources through DOM events.
   * Idempotent.
   */
  injectKey(code: KeyCode, held: boolean): void {
    if (held) {
      if (!this.down.has(code)) {
        this.down.add(code);
        this.emit({ code, type: 'down' });
      }
    } else {
      if (this.down.delete(code)) {
        this.emit({ code, type: 'up' });
      }
    }
  }

  private onDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    this.down.add(e.code);
    this.emit({ code: e.code, type: 'down' });
  };

  private onUp = (e: KeyboardEvent): void => {
    this.down.delete(e.code);
    this.emit({ code: e.code, type: 'up' });
  };

  private onBlur = (): void => {
    this.down.clear();
  };

  private emit(e: KeyEvent): void {
    for (const l of this.listeners) l(e);
  }
}

/**
 * Standard key bindings for Stellar Drift.
 * Keep this map as the single source of truth for rebinding UI.
 */
export const KEY_BINDINGS: Array<{ action: string; keys: KeyCode[] }> = [
  { action: '推进', keys: ['KeyW'] },
  { action: '减速', keys: ['KeyS'] },
  { action: '左移', keys: ['KeyA'] },
  { action: '右移', keys: ['KeyD'] },
  { action: '上升', keys: ['Space'] },
  { action: '下降', keys: ['ControlLeft'] },
  { action: '左翻滚', keys: ['KeyQ'] },
  { action: '右翻滚', keys: ['KeyE'] },
  { action: '加速', keys: ['ShiftLeft', 'ShiftRight'] },
  { action: '刹车', keys: ['KeyB'] },
  { action: '互动', keys: ['KeyF'] },
  { action: '着陆', keys: ['KeyL'] },
  { action: '暂停', keys: ['Escape'] },
];