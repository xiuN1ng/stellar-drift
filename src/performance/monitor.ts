/**
 * Runtime performance monitor.
 *
 * Tracks:
 *  - Frame time (rolling avg / p95 / p99)
 *  - FPS (instant + rolling avg)
 *  - Active mesh count
 *  - Approximate draw calls (via scene.activeMeshes)
 *
 * Outputs a snapshot every N seconds for the HUD or log.
 * Also supports a callback for performance regression alerts.
 */

export interface PerfSnapshot {
  fps: number;
  frameTimeMs: number;
  p95FrameTimeMs: number;
  p99FrameTimeMs: number;
  meshCount: number;
  activeMeshCount: number;
  timestamp: number;
}

export interface PerfMonitorOptions {
  /** Sample window size (number of frames). */
  windowSize?: number;
  /** FPS threshold below which we emit a "low-fps" alert. */
  lowFpsThreshold?: number;
  /** Callback fired when performance regresses. */
  onAlert?: (snapshot: PerfSnapshot) => void;
}

const DEFAULTS: Required<Omit<PerfMonitorOptions, 'onAlert'>> = {
  windowSize: 120,
  lowFpsThreshold: 30,
};

export class PerfMonitor {
  private readonly opts: Required<Omit<PerfMonitorOptions, 'onAlert'>> & { onAlert?: (s: PerfSnapshot) => void };
  private readonly frameTimes: number[] = [];
  private lastFrameTime = 0;
  private fpsAccum = 0;
  private fpsCount = 0;
  private fpsValue = 60;
  private meshCount = 0;
  private activeMeshCount = 0;
  private lastSnapshot = 0;
  private snapshotIntervalMs = 1000;

  constructor(options: PerfMonitorOptions = {}) {
    this.opts = { ...DEFAULTS, ...options };
  }

  /** Call once per frame from the render loop. */
  tick(dt: number, meshCount: number, activeMeshCount: number): PerfSnapshot {
    this.lastFrameTime = dt * 1000;
    this.fpsAccum += 1 / Math.max(dt, 1e-6);
    this.fpsCount++;
    this.meshCount = meshCount;
    this.activeMeshCount = activeMeshCount;

    this.frameTimes.push(this.lastFrameTime);
    if (this.frameTimes.length > this.opts.windowSize) {
      this.frameTimes.shift();
    }
    this.fpsValue = this.fpsAccum / this.fpsCount;

    const now = performance.now();
    if (now - this.lastSnapshot > this.snapshotIntervalMs) {
      this.lastSnapshot = now;
      const snap = this.snapshot();
      if (snap.fps < this.opts.lowFpsThreshold && this.opts.onAlert) {
        this.opts.onAlert(snap);
      }
      return snap;
    }
    return this.snapshot();
  }

  /** Compute current snapshot. */
  snapshot(): PerfSnapshot {
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const p = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
    return {
      fps: this.fpsValue,
      frameTimeMs: this.lastFrameTime,
      p95FrameTimeMs: p(0.95),
      p99FrameTimeMs: p(0.99),
      meshCount: this.meshCount,
      activeMeshCount: this.activeMeshCount,
      timestamp: performance.now(),
    };
  }

  /** Reset internal buffers (e.g., after scene change). */
  reset(): void {
    this.frameTimes.length = 0;
    this.fpsAccum = 0;
    this.fpsCount = 0;
    this.fpsValue = 60;
  }
}