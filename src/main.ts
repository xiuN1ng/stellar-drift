/**
 * Stellar Drift — entry point (M5 pass).
 *
 * Adds touch input + performance monitoring.
 */

import { Engine } from '@babylonjs/core/Engines/engine.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Quaternion } from '@babylonjs/core/Maths/math.vector.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';

import { createStarterScene } from '@engine/scene.js';
import { generateGalaxy } from '@pcg/galaxy.js';
import { generateSurface } from '@pcg/planet.js';
import { createPlanetSurfaceMesh } from '@engine/planetSurface.js';
import { createResourceMarkers } from '@engine/resourceMarkers.js';

import { Ship } from '@player/Ship.js';
import { ShipController } from '@player/ShipController.js';
import { ShipCamera } from '@player/ShipCamera.js';
import { LandingController, type LandingTarget } from '@player/LandingController.js';
import { MiningTool, type MiningResult } from '@player/MiningTool.js';
import { StationManager } from '@player/StationManager.js';
import { ReputationSystem } from '@player/ReputationSystem.js';

import { KeyboardInput } from '@input/keyboard.js';
import { MouseInput } from '@input/mouse.js';
import { TouchInput, isTouchDevice } from '@input/touch.js';
import { VirtualJoystick } from '@input/virtualJoystick.js';
import { TouchButtons } from '@input/touchButtons.js';

import { PerfMonitor } from '@performance/monitor.js';
import { Hud, hudStateFromPlayer } from '@ui/hud.js';
import { StartupMenu } from '@ui/menu.js';
import { loadOrCreate, save, flushSave, resetSave } from '@save/local.js';
import { getArchetypeBehavior } from '@player/archetype.js';
import type { GalaxyCoord } from '@game-types/index';

const STARTING_COORD: GalaxyCoord = { x: 0, y: 0, z: 0 };
const STARTING_SHIP_POSITION = { x: 20, y: 0, z: 0 };
const BASE_CARGO_CAP = 50;

async function boot(): Promise<void> {
  const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement | null;
  if (!canvas) throw new Error('renderCanvas not found');

  // URL flag for screenshot/automation: ?autoStart=wanderer|empire-builder
  const params = new URLSearchParams(window.location.search);
  const autoStart = params.get('autoStart');

  // 1. Startup menu (skipped if autoStart is set)
  let choice: { archetype: 'wanderer' | 'empire-builder'; isNewGame: boolean };
  if (autoStart === 'wanderer' || autoStart === 'empire-builder') {
    resetSave();
    choice = { archetype: autoStart, isNewGame: true };
  } else {
    const menu = new StartupMenu();
    const hasSave = !!localStorage.getItem('stellar-drift:save');
    choice = await menu.show(hasSave);
    if (choice.isNewGame) resetSave();
  }

  // 2. Player state
  let player = loadOrCreate();
  player = { ...player, archetype: choice.archetype };
  if (choice.isNewGame) {
    player.credits = getArchetypeBehavior(choice.archetype).startingCredits;
    player.reputation = 0;
    player.createdAt = Date.now();
  }
  save(player, true);

  // 3. Engine + scene
  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: false,
    stencil: false,
    antialias: true,
    adaptToDeviceRatio: true,
  });
  engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio, 2));

  const galaxy = generateGalaxy(STARTING_COORD);
  const handle = createStarterScene(engine, galaxy, {
    priorityPosition: STARTING_SHIP_POSITION,
  });

  // 4. Player ship
  const ship = new Ship(handle.scene, 'player-ship');
  ship.node.position.set(STARTING_SHIP_POSITION.x, STARTING_SHIP_POSITION.y, STARTING_SHIP_POSITION.z);
  ship.setRotation(Quaternion.Identity());

  const shipMesh = MeshBuilder.CreateCylinder('ship-body', {
    diameterTop: 0.0, diameterBottom: 0.8, height: 1.6, tessellation: 12,
  }, handle.scene);
  shipMesh.rotation.x = Math.PI / 2;
  shipMesh.parent = ship.node;

  const shipMat = new StandardMaterial('ship-mat', handle.scene);
  shipMat.diffuseColor = new Color3(0.6, 0.7, 0.9);
  shipMat.emissiveColor = new Color3(0.05, 0.1, 0.2);
  shipMat.specularColor = new Color3(0.8, 0.9, 1.0);
  shipMesh.material = shipMat;
  shipMesh.isPickable = false;

  const engineGlow = MeshBuilder.CreateSphere('ship-engine', { diameter: 0.4 }, handle.scene);
  engineGlow.position.z = -1.0;
  engineGlow.parent = ship.node;
  const glowMat = new StandardMaterial('ship-engine-mat', handle.scene);
  glowMat.emissiveColor = new Color3(0.4, 0.7, 1.0);
  glowMat.diffuseColor = new Color3(0, 0, 0);
  glowMat.disableLighting = true;
  engineGlow.material = glowMat;
  engineGlow.isPickable = false;

  // 5. Camera + input + controllers
  const camera = new ShipCamera(handle.scene, ship);
  handle.scene.activeCamera = camera.camera;

  const keys = new KeyboardInput();
  const KEY_MAP: Record<string, 'ShiftLeft' | 'KeyB' | 'KeyL' | 'KeyF' | 'KeyN'> = {
    ShiftLeft: 'ShiftLeft',
    KeyB: 'KeyB',
    KeyL: 'KeyL',
    KeyF: 'KeyF',
    KeyN: 'KeyN',
  };
  keys.attach(window);

  const mouse = new MouseInput();
  mouse.attach(canvas);
  canvas.addEventListener('click', () => {
    if (!mouse.isLocked()) mouse.requestLock(canvas);
  });

  // Touch setup (only on touch device).
  const isTouch = isTouchDevice();
  let touch: TouchInput | null = null;
  let thrustJoy: VirtualJoystick | null = null;
  let aimJoy: VirtualJoystick | null = null;
  let buttons: TouchButtons | null = null;
  /** Map pointerId → touchKey it pressed (so release can clean up). */
  const pointerButtonMap = new Map<number, string>();

  if (isTouch) {
    touch = new TouchInput({ element: document.body });
    touch.attach();
    thrustJoy = new VirtualJoystick(document.body, touch, { half: 'left' });
    aimJoy = new VirtualJoystick(document.body, touch, { half: 'right' });
    buttons = new TouchButtons(document.body, touch);
    buttons.refreshRects();

    touch.subscribe((e) => {
      if (e.type === 'down') {
        // Check if pointer landed on a button.
        const key = buttons!.buttonAt(e.pointer.x, e.pointer.y);
        if (key) {
          buttons!.press(key);
          pointerButtonMap.set(e.pointer.id, key);
          const kbKey = KEY_MAP[key];
          if (kbKey) keys.injectKey(kbKey, true);
          return;
        }
        // Try joystick capture.
        if (thrustJoy!.tryCapture(e.pointer)) return;
        if (aimJoy!.tryCapture(e.pointer)) return;
      } else if (e.type === 'move') {
        thrustJoy!.onMove(e.pointer);
        aimJoy!.onMove(e.pointer);
      } else if (e.type === 'up') {
        thrustJoy!.onUp(e.pointer);
        aimJoy!.onUp(e.pointer);
        const key = pointerButtonMap.get(e.pointer.id);
        if (key) {
          buttons!.release(key as 'ShiftLeft' | 'KeyB' | 'KeyL' | 'KeyF' | 'KeyN');
          const kbKey = KEY_MAP[key];
          if (kbKey) keys.injectKey(kbKey, false);
          pointerButtonMap.delete(e.pointer.id);
        }
      }
    });
  }

  const controller = new ShipController(handle.scene, ship, keys, mouse);
  const landing = new LandingController(handle.scene, ship, keys, mouse);
  const mining = new MiningTool(handle.scene, keys);

  // 6. HUD
  const hud = new Hud();
  window.addEventListener('beforeunload', () => flushSave());

  // 7. Performance monitor
  const perf = new PerfMonitor({
    lowFpsThreshold: 30,
    onAlert: (snap: { fps: number }) => {
      console.warn('[perf] low fps', snap);
    },
  });

  // 8. State for landed mode
  let currentSurface: {
    mesh: Mesh;
    markers: ReturnType<typeof createResourceMarkers>;
    planetId: string;
    orbitMesh: Mesh;
  } | null = null;
  let nearestPlanetDistance: number | null = null;
  let lastMiningStatus = '';
  let passiveIncomeTimer = 0;
  let perfLogTimer = 0;

  function markPlanetDiscovered(planetId: string): void {
    const isNew = ReputationSystem.discoverPlanet(player, planetId);
    if (isNew) lastMiningStatus = `+1 声望 发现新行星`;
  }

  // 9. Render loop
  let lastTime = performance.now();
  engine.runRenderLoop(() => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;

    // Touch aim deltas (consumed by ship controller via keys).
    if (aimJoy && (aimJoy.axis.x !== 0 || aimJoy.axis.y !== 0)) {
      const sens = 0.0035;
      mouse.injectDelta(-aimJoy.axis.x * sens * 100, -aimJoy.axis.y * sens * 100);
    }

    if (landing.state === 'orbit') {
      controller.update(dt);
      handle.tick(dt);

      const scanForDiscover = handle.getNearestPlanet(ship.position);
      if (scanForDiscover && Vector3.Distance(ship.position, scanForDiscover.center) < scanForDiscover.radius * 3) {
        markPlanetDiscovered(scanForDiscover.planet.id);
      }

      const scanForLand = handle.getNearestPlanet(ship.position);
      if (scanForLand) {
        const tgt: LandingTarget = { center: scanForLand.center, radius: scanForLand.radius };
        const newState = landing.poll(tgt);
        if (newState === 'landing') {
          scanForLand.mesh.setEnabled(false);
          const surface = generateSurface(scanForLand.planet);
          const surfaceMesh = createPlanetSurfaceMesh(handle.scene, scanForLand.planet, surface);
          surfaceMesh.mesh.position.copyFrom(scanForLand.center);
          const markers = createResourceMarkers(handle.scene,
            surfaceMesh.resourcePositions.map((r) => ({
              kind: r.kind as never,
              pos: r.pos.add(scanForLand.center),
              richness: r.richness,
            })),
          );
          currentSurface = {
            mesh: surfaceMesh.mesh,
            markers,
            planetId: scanForLand.planet.id,
            orbitMesh: scanForLand.mesh,
          };
        }
      }

      const scanForHud = handle.getNearestPlanet(ship.position);
      nearestPlanetDistance = scanForHud
        ? Vector3.Distance(ship.position, scanForHud.center)
        : null;
    } else if (landing.state === 'landing') {
      landing.updateLanding(dt);
      handle.tick(dt);
    } else if (landing.state === 'landed') {
      landing.updateWalking(dt);
      handle.tick(dt);

      if (currentSurface) {
        const cameraPos = camera.camera.globalPosition;
        const lookDir = camera.camera.getDirection(new Vector3(0, 0, 1));
        const cargoCap = BASE_CARGO_CAP + player.upgrades.cargo * 10;
        const result: MiningResult = mining.fire(cameraPos, lookDir, player, cargoCap, player.archetype);
        if (result.status === 'mined' && result.kind) {
          lastMiningStatus = `+${result.amount} ${result.kind}`;
        } else if (result.status === 'depleted' && result.kind) {
          lastMiningStatus = `${result.kind} 采空`;
        } else if (result.status === 'cargo-full') {
          lastMiningStatus = '货舱已满';
        } else if (result.status === 'no-access' && result.kind) {
          lastMiningStatus = `无法采集 ${result.kind}`;
        }
      }

      if (keys.isDown('KeyN') && currentSurface) {
        const r = StationManager.found(player, currentSurface.planetId);
        if (r.ok) lastMiningStatus = `空间站 +1`;
        else if (r.reason === 'insufficient-credits') lastMiningStatus = '信用不足 50';
        else if (r.reason === 'not-empire-builder') lastMiningStatus = '只有帝国建造者可建站';
        else if (r.reason === 'already-exists') lastMiningStatus = '该行星已有空间站';
      }
    } else if (landing.state === 'taking-off') {
      const done = landing.updateTakeoff(dt);
      if (done) {
        if (currentSurface) {
          currentSurface.orbitMesh.setEnabled(true);
          currentSurface.mesh.dispose();
          currentSurface.markers.dispose();
          currentSurface = null;
        }
        landing.state = 'orbit';
      }
      handle.tick(dt);
    }

    passiveIncomeTimer += dt;
    if (passiveIncomeTimer >= 1.0) {
      const earned = StationManager.applyPassiveIncome(player, passiveIncomeTimer);
      if (earned > 0) lastMiningStatus = `+${earned.toFixed(1)} 信用 (税收)`;
      passiveIncomeTimer = 0;
    }

    camera.update(dt);

    const thrustMag =
      Math.abs(keys.axis('thrust-z')) +
      Math.abs(keys.axis('thrust-y')) +
      Math.abs(keys.axis('thrust-x'));
    if (landing.state === 'orbit' && thrustMag > 0) {
      const pulse = 0.6 + thrustMag * 0.3;
      glowMat.emissiveColor = new Color3(0.4 * pulse, 0.7 * pulse, 1.0 * pulse);
    } else if (landing.state === 'orbit') {
      glowMat.emissiveColor = new Color3(0.1, 0.15, 0.25);
    } else {
      glowMat.emissiveColor = new Color3(0.05, 0.05, 0.05);
    }

    if (currentSurface) currentSurface.markers.update(dt);

    if (landing.state === 'landed') {
      const scanForTakeoff = handle.getNearestPlanet(ship.position);
      if (scanForTakeoff) {
        const tgt: LandingTarget = { center: scanForTakeoff.center, radius: scanForTakeoff.radius };
        landing.poll(tgt);
      }
    }

    // Perf monitoring.
    const meshCount = handle.scene.meshes.length;
    const activeMeshCount = handle.scene.getActiveMeshes().length;
    perf.tick(dt, meshCount, activeMeshCount);
    perfLogTimer += dt;
    if (perfLogTimer >= 5.0) {
      const snap = perf.snapshot();
      console.info('[perf]', `fps=${snap.fps.toFixed(1)}`, `frame=${snap.frameTimeMs.toFixed(1)}ms`,
        `meshes=${snap.meshCount}/${snap.activeMeshCount}`,
        `p95=${snap.p95FrameTimeMs.toFixed(1)}ms`);
      perfLogTimer = 0;
    }

    const cargoCap = BASE_CARGO_CAP + player.upgrades.cargo * 10;
    const cargoUsed = MiningTool.cargoUsed(player);
    const planetName = currentSurface ? currentSurface.planetId : undefined;
    const tier = ReputationSystem.tierName(player.reputation ?? 0);
    const statusForHud = lastMiningStatus;
    if (lastMiningStatus) lastMiningStatus = '';

    hud.update(hudStateFromPlayer(
      player,
      ship.speed(),
      { x: ship.position.x, y: ship.position.y, z: ship.position.z },
      cargoUsed,
      cargoCap,
      nearestPlanetDistance,
      landing.state,
      planetName,
      tier,
      statusForHud,
    ));

    player.updatedAt = Date.now();
    save(player);

    handle.scene.render();
  });

  window.addEventListener('resize', () => engine.resize());

  handle.scene.executeWhenReady(() => {
    requestAnimationFrame(() => {
      const loading = document.getElementById('loading-screen');
      if (loading) loading.classList.add('hidden');
      setTimeout(() => loading?.remove(), 1000);
    });
  });

  console.info('[stellar-drift] booted M5', {
    archetype: player.archetype,
    inputMode: isTouch ? 'touch' : 'keyboard',
    galaxyName: galaxy.name,
    seed: galaxy.seed,
  });
}

boot().catch((err) => {
  console.error('[stellar-drift] boot failed', err);
  const status = document.getElementById('loading-status');
  if (status) status.textContent = '加载失败：' + (err instanceof Error ? err.message : String(err));
});
