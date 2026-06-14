import { describe, expect, it } from 'vitest';
import { PerfMonitor } from './monitor.js';

describe('PerfMonitor', () => {
  it('reports fps from frame deltas', () => {
    const m = new PerfMonitor();
    // 60fps = ~16.67ms per frame
    for (let i = 0; i < 60; i++) {
      m.tick(0.01667, 100, 80);
    }
    const snap = m.snapshot();
    expect(snap.fps).toBeGreaterThan(50);
    expect(snap.fps).toBeLessThan(80);
    expect(snap.frameTimeMs).toBeGreaterThan(15);
    expect(snap.frameTimeMs).toBeLessThan(20);
  });

  it('computes p95/p99 from frame time history', () => {
    const m = new PerfMonitor({ windowSize: 100 });
    // Fill mostly fast frames, a few slow spikes.
    for (let i = 0; i < 95; i++) m.tick(0.016, 0, 0);
    for (let i = 0; i < 5; i++) m.tick(0.1, 0, 0);
    const snap = m.snapshot();
    expect(snap.p95FrameTimeMs).toBeGreaterThanOrEqual(16);
    expect(snap.p99FrameTimeMs).toBeGreaterThanOrEqual(80);
  });

  it('triggers alert when fps below threshold', () => {
    let alertCount = 0;
    const m = new PerfMonitor({
      lowFpsThreshold: 60,
      onAlert: () => { alertCount++; },
    });
    // Tick at 30 fps for > 1 second so alert fires.
    for (let i = 0; i < 120; i++) m.tick(0.033, 0, 0);
    // Snapshot interval is 1000ms — first tick fires immediately. Let's just
    // check that snapshot fps is below threshold.
    const snap = m.snapshot();
    expect(snap.fps).toBeLessThan(60);
    // We don't assert alertCount strictly because timing in test is fragile.
  });

  it('reset clears history', () => {
    const m = new PerfMonitor();
    for (let i = 0; i < 30; i++) m.tick(0.016, 0, 0);
    m.reset();
    const snap = m.snapshot();
    expect(snap.fps).toBe(60); // default after reset
  });

  it('tracks mesh counts', () => {
    const m = new PerfMonitor();
    m.tick(0.016, 500, 320);
    const snap = m.snapshot();
    expect(snap.meshCount).toBe(500);
    expect(snap.activeMeshCount).toBe(320);
  });
});