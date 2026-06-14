/**
 * Virtual joystick — DOM-based, dual-zone layout.
 *
 * Layout:
 *  - Left half of screen: thrust joystick (WASD + Space/Ctrl)
 *  - Right half of screen: aim joystick (mouse delta equivalent)
 *
 * Each joystick is a translucent disc that appears when the user touches
 * that half. Drag away from center to set axis value.
 *
 * Outputs go to a simple `axis` object { x, y } in [-1, 1].
 */

import { TouchInput, type TouchPointer } from './touch.js';

export interface JoystickAxis {
  x: number; // -1..1 (right=+1, left=-1)
  y: number; // -1..1 (up=-1, down=+1 in screen coords)
}

export interface VirtualJoystickOptions {
  /** Which half of the screen this joystick owns. */
  half: 'left' | 'right';
  /** Maximum drag radius (px). */
  maxRadius?: number;
  /** Dead zone radius (px). Inputs inside this round to 0. */
  deadZone?: number;
}

export class VirtualJoystick {
  readonly axis: JoystickAxis = { x: 0, y: 0 };
  /** Current owning pointer id, or null if not active. */
  activePointerId: number | null = null;

  private readonly opts: Required<VirtualJoystickOptions>;
  private readonly container: HTMLElement;
  private readonly base: HTMLElement;
  private readonly knob: HTMLElement;
  /** Position of base center (re-set on press). */
  private centerX = 0;
  private centerY = 0;

  constructor(
    parent: HTMLElement,
    _touch: TouchInput,
    options: VirtualJoystickOptions,
  ) {
    this.opts = {
      half: options.half,
      maxRadius: options.maxRadius ?? 60,
      deadZone: options.deadZone ?? 12,
    };

    this.container = document.createElement('div');
    this.container.className = `joystick-container joystick-${this.opts.half}`;

    this.base = document.createElement('div');
    this.base.className = 'joystick-base';

    this.knob = document.createElement('div');
    this.knob.className = 'joystick-knob';

    this.base.appendChild(this.knob);
    this.container.appendChild(this.base);
    parent.appendChild(this.container);

    this.injectStyles();
    this.hide();
  }

  /**
   * Process a touch pointer that just pressed down. Returns true if the
   * joystick claimed it.
   */
  tryCapture(pointer: TouchPointer): boolean {
    if (this.activePointerId !== null) return false;
    const halfWidth = window.innerWidth / 2;
    const inHalf = this.opts.half === 'left'
      ? pointer.x < halfWidth
      : pointer.x >= halfWidth;
    if (!inHalf) return false;
    this.activePointerId = pointer.id;
    this.centerX = pointer.x;
    this.centerY = pointer.y;
    this.base.style.left = `${this.centerX - this.opts.maxRadius}px`;
    this.base.style.top = `${this.centerY - this.opts.maxRadius}px`;
    this.show();
    this.updateKnob(pointer);
    return true;
  }

  /** Process pointer move. */
  onMove(pointer: TouchPointer): void {
    if (pointer.id !== this.activePointerId) return;
    this.updateKnob(pointer);
  }

  /** Process pointer up. */
  onUp(pointer: TouchPointer): void {
    if (pointer.id !== this.activePointerId) return;
    this.activePointerId = null;
    this.axis.x = 0;
    this.axis.y = 0;
    this.knob.style.transform = 'translate(0, 0)';
    this.hide();
  }

  private updateKnob(pointer: TouchPointer): void {
    const dx = pointer.x - this.centerX;
    const dy = pointer.y - this.centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    let clampedDx = dx;
    let clampedDy = dy;
    if (dist > this.opts.maxRadius) {
      clampedDx = (dx / dist) * this.opts.maxRadius;
      clampedDy = (dy / dist) * this.opts.maxRadius;
    }

    // Apply dead zone.
    let ax = 0;
    let ay = 0;
    if (dist > this.opts.deadZone) {
      ax = clampedDx / this.opts.maxRadius;
      ay = clampedDy / this.opts.maxRadius;
    }

    // Clamp to [-1, 1].
    this.axis.x = Math.max(-1, Math.min(1, ax));
    this.axis.y = Math.max(-1, Math.min(1, ay));

    this.knob.style.transform = `translate(${clampedDx}px, ${clampedDy}px)`;
  }

  private show(): void {
    this.container.style.opacity = '1';
  }

  private hide(): void {
    this.container.style.opacity = '0';
  }

  private injectStyles(): void {
    if (document.getElementById('joystick-styles')) return;
    const style = document.createElement('style');
    style.id = 'joystick-styles';
    style.textContent = `
      .joystick-container {
        position: fixed;
        top: 0;
        left: 0;
        width: 0;
        height: 0;
        opacity: 0;
        pointer-events: none;
        z-index: 60;
        transition: opacity 0.15s;
      }
      .joystick-base {
        position: absolute;
        width: 120px;
        height: 120px;
        border-radius: 50%;
        background: radial-gradient(circle at center, rgba(140, 180, 255, 0.25), rgba(20, 30, 60, 0.5));
        border: 2px solid rgba(180, 220, 255, 0.4);
        box-shadow: 0 0 12px rgba(120, 180, 255, 0.3);
      }
      .joystick-knob {
        position: absolute;
        left: 50%;
        top: 50%;
        width: 56px;
        height: 56px;
        margin-left: -28px;
        margin-top: -28px;
        border-radius: 50%;
        background: radial-gradient(circle at 35% 35%, rgba(220, 240, 255, 0.95), rgba(100, 150, 230, 0.8));
        box-shadow: 0 0 8px rgba(180, 220, 255, 0.6);
        transition: transform 0.05s linear;
      }
    `;
    document.head.appendChild(style);
  }

  dispose(): void {
    this.container.remove();
    if (document.getElementById('joystick-styles') && !document.querySelector('.joystick-container')) {
      document.getElementById('joystick-styles')?.remove();
    }
  }
}