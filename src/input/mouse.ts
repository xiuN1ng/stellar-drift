/**
 * Mouse / pointer input layer.
 *
 * Tracks:
 *  - pointer delta (for first-person look or third-person rotate)
 *  - pointer lock state (for FPS-style mouse-look when held)
 *  - click / drag events
 *
 * Works for both desktop (mouse) and touch (pointer events unify both).
 */

export interface PointerDelta {
  dx: number;
  dy: number;
}

export type PointerButton = 'left' | 'middle' | 'right';

export class MouseInput {
  private dx = 0;
  private dy = 0;
  private locked = false;
  private readonly buttons = new Set<PointerButton>();
  private readonly cursor = { x: 0, y: 0 };
  private readonly listeners = new Set<(e: PointerEventData) => void>();
  private attached = false;

  attach(canvas: HTMLElement): void {
    if (this.attached) return;
    canvas.addEventListener('pointermove', this.onMove as EventListener, { passive: false });
    canvas.addEventListener('pointerdown', this.onDown as EventListener);
    canvas.addEventListener('pointerup', this.onUp as EventListener);
    canvas.addEventListener('pointercancel', this.onUp as EventListener);
    canvas.addEventListener('contextmenu', this.onContextMenu as EventListener);
    document.addEventListener('pointerlockchange', this.onLockChange as EventListener);
    this.attached = true;
  }

  detach(canvas: HTMLElement): void {
    if (!this.attached) return;
    canvas.removeEventListener('pointermove', this.onMove as EventListener);
    canvas.removeEventListener('pointerdown', this.onDown as EventListener);
    canvas.removeEventListener('pointerup', this.onUp as EventListener);
    canvas.removeEventListener('pointercancel', this.onUp as EventListener);
    canvas.removeEventListener('contextmenu', this.onContextMenu as EventListener);
    document.removeEventListener('pointerlockchange', this.onLockChange as EventListener);
    this.attached = false;
  }

  /** Request pointer lock (for FPS-style mouse-look). */
  requestLock(canvas: HTMLElement): void {
    canvas.requestPointerLock?.();
  }

  isLocked(): boolean {
    return this.locked;
  }

  /** Read accumulated delta since last call, then reset. */
  consumeDelta(): PointerDelta {
    const out = { dx: this.dx, dy: this.dy };
    this.dx = 0;
    this.dy = 0;
    return out;
  }

  /** Inject delta from an external source (touch joystick, etc.). */
  injectDelta(dx: number, dy: number): void {
    this.dx += dx;
    this.dy += dy;
  }

  isDown(button: PointerButton): boolean {
    return this.buttons.has(button);
  }

  position(): { x: number; y: number } {
    return { ...this.cursor };
  }

  subscribe(fn: (e: PointerEventData) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private onMove = (e: PointerEvent): void => {
    this.cursor.x = e.clientX;
    this.cursor.y = e.clientY;
    if (this.locked && document.pointerLockElement) {
      // In pointer-lock, movementX/Y gives raw delta (browser-corrected).
      this.dx += e.movementX;
      this.dy += e.movementY;
    } else if (this.buttons.has('left')) {
      // Pointer lock can be unavailable in embedded browsers; dragging still aims.
      this.dx += e.movementX;
      this.dy += e.movementY;
    }
    this.emit({
      type: 'move',
      x: e.clientX,
      y: e.clientY,
      button: this.buttonFromEvent(e),
    });
  };

  private onDown = (e: PointerEvent): void => {
    const b = this.buttonFromEvent(e);
    this.buttons.add(b);
    this.emit({ type: 'down', x: e.clientX, y: e.clientY, button: b });
  };

  private onUp = (e: PointerEvent): void => {
    const b = this.buttonFromEvent(e);
    this.buttons.delete(b);
    this.emit({ type: 'up', x: e.clientX, y: e.clientY, button: b });
  };

  private onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };

  private onLockChange = (): void => {
    this.locked = document.pointerLockElement !== null;
  };

  private buttonFromEvent(e: PointerEvent): PointerButton {
    if (e.button === 2) return 'right';
    if (e.button === 1) return 'middle';
    return 'left';
  }

  private emit(e: PointerEventData): void {
    for (const l of this.listeners) l(e);
  }
}

export interface PointerEventData {
  type: 'move' | 'down' | 'up';
  x: number;
  y: number;
  button: PointerButton;
}
