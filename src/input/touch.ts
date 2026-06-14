/**
 * Touch input abstraction.
 *
 * Wraps Pointer Events to provide:
 *  - Active pointer tracking (multi-touch)
 *  - Per-pointer position + delta
 *  - Per-pointer gesture state (press / move / release)
 *
 * Works uniformly across touch screens, mouse, and stylus.
 *
 * Why not Babylon GUI? Babylon GUI is great but has a learning curve and
 * pulls in extra dependencies. For MVP we build DOM-based touch UI:
 *  - Better cross-device behavior (works in iframe too)
 *  - Easier to style with CSS
 *  - Less performance overhead than GUI on low-end mobile
 *
 * Auto-detects touch support via 'ontouchstart' in window.
 */

export interface TouchPointer {
  id: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  prevX: number;
  prevY: number;
  startTime: number;
  isActive: boolean;
}

export interface TouchInputOptions {
  /** Element to attach listeners to (defaults to body). */
  element?: HTMLElement;
}

export class TouchInput {
  private readonly element: HTMLElement;
  private readonly pointers = new Map<number, TouchPointer>();
  private readonly listeners = new Set<(e: TouchEventData) => void>();
  private attached = false;

  constructor(options: TouchInputOptions = {}) {
    this.element = options.element ?? document.body;
  }

  attach(): void {
    if (this.attached) return;
    this.element.addEventListener('pointerdown', this.onDown, { passive: false });
    this.element.addEventListener('pointermove', this.onMove, { passive: false });
    this.element.addEventListener('pointerup', this.onUp);
    this.element.addEventListener('pointercancel', this.onUp);
    this.attached = true;
  }

  detach(): void {
    if (!this.attached) return;
    this.element.removeEventListener('pointerdown', this.onDown);
    this.element.removeEventListener('pointermove', this.onMove);
    this.element.removeEventListener('pointerup', this.onUp);
    this.element.removeEventListener('pointercancel', this.onUp);
    this.attached = false;
  }

  /** Active pointer count. */
  count(): number {
    return this.pointers.size;
  }

  /** Get pointer by id (or undefined). */
  get(id: number): TouchPointer | undefined {
    return this.pointers.get(id);
  }

  /** Iterate all active pointers. */
  forEach(fn: (p: TouchPointer) => void): void {
    for (const p of this.pointers.values()) fn(p);
  }

  /** Find first pointer whose position is within rect (and in given half). */
  findInRect(rect: DOMRect, half?: 'left' | 'right'): TouchPointer | null {
    for (const p of this.pointers.values()) {
      if (rect.left === 0 && rect.top === 0 && rect.right === 0 && rect.bottom === 0) continue;
      if (p.x < rect.left || p.x > rect.right || p.y < rect.top || p.y > rect.bottom) continue;
      if (half === 'left' && p.x > window.innerWidth / 2) continue;
      if (half === 'right' && p.x <= window.innerWidth / 2) continue;
      return p;
    }
    return null;
  }

  subscribe(fn: (e: TouchEventData) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private onDown = (e: PointerEvent): void => {
    e.preventDefault();
    this.element.setPointerCapture?.(e.pointerId);
    const p: TouchPointer = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      prevX: e.clientX,
      prevY: e.clientY,
      startTime: performance.now(),
      isActive: true,
    };
    this.pointers.set(e.pointerId, p);
    this.emit({ type: 'down', pointer: p });
  };

  private onMove = (e: PointerEvent): void => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    p.prevX = p.x;
    p.prevY = p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    this.emit({ type: 'move', pointer: p });
  };

  private onUp = (e: PointerEvent): void => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    p.isActive = false;
    this.pointers.delete(e.pointerId);
    this.emit({ type: 'up', pointer: p });
  };

  private emit(e: TouchEventData): void {
    for (const l of this.listeners) l(e);
  }
}

export interface TouchEventData {
  type: 'down' | 'move' | 'up';
  pointer: TouchPointer;
}

/** Detect touch device heuristically. */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'ontouchstart' in window ||
    (navigator.maxTouchPoints ?? 0) > 0 ||
    // Some tablets/laptops report touch but lack maxTouchPoints.
    window.matchMedia?.('(pointer: coarse)').matches
  );
}