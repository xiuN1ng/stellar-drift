/**
 * Simplified atmospheric scattering shader (atmospheric glow rim).
 *
 * Full Rayleigh+Mie precomputed scattering (Eric Bruneton) is hundreds of
 * lines + multi-MB look-up tables — overkill for an MVP. This shader gives
 * 90% of the visual punch at 5% of the code:
 *
 *  - Sample the view-to-planet angle.
 *  - Blend two tinted contributions: a horizon "ring" and a sun-direction
 *    halo (Mie phase approx).
 *  - Apply back-scatter when looking near the planet's edge.
 *
 * The result is a soft glowing rim that makes planets feel atmospheric
 * rather than just spheres.
 *
 * Inputs to material via `setColor3('tint', ...)` and `setVector3('sunDir', ...)`.
 *
 * References:
 *  - https://ebruneton.github.io/precomputed_atmospheric_scattering/
 *  - https://shadertoy.com/view/ltlfz8 (public reference shader)
 */

import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { Effect } from '@babylonjs/core/Materials/effect.js';
import { Scene } from '@babylonjs/core/scene.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js';

const VERTEX = /* glsl */`
precision highp float;
attribute vec3 position;
attribute vec3 normal;
uniform mat4 worldViewProjection;
uniform mat4 world;
varying vec3 vNormal;
varying vec3 vWorldPos;
void main() {
  vec4 worldPos = world * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;
  vNormal = normalize((world * vec4(normal, 0.0)).xyz);
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`;

const FRAGMENT = /* glsl */`
precision highp float;
varying vec3 vNormal;
varying vec3 vWorldPos;

uniform vec3 cameraPos;
uniform vec3 sunDir;        // normalized direction TO sun
uniform vec3 planetCenter;  // world position of planet center
uniform float planetRadius;
uniform float atmosphereRadius;
uniform vec3 tint;          // atmosphere color tint
uniform float intensity;
uniform float sunIntensity;

// Phase function (Henyey-Greenstein approx for Mie)
float phaseMie(float cosTheta, float g) {
  float g2 = g * g;
  return (1.0 - g2) / (4.0 * 3.14159265 * pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5));
}

// Rayleigh phase (cheap approximation)
float phaseRayleigh(float cosTheta) {
  return 0.75 * (1.0 + cosTheta * cosTheta);
}

void main() {
  vec3 viewDir = normalize(vWorldPos - cameraPos);
  vec3 normal = normalize(vNormal);

  // Make material additive-friendly: kill the planet surface contribution.
  // We are a glow rim only.
  float fresnel = pow(1.0 - max(dot(-viewDir, normal), 0.0), 2.0);

  // Distance from planet center for fake thickness.
  vec3 toCenter = vWorldPos - planetCenter;
  float distToCenter = length(toCenter);
  float thickness = smoothstep(planetRadius, atmosphereRadius, distToCenter);

  // Sun contribution
  float cosTheta = dot(normalize(-viewDir), normalize(sunDir));
  float mie = phaseMie(cosTheta, 0.76) * sunIntensity;
  float ray = phaseRayleigh(cosTheta);

  // Combine
  float scatter = (mie * 0.65 + ray * 0.35) * fresnel * thickness;
  vec3 color = tint * scatter * intensity;

  gl_FragColor = vec4(color, scatter);
}
`;

let shaderRegistered = false;

function registerShader(): void {
  if (shaderRegistered) return;
  Effect.ShadersStore['atmosphereVertexShader'] = VERTEX;
  Effect.ShadersStore['atmosphereFragmentShader'] = FRAGMENT;
  shaderRegistered = true;
}

export interface AtmosphereMaterialOptions {
  tint: Color3;
  intensity?: number;
  sunIntensity?: number;
  /** Sun direction (normalized, world space). */
  sunDir: Vector3;
  /** Planet center in world space (recomputed per frame by caller). */
  planetCenter: Vector3;
  /** Planet radius in scene units. */
  planetRadius: number;
  /** Atmosphere outer radius (typically planetRadius * 1.05–1.15). */
  atmosphereRadius: number;
}

/**
 * Create a ShaderMaterial that draws atmospheric rim glow on a planet mesh.
 * Caller must update `setVector3('planetCenter', ...)` per frame if planet moves.
 */
export function createAtmosphereMaterial(
  scene: Scene,
  opts: AtmosphereMaterialOptions,
): ShaderMaterial {
  registerShader();
  const mat = new ShaderMaterial(
    'atmosphere',
    scene,
    { vertex: 'atmosphere', fragment: 'atmosphere' },
    {
      attributes: ['position', 'normal'],
      uniforms: [
        'worldViewProjection', 'world',
        'cameraPos', 'sunDir', 'planetCenter',
        'planetRadius', 'atmosphereRadius',
        'tint', 'intensity', 'sunIntensity',
      ],
      needAlphaBlending: true,
    },
  );
  mat.setColor3('tint', opts.tint);
  mat.setFloat('intensity', opts.intensity ?? 1.0);
  mat.setFloat('sunIntensity', opts.sunIntensity ?? 1.0);
  mat.setVector3('sunDir', opts.sunDir);
  mat.setVector3('planetCenter', opts.planetCenter);
  mat.setFloat('planetRadius', opts.planetRadius);
  mat.setFloat('atmosphereRadius', opts.atmosphereRadius);
  mat.alpha = 1.0;
  mat.backFaceCulling = false;
  mat.alphaMode = 1; // BABYLON.Engine.ALPHA_ADD = 1

  // Camera position hook (re-applied per frame in update()).
  mat.onBindObservable.add(() => {
    if (scene.activeCamera) {
      mat.setVector3('cameraPos', scene.activeCamera.globalPosition);
    }
  });

  return mat;
}

/** Update the planet center on the material each frame (cheap). */
export function updateAtmosphereCenter(mat: ShaderMaterial, center: Vector3): void {
  mat.setVector3('planetCenter', center);
}

/** Update the sun direction on the material. */
export function updateAtmosphereSun(mat: ShaderMaterial, sunDir: Vector3): void {
  mat.setVector3('sunDir', sunDir);
}

/**
 * Wrap a planet mesh with an atmosphere sphere.
 * Returns a sibling mesh; caller is responsible for disposing.
 */
export function attachAtmosphere(
  scene: Scene,
  planetMesh: Mesh,
  opts: AtmosphereMaterialOptions,
): Mesh {
  const atmRadius = opts.atmosphereRadius;
  const atm = planetMesh.clone(`${planetMesh.name}-atmosphere`);
  atm.scaling.scaleInPlace(atmRadius / opts.planetRadius);
  const mat = createAtmosphereMaterial(scene, opts);
  atm.material = mat;
  atm.isPickable = false;
  atm.parent = planetMesh.parent; // share transform
  return atm;
}