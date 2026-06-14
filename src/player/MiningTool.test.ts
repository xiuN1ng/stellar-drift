import { describe, expect, it } from 'vitest';
import { MiningTool } from './MiningTool.js';
import type { PlayerState, ResourceKind } from '@game-types/index';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';

class MockKeyboard {
  private held = new Set<string>();
  down(code: string): void { this.held.add(code); }
  up(code: string): void { this.held.delete(code); }
  isDown(code: string): boolean { return this.held.has(code); }
  heldKeys(): string[] { return Array.from(this.held); }
}

function makePlayer(archetype: PlayerState['archetype'] = 'wanderer'): PlayerState {
  return {
    archetype,
    currentGalaxy: { x: 0, y: 0, z: 0 },
    currentSystem: null,
    credits: 100,
    cargo: {},
    upgrades: { engine: 0, cargo: 0, scanner: 0, shield: 0 },
    discoveredPlanets: [],
    foundedStations: [],
    reputation: 0,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('MiningTool cargo accounting', () => {
  it('returns no-target when F not pressed', () => {
    const keys = new MockKeyboard();
    const tool = new MiningTool({} as never, keys as never);
    const result = tool.fire(new Vector3(0,0,0), new Vector3(0,0,1), makePlayer(), 50, 'wanderer');
    expect(result.status).toBe('no-target');
  });

  it('returns out-of-range when scene.pickWithRay returns no hit', () => {
    const keys = new MockKeyboard();
    keys.down('KeyF');
    const scene = {
      pickWithRay: () => ({ hit: false, pickedMesh: null, pickedPoint: null }),
    } as never;
    const tool = new MiningTool(scene, keys as never);
    const result = tool.fire(new Vector3(0,0,0), new Vector3(0,0,1), makePlayer(), 50, 'wanderer');
    expect(result.status).toBe('out-of-range');
  });

  it('returns no-access when archetype cannot mine that resource', () => {
    const keys = new MockKeyboard();
    keys.down('KeyF');
    const pickedMesh = {
      name: 'marker-0',
      metadata: { kind: 'exotic' as ResourceKind, richness: 5 },
    };
    const scene = {
      pickWithRay: () => ({ hit: true, pickedMesh, pickedPoint: { x: 0, y: 0, z: 0 } }),
    } as never;
    const tool = new MiningTool(scene, keys as never);
    const result = tool.fire(new Vector3(0,0,0), new Vector3(0,0,1), makePlayer('wanderer'), 50, 'wanderer');
    expect(result.status).toBe('no-access');
  });

  it('mines resource into cargo on hit', () => {
    const keys = new MockKeyboard();
    keys.down('KeyF');
    let richness = 3;
    const pickedMesh = {
      name: 'marker-0',
      metadata: { kind: 'iron' as ResourceKind, get richness() { return richness; }, set richness(v) { richness = v; } },
    };
    const scene = {
      pickWithRay: () => ({ hit: true, pickedMesh, pickedPoint: { x: 0, y: 0, z: 0 } }),
    } as never;
    const tool = new MiningTool(scene, keys as never);
    const player = makePlayer('wanderer');
    const result = tool.fire(new Vector3(0,0,0), new Vector3(0,0,1), player, 50, 'wanderer');
    expect(result.status).toBe('mined');
    expect(result.kind).toBe('iron');
    expect(player.cargo.iron).toBe(1);
    expect(richness).toBe(2);
  });

  it('returns depleted and disposes mesh when richness reaches 0', () => {
    const keys = new MockKeyboard();
    keys.down('KeyF');
    let disposed = false;
    const pickedMesh = {
      name: 'marker-0',
      metadata: { kind: 'water' as ResourceKind, richness: 1 },
      dispose: () => { disposed = true; },
    };
    const scene = {
      pickWithRay: () => ({ hit: true, pickedMesh, pickedPoint: { x: 0, y: 0, z: 0 } }),
    } as never;
    const tool = new MiningTool(scene, keys as never);
    const player = makePlayer('wanderer');
    const result = tool.fire(new Vector3(0,0,0), new Vector3(0,0,1), player, 50, 'wanderer');
    expect(result.status).toBe('depleted');
    expect(player.cargo.water).toBe(1);
    expect(disposed).toBe(true);
  });

  it('returns cargo-full when player cargo is full', () => {
    const keys = new MockKeyboard();
    keys.down('KeyF');
    const pickedMesh = {
      name: 'marker-0',
      metadata: { kind: 'iron' as ResourceKind, richness: 5 },
    };
    const scene = {
      pickWithRay: () => ({ hit: true, pickedMesh, pickedPoint: { x: 0, y: 0, z: 0 } }),
    } as never;
    const tool = new MiningTool(scene, keys as never);
    const player = makePlayer('wanderer');
    player.cargo.iron = 50; // cargo cap = 50
    const result = tool.fire(new Vector3(0,0,0), new Vector3(0,0,1), player, 50, 'wanderer');
    expect(result.status).toBe('cargo-full');
  });

  it('MiningTool.cargoUsed sums all resources', () => {
    const p = makePlayer();
    p.cargo.iron = 3;
    p.cargo.water = 5;
    p.cargo.copper = 2;
    expect(MiningTool.cargoUsed(p)).toBe(10);
  });
});