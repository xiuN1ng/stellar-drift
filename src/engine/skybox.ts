/**
 * Procedural skybox: a starfield + faint nebula gradient.
 *
 * Approach: render to a single equirectangular 2D canvas at build time,
 * wrap it in a Babylon.js `Texture` set to equirectangular mode, and apply
 * via a `BackgroundMaterial` on a big inverted sphere.
 *
 * Why canvas-based:
 *  - Deterministic (seeded RNG, can rebuild at any time)
 *  - Zero asset dependency (no HDR file needed)
 *  - Fast on modern browsers (one-time ~10ms cost at boot)
 *
 * Visuals: starfield + 2-3 faint nebula clouds based on Perlin noise,
 * tinted by a per-galaxy palette hue.
 */

import { Scene } from '@babylonjs/core/scene.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { BackgroundMaterial } from '@babylonjs/core/Materials/Background/backgroundMaterial.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';

import { Rng } from '@core/rng.js';
import { makeNoise2D, fbm2D } from '@core/noise.js';

export interface SkyboxOptions {
  seed: number;
  width?: number;       // texture width (px)
  height?: number;      // texture height (px)
  starCount?: number;   // ~ stars to draw
  hue?: number;         // base hue for nebula tint (0..360)
}

/**
 * Build a starfield + nebula equirectangular canvas.
 */
function buildStarfieldCanvas(opts: Required<SkyboxOptions>): HTMLCanvasElement {
  const { seed, width, height, starCount, hue } = opts;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Background: deep blue-black gradient (top to bottom for sky-like).
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, '#020210');
  grad.addColorStop(0.5, '#010108');
  grad.addColorStop(1, '#040420');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Nebulas: 2-3 large soft blobs tinted by hue, drawn via noise.
  const noise = makeNoise2D(seed ^ 0xA1B2);
  const nebulaCount = 2 + Math.floor(((seed >>> 8) % 3));
  for (let n = 0; n < nebulaCount; n++) {
    const cx = ((seed >>> (n * 4)) % width);
    const cy = ((seed >>> (n * 4 + 2)) % height);
    const radius = 80 + ((seed >>> (n * 2)) % 100);

    const blobCanvas = document.createElement('canvas');
    blobCanvas.width = radius * 2;
    blobCanvas.height = radius * 2;
    const bctx = blobCanvas.getContext('2d')!;
    const imageData = bctx.createImageData(radius * 2, radius * 2);
    const data = imageData.data;
    for (let y = 0; y < radius * 2; y++) {
      for (let x = 0; x < radius * 2; x++) {
        const dx = (x - radius) / radius;
        const dy = (y - radius) / radius;
        const r = Math.sqrt(dx * dx + dy * dy);
        if (r > 1) continue;
        // Layered fbm for soft cloud look
        const u = (x + cx) / width * 4;
        const v = (y + cy) / height * 4;
        const noiseVal = fbm2D(noise, u, v, 5, 2.0, 0.55);
        const falloff = 1 - r;
        const alpha = Math.max(0, noiseVal * falloff * 0.18);
        const i = (y * radius * 2 + x) * 4;
        // Convert hue to RGB (simple HSL->RGB inline).
        const c = (1 - Math.abs(2 * 0.4 - 1)) * 0.6;
        const hp = ((hue % 360) + 360) % 360 / 60;
        const xc = c * (1 - Math.abs((hp % 2) - 1));
        let r1 = 0, g1 = 0, b1 = 0;
        if (hp < 1) { r1 = c; g1 = xc; b1 = 0; }
        else if (hp < 2) { r1 = xc; g1 = c; b1 = 0; }
        else if (hp < 3) { r1 = 0; g1 = c; b1 = xc; }
        else if (hp < 4) { r1 = 0; g1 = xc; b1 = c; }
        else if (hp < 5) { r1 = xc; g1 = 0; b1 = c; }
        else { r1 = c; g1 = 0; b1 = xc; }
        data[i + 0] = Math.floor((r1 + 0.2) * 255);
        data[i + 1] = Math.floor((g1 + 0.2) * 255);
        data[i + 2] = Math.floor((b1 + 0.4) * 255);
        data[i + 3] = Math.floor(alpha * 255);
      }
    }
    bctx.putImageData(imageData, 0, 0);
    ctx.drawImage(blobCanvas, cx - radius, cy - radius);
  }

  // Stars: many small dots with varied brightness + tint.
  const starRng = new Rng((seed * 2654435761) >>> 0);
  for (let i = 0; i < starCount; i++) {
    const x = starRng.next() * width;
    const y = starRng.next() * height;
    // Brightness: most dim, few bright. Use sqrt for tail.
    const mag = Math.pow(starRng.next(), 3); // skew to dim
    const size = 0.5 + mag * 2.5;
    // Tint: 70% white, 20% blue, 7% yellow, 3% red.
    const r = starRng.next();
    let rC = 255, gC = 255, bC = 255;
    if (r > 0.97) { rC = 255; gC = 180; bC = 140; }
    else if (r > 0.90) { rC = 255; gC = 240; bC = 200; }
    else if (r > 0.70) { rC = 200; gC = 220; bC = 255; }
    ctx.fillStyle = `rgba(${rC},${gC},${bC},${0.3 + mag * 0.7})`;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
    // Brightest stars get a subtle glow.
    if (mag > 0.7) {
      const grad = ctx.createRadialGradient(x, y, 0, x, y, size * 4);
      grad.addColorStop(0, `rgba(${rC},${gC},${bC},${mag * 0.4})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, size * 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return canvas;
}

/**
 * Create a Babylon.js skybox from procedural starfield.
 * Returns the inverted sphere mesh so caller can dispose later if needed.
 */
export function createSkybox(scene: Scene, opts: SkyboxOptions): { mesh: ReturnType<typeof MeshBuilder.CreateSphere>; dispose: () => void } {
  const fullOpts: Required<SkyboxOptions> = {
    seed: opts.seed,
    width: opts.width ?? 2048,
    height: opts.height ?? 1024,
    starCount: opts.starCount ?? 4000,
    hue: opts.hue ?? 220,
  };
  const canvas = buildStarfieldCanvas(fullOpts);
  const texture = Texture.LoadFromDataString('starfield', canvas.toDataURL(), scene, true, false);
  texture.coordinatesMode = Texture.FIXED_EQUIRECTANGULAR_MODE;
  texture.gammaSpace = false; // we drew in sRGB already
  texture.wrapU = Texture.CLAMP_ADDRESSMODE;
  texture.wrapV = Texture.CLAMP_ADDRESSMODE;

  const skybox = MeshBuilder.CreateSphere('skybox', { diameter: 4000, sideOrientation: 1 }, scene);
  skybox.infiniteDistance = true;

  const mat = new BackgroundMaterial('skybox-mat', scene);
  mat.useRGBColor = false;
  mat.reflectionTexture = texture;
  mat.backFaceCulling = false;
  skybox.material = mat;
  skybox.isPickable = false;

  return {
    mesh: skybox,
    dispose: () => {
      texture.dispose();
      mat.dispose();
      skybox.dispose();
    },
  };
}

/** Helper for prism: convert HSV-ish tint into Color3 for further use. */
export function hueToColor3(hue: number, sat: number = 0.6, lum: number = 0.5): Color3 {
  const c = (1 - Math.abs(2 * lum - 1)) * sat;
  const hp = ((hue % 360) + 360) % 360 / 60;
  const xc = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0, g1 = 0, b1 = 0;
  if (hp < 1) { r1 = c; g1 = xc; b1 = 0; }
  else if (hp < 2) { r1 = xc; g1 = c; b1 = 0; }
  else if (hp < 3) { r1 = 0; g1 = c; b1 = xc; }
  else if (hp < 4) { r1 = 0; g1 = xc; b1 = c; }
  else if (hp < 5) { r1 = xc; g1 = 0; b1 = c; }
  else { r1 = c; g1 = 0; b1 = xc; }
  const m = lum - c / 2;
  return new Color3(r1 + m, g1 + m, b1 + m);
}

export const _internal = { Vector3 }; // re-export to keep tree-shaker happy