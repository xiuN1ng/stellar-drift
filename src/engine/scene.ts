/**
 * Scene bootstrap — M1 prism pass.
 *
 * Replaces starmap placeholders with:
 *  - Procedural skybox (starfield + nebula) via BackgroundMaterial
 *  - PBR star spheres with point lights + corona billboards
 *  - PBR planet spheres with atmospheric glow shader
 *  - LOD switching (billboard at distance, sphere at medium, full + atm at close)
 *  - Planet orbit animation driven by Babylon scene observers
 *
 * The camera + engine is created in main.ts; this module returns the Scene
 * and a small handle for updates.
 */

import { Engine } from '@babylonjs/core/Engines/engine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { PointLight } from '@babylonjs/core/Lights/pointLight.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';

import '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js';

import type { GalaxyRecord } from '@game-types/index';

import { createSkybox } from './skybox.js';
import {
  applyPlanetLOD, applyStarLOD, planetTint,
  PLANET_LOD, createBillboard,
} from './lod.js';
import {
  createAtmosphereMaterial, updateAtmosphereCenter, updateAtmosphereSun,
} from './atmosphere.js';
import { generatePalette, paletteRgb } from '@pcg/palette.js';
import { generateSurface } from '@pcg/planet.js';

export interface SceneHandle {
  scene: Scene;
  skybox: ReturnType<typeof createSkybox>;
  /** Update loop callable (called once per frame from main render loop). */
  tick: (dt: number) => void;
  dispose: () => void;
}

interface PlanetRuntime {
  mesh: Mesh;
  orbitCenter: Vector3;
  orbitRadius: number;
  orbitSpeed: number;
  orbitPhase: number;
  atmosphereMesh: Mesh;
  starColor: Color3;
  planetRadius: number;
}

interface StarRuntime {
  mesh: Mesh;
  light: PointLight | null;
  planets: PlanetRuntime[];
}

export function createStarterScene(engine: Engine, galaxy: GalaxyRecord): SceneHandle {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.001, 0.001, 0.005, 1.0);
  scene.ambientColor = new Color3(0.02, 0.02, 0.04);
  scene.imageProcessingConfiguration.exposure = 1.0;
  scene.imageProcessingConfiguration.contrast = 1.1;

  // Soft hemispheric (deep space ambient). HDR IBL can replace later.
  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene);
  ambient.intensity = 0.06;
  ambient.diffuse = new Color3(0.4, 0.5, 0.9);
  ambient.groundColor = new Color3(0.0, 0.0, 0.05);

  // Skybox (starfield + nebula tinted by galaxy hue).
  const skybox = createSkybox(scene, { seed: galaxy.seed, hue: 220 });

  // Star runtime map (for tick updates).
  const starRuntimes: StarRuntime[] = [];
  let sunDirRef: Vector3 = Vector3.Forward(); // updated when player is near a star

  for (const star of galaxy.stars) {
    const starColor = new Color3(star.color.r, star.color.g, star.color.b);

    // PBR star sphere.
    const starMesh = MeshBuilder.CreateSphere(star.id, {
      diameter: Math.max(0.8, star.luminosity * 1.5),
      segments: 24,
    }, scene);
    starMesh.position = new Vector3(star.position.x, star.position.y, star.position.z);

    const starMat = new PBRMaterial(`${star.id}-mat`, scene);
    starMat.albedoColor = new Color3(0, 0, 0);
    starMat.emissiveColor = starColor.scale(star.luminosity);
    starMat.metallic = 0.0;
    starMat.roughness = 0.6;
    starMat.disableLighting = true;
    starMesh.material = starMat;
    starMesh.isPickable = false;

    // Apply LOD (billboard at far).
    applyStarLOD(scene, starMesh, star);

    // Point light + halo billboard for bright stars.
    let light: PointLight | null = null;
    if (star.luminosity > 0.4) {
      light = new PointLight(`${star.id}-light`, starMesh.position.clone(), scene);
      light.intensity = Math.min(2.0, star.luminosity * 1.2);
      light.diffuse = starColor;
      light.specular = starColor;
      light.range = 50 + star.luminosity * 60;
    }

    // Halo billboard (corona-like) for brighter stars.
    if (star.luminosity > 0.3) {
      const halo = createBillboard(`${star.id}-halo`, scene, starColor, Math.max(2, star.luminosity * 4));
      halo.position = starMesh.position.clone();
      halo.parent = starMesh;
    }

    // Planets around this star.
    const planets: PlanetRuntime[] = [];
    for (const planet of star.planets) {
      // Compute the planet tint from its class + star color.
      const tint = planetTint(planet, starColor);

      // Generate surface (heightmap + biome + resources).
      const surface = generateSurface(planet);

      // Pick colors from a per-planet palette.
      const palette = generatePalette(planet.seed);
      const peakColor = paletteRgb(palette, 'peak');
      const highColor = paletteRgb(palette, 'highland');
      const lowColor = paletteRgb(palette, 'lowland');
      const waterColor = paletteRgb(palette, 'water');

      // PBR planet sphere (L3). Atmospheric shader is added separately.
      const planetMesh = MeshBuilder.CreateSphere(
        planet.id,
        { diameter: planet.radius * 2, segments: 32 },
        scene,
      );
      planetMesh.position = new Vector3(
        starMesh.position.x + planet.orbitRadius,
        starMesh.position.y,
        starMesh.position.z,
      );

      const planetMat = new PBRMaterial(`${planet.id}-mat`, scene);
      // Surface albedo: averaged across palette roles weighted by typical biome coverage.
      const avgR = (peakColor.r + highColor.r + lowColor.r) / 3;
      const avgG = (peakColor.g + highColor.g + lowColor.g) / 3;
      const avgB = (peakColor.b + highColor.b + lowColor.b) / 3;
      planetMat.albedoColor = new Color3(avgR, avgG, avgB);
      // Tilt the hue slightly by water content.
      if (planet.hasWater) {
        const wR = waterColor.r, wG = waterColor.g, wB = waterColor.b;
        planetMat.albedoColor = new Color3(
          planetMat.albedoColor.r * 0.7 + wR * 0.3,
          planetMat.albedoColor.g * 0.7 + wG * 0.3,
          planetMat.albedoColor.b * 0.7 + wB * 0.3,
        );
      }
      planetMat.metallic = 0.0;
      planetMat.roughness = 0.85;
      planetMat.ambientColor = new Color3(0.02, 0.03, 0.06);
      planetMesh.material = planetMat;
      planetMesh.isPickable = true;

      // Apply LOD (L1 billboard, L2 simple sphere).
      applyPlanetLOD(scene, planetMesh, planet, tint);

      // Atmosphere sphere (only for planets with atmosphere).
      let atmosphereMesh: Mesh = planetMesh;
      if (planet.hasAtmosphere) {
        const atmRadius = planet.radius * 1.08;
        const atmTint = starColor.scale(0.6).add(new Color3(0.2, 0.3, 0.5));
        const atmMat = createAtmosphereMaterial(scene, {
          tint: atmTint,
          sunDir: sunDirRef.clone(),
          planetCenter: planetMesh.position.clone(),
          planetRadius: planet.radius,
          atmosphereRadius: atmRadius,
          intensity: 1.2,
          sunIntensity: 1.5,
        });
        const atmMesh = MeshBuilder.CreateSphere(
          `${planet.id}-atm`,
          { diameter: atmRadius * 2, segments: 32 },
          scene,
        );
        atmMesh.material = atmMat;
        atmMesh.parent = planetMesh;
        atmMesh.isPickable = false;
        atmosphereMesh = atmMesh;
      }

      // Orbit parameters: speed = sqrt(GM/r^3) ish, scaled for visible motion.
      const orbitSpeed = (1 / Math.sqrt(planet.orbitRadius ** 3)) * 0.4;

      planets.push({
        mesh: planetMesh,
        orbitCenter: starMesh.position.clone(),
        orbitRadius: planet.orbitRadius,
        orbitSpeed,
        orbitPhase: (surface.seed % 360) * Math.PI / 180, // pseudo-random start angle
        atmosphereMesh,
        starColor,
        planetRadius: planet.radius,
      });
    }

    starRuntimes.push({ mesh: starMesh, light, planets });
  }

  // Tick: animate orbits + update atmosphere centers.
  let elapsed = 0;
  const tick = (dt: number): void => {
    elapsed += dt;
    for (const sr of starRuntimes) {
      // Update sun direction reference (use star position as sun for its planets).
      const starPos = sr.mesh.position;
      for (const p of sr.planets) {
        const a = p.orbitPhase + elapsed * p.orbitSpeed;
        const px = p.orbitCenter.x + Math.cos(a) * p.orbitRadius;
        const pz = p.orbitCenter.z + Math.sin(a) * p.orbitRadius;
        // Subtle vertical wobble.
        const py = p.orbitCenter.y + Math.sin(a * 1.7) * (p.orbitRadius * 0.05);
        p.mesh.position.set(px, py, pz);

        if (p.atmosphereMesh !== p.mesh) {
          updateAtmosphereCenter(
            p.atmosphereMesh.material as ReturnType<typeof createAtmosphereMaterial>,
            p.mesh.position,
          );
        }
      }
      // Update this star's planets' sun direction.
      for (const p of sr.planets) {
        const dir = starPos.subtract(p.mesh.position).normalize();
        if (p.atmosphereMesh.material && 'setVector3' in p.atmosphereMesh.material) {
          updateAtmosphereSun(
            p.atmosphereMesh.material as ReturnType<typeof createAtmosphereMaterial>,
            dir,
          );
        }
      }
    }
  };

  const dispose = (): void => {
    skybox.dispose();
    for (const sr of starRuntimes) {
      sr.mesh.dispose();
      sr.light?.dispose();
      for (const p of sr.planets) {
        p.mesh.dispose();
        if (p.atmosphereMesh !== p.mesh) p.atmosphereMesh.dispose();
      }
    }
    scene.dispose();
  };

  return { scene, skybox, tick, dispose };
}

// Export LOD constants so main.ts can frame camera.
export { PLANET_LOD };