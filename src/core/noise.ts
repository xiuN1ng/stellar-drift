/**
 * Noise functions backed by the `simplex-noise` library.
 *
 * We always seed a noise function with a uint32 seed so that
 * different seeds give different worlds, but a given seed gives
 * the same world every time.
 */

import { createNoise2D, createNoise3D } from 'simplex-noise';
import { Rng } from './rng.js';

export interface Noise2D {
  (x: number, y: number): number; // returns approximately [-1, 1]
}

export interface Noise3D {
  (x: number, y: number, z: number): number;
}

/** Build a 2D simplex noise generator from a 32-bit seed. */
export function makeNoise2D(seed: number): Noise2D {
  const rng: Rng = new Rng(seed);
  const impl = createNoise2D(() => rng.next());
  return (x, y) => impl(x, y);
}

/** Build a 3D simplex noise generator. */
export function makeNoise3D(seed: number): Noise3D {
  const rng: Rng = new Rng(seed);
  const impl = createNoise3D(() => rng.next());
  return (x, y, z) => impl(x, y, z);
}

/** Fractal Brownian Motion (multi-octave noise). Common for terrain. */
export function fbm2D(
  noise: Noise2D,
  x: number,
  y: number,
  octaves: number = 5,
  lacunarity: number = 2.0,
  gain: number = 0.5,
): number {
  let amp = 1.0;
  let freq = 1.0;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise(x * freq, y * freq);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm; // approx [-1, 1]
}

/** Ridged multifractal noise. Good for mountain ranges. */
export function ridge2D(
  noise: Noise2D,
  x: number,
  y: number,
  octaves: number = 5,
  lacunarity: number = 2.0,
  gain: number = 0.5,
): number {
  let amp = 1.0;
  let freq = 1.0;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(noise(x * freq, y * freq));
    sum += amp * n * n;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return (sum / norm) * 2 - 1;
}