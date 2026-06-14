/**
 * Touch buttons — DOM-based press-and-hold buttons.
 *
 * Renders a row of buttons at the bottom of the screen. Each button
 * corresponds to a key code; while pressed, the key is held in a virtual
 * KeyboardInput-like state.
 *
 * Why not just use the existing KeyboardInput? Because touch buttons
 * need to be visible and respond to multi-touch; merging them into the
 * existing key set requires a parallel data path. We provide a small
 * adapter class.
 */

import { TouchInput } from './touch.js';

export type TouchKeyCode =
  | 'ShiftLeft' | 'ShiftRight'  // boost
  | 'KeyB'                      // brake
  | 'KeyF'                      // interact / mine
  | 'KeyL'                      // land / take off
  | 'KeyN'                      // build station
  | 'KeyR'                      // brake alternative (mobile-friendly)
  ;

export interface TouchButtonOptions {
  /** Button visual size (px). */
  size?: number;
  /** Right-edge offset (px). */
  rightOffset?: number;
  /** Bottom-edge offset (px). */
  bottomOffset?: number;
}

const DEFAULT_SIZE = 70;
const DEFAULT_RIGHT = 24;
const DEFAULT_BOTTOM = 120;

const BUTTON_DEFS: Array<{
  key: TouchKeyCode;
  label: string;
  color: string;
}> = [
  { key: 'ShiftLeft', label: '加速', color: 'rgba(255, 200, 100, 0.5)' },
  { key: 'KeyB', label: '刹车', color: 'rgba(255, 100, 100, 0.5)' },
  { key: 'KeyL', label: '着陆', color: 'rgba(100, 200, 255, 0.5)' },
  { key: 'KeyF', label: '采集', color: 'rgba(100, 255, 150, 0.5)' },
  { key: 'KeyN', label: '建站', color: 'rgba(220, 150, 255, 0.5)' },
];

export class TouchButtons {
  /** Currently held keys (multi-button multi-touch). */
  readonly held = new Set<TouchKeyCode>();

  private readonly container: HTMLElement;
  private readonly buttons = new Map<TouchKeyCode, HTMLElement>();
  private readonly opts: Required<TouchButtonOptions>;
  private readonly buttonRects = new Map<TouchKeyCode, DOMRect>();

  constructor(
    parent: HTMLElement,
    _touch: TouchInput,
    options: TouchButtonOptions = {},
  ) {
    this.opts = {
      size: options.size ?? DEFAULT_SIZE,
      rightOffset: options.rightOffset ?? DEFAULT_RIGHT,
      bottomOffset: options.bottomOffset ?? DEFAULT_BOTTOM,
    };
    this.container = document.createElement('div');
    this.container.id = 'touch-buttons';
    parent.appendChild(this.container);
    this.build();
    this.injectStyles();
  }

  /** Update button rects (call on resize / scroll). */
  refreshRects(): void {
    this.buttonRects.clear();
    for (const [key, el] of this.buttons) {
      this.buttonRects.set(key, el.getBoundingClientRect());
    }
  }

  /** Returns true if a touch pointer is currently in the given button rect. */
  isPressedInButton(pointerX: number, pointerY: number, key: TouchKeyCode): boolean {
    const rect = this.buttonRects.get(key);
    if (!rect) return false;
    return pointerX >= rect.left && pointerX <= rect.right
        && pointerY >= rect.top && pointerY <= rect.bottom;
  }

  /** Find which button (if any) is at (x, y). Returns the key or null. */
  buttonAt(pointerX: number, pointerY: number): TouchKeyCode | null {
    for (const [key, rect] of this.buttonRects) {
      if (pointerX >= rect.left && pointerX <= rect.right
          && pointerY >= rect.top && pointerY <= rect.bottom) {
        return key;
      }
    }
    return null;
  }

  /** Mark a key as held (called by main loop on pointer-down inside button). */
  press(key: TouchKeyCode): void {
    if (this.held.has(key)) return;
    this.held.add(key);
    const btn = this.buttons.get(key);
    if (btn) btn.classList.add('pressed');
  }

  release(key: TouchKeyCode): void {
    if (!this.held.delete(key)) return;
    const btn = this.buttons.get(key);
    if (btn) btn.classList.remove('pressed');
  }

  /** Release all (e.g., on focus loss). */
  releaseAll(): void {
    for (const key of Array.from(this.held)) {
      this.release(key);
    }
  }

  isDown(key: TouchKeyCode): boolean {
    return this.held.has(key);
  }

  private build(): void {
    for (let i = 0; i < BUTTON_DEFS.length; i++) {
      const def = BUTTON_DEFS[i];
      const btn = document.createElement('button');
      btn.className = 'touch-btn';
      btn.textContent = def.label;
      btn.style.background = def.color;
      // Stack from right side, vertically.
      btn.style.right = `${this.opts.rightOffset}px`;
      btn.style.bottom = `${this.opts.bottomOffset + i * (this.opts.size + 8)}px`;
      btn.style.width = `${this.opts.size}px`;
      btn.style.height = `${this.opts.size}px`;
      this.container.appendChild(btn);
      this.buttons.set(def.key, btn);
      this.buttonRects.set(def.key, btn.getBoundingClientRect());
    }
  }

  private injectStyles(): void {
    if (document.getElementById('touch-btn-styles')) return;
    const style = document.createElement('style');
    style.id = 'touch-btn-styles';
    style.textContent = `
      #touch-buttons {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 55;
      }
      .touch-btn {
        position: fixed;
        border-radius: 50%;
        border: 2px solid rgba(255, 255, 255, 0.5);
        color: white;
        font-size: 14px;
        font-weight: 500;
        letter-spacing: 1px;
        text-shadow: 0 0 4px rgba(0, 0, 0, 0.7);
        pointer-events: auto;
        touch-action: none;
        user-select: none;
        cursor: pointer;
        transition: transform 0.1s;
      }
      .touch-btn.pressed {
        transform: scale(0.9);
        background: rgba(255, 255, 255, 0.6) !important;
      }
    `;
    document.head.appendChild(style);
  }

  dispose(): void {
    this.container.remove();
  }
}