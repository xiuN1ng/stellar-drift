/**
 * Galaxy generation: turn a GalaxyCoord into a full GalaxyRecord.
 *
 * Strategy:
 * 1. Hash coord -> galaxy seed.
 * 2. Pick star count (Poisson-like), spiral arm count (2..4), bulge size.
 * 3. For each star: pick class (weighted by realism), position via spiral arms,
 *    color/luminosity/mass, then a small planetary system.
 *
 * "Realism" here is loosely tuned — we want visually varied, not astrophysics-accurate.
 */

import { Rng } from '@core/rng.js';
import { seedFromGalaxy } from '@core/seed.js';
import type {
  GalaxyCoord, GalaxyRecord, StarRecord, StarClass,
  PlanetRecord, PlanetClass, BiomeClass, ResourceKind,
} from '@game-types/index';

const STAR_CLASS_WEIGHTS: ReadonlyArray<[StarClass, number]> = [
  ['O', 0.001],
  ['B', 0.01],
  ['A', 0.04],
  ['F', 0.07],
  ['G', 0.10],
  ['K', 0.18],
  ['M', 0.55],
  ['red-giant', 0.02],
  ['white-dwarf', 0.015],
  ['neutron', 0.008],
  ['black-hole', 0.002],
];

const STAR_COLORS: Record<StarClass, { r: number; g: number; b: number; lum: number }> = {
  O: { r: 0.65, g: 0.78, b: 1.00, lum: 1.00 },
  B: { r: 0.82, g: 0.90, b: 1.00, lum: 0.90 },
  A: { r: 0.95, g: 0.96, b: 1.00, lum: 0.80 },
  F: { r: 1.00, g: 1.00, b: 0.95, lum: 0.70 },
  G: { r: 1.00, g: 0.95, b: 0.82, lum: 0.60 },
  K: { r: 1.00, g: 0.82, b: 0.60, lum: 0.45 },
  M: { r: 1.00, g: 0.65, b: 0.45, lum: 0.20 },
  'red-giant': { r: 1.00, g: 0.45, b: 0.30, lum: 0.85 },
  'white-dwarf': { r: 0.95, g: 0.95, b: 1.00, lum: 0.30 },
  'neutron': { r: 0.55, g: 0.95, b: 1.00, lum: 0.90 },
  'black-hole': { r: 0.10, g: 0.05, b: 0.20, lum: 0.00 },
};

/** Pick a star class based on weighted distribution. */
function pickStarClass(rng: Rng): StarClass {
  return rng.weighted(STAR_CLASS_WEIGHTS);
}

/** Pick a star color + luminosity from class. */
function starAppearance(cls: StarClass) {
  return { ...STAR_COLORS[cls] };
}

/** Pick planet count. Hot stars get fewer, M-class can get up to 8. */
function planetCount(rng: Rng, cls: StarClass): number {
  switch (cls) {
    case 'O':
    case 'B':
      return rng.intRange(0, 1);
    case 'A':
    case 'F':
      return rng.intRange(1, 3);
    case 'G':
      return rng.intRange(2, 6);
    case 'K':
      return rng.intRange(3, 8);
    case 'M':
      return rng.intRange(2, 7);
    case 'red-giant':
      return rng.intRange(2, 5);
    case 'white-dwarf':
      return rng.intRange(0, 3);
    case 'neutron':
      return rng.intRange(0, 1);
    case 'black-hole':
      return rng.intRange(0, 2);
  }
}

/** Pick planet class based on orbit distance (au-ish index). */
function pickPlanetClass(rng: Rng, orbitIndex: number, total: number): PlanetClass {
  // Cold outer -> gas/ice; hot inner -> rocky/lava.
  const t = orbitIndex / Math.max(1, total - 1); // 0 = innermost
  if (t < 0.15 && rng.chance(0.25)) return 'rocky-lava';
  if (t < 0.45) return rng.pick(['rocky-desert', 'rocky-ocean', 'rocky-ice'] as PlanetClass[]);
  if (t < 0.75) return rng.chance(0.4) ? 'rocky-ocean' : 'rocky-desert';
  if (t < 0.9) return rng.chance(0.5) ? 'ice-giant' : 'gas-giant';
  return rng.chance(0.3) ? 'ice-giant' : 'moon';
}

const BIOMES_BY_PLANET: Record<PlanetClass, BiomeClass[]> = {
  'rocky-desert': ['desert', 'plains', 'crystal'],
  'rocky-ocean': ['ocean', 'plains', 'forest'],
  'rocky-ice': ['tundra', 'plains'],
  'rocky-lava': ['volcanic', 'plains'],
  'gas-giant': [],
  'ice-giant': [],
  'moon': ['plains', 'desert'],
};

const RESOURCE_TABLE: Array<{ kind: ResourceKind; weight: number; cls: PlanetClass[] }> = [
  { kind: 'carbon', weight: 3, cls: ['rocky-desert', 'moon'] },
  { kind: 'iron', weight: 3, cls: ['rocky-desert', 'rocky-lava', 'moon'] },
  { kind: 'copper', weight: 2, cls: ['rocky-desert', 'rocky-lava'] },
  { kind: 'platinum', weight: 1, cls: ['rocky-lava', 'rocky-desert'] },
  { kind: 'water', weight: 2, cls: ['rocky-ocean', 'rocky-ice'] },
  { kind: 'helium-3', weight: 1, cls: ['gas-giant', 'ice-giant'] },
  { kind: 'uranium', weight: 1, cls: ['rocky-lava', 'rocky-desert'] },
  { kind: 'exotic', weight: 0.3, cls: ['crystal' as PlanetClass].length > 0 ? ['rocky-desert'] : [] }, // gated
];

/** Build a single planet. */
function buildPlanet(
  rng: Rng,
  starClass: StarClass,
  orbitIndex: number,
  total: number,
): PlanetRecord {
  const cls = pickPlanetClass(rng, orbitIndex, total);
  // Orbit spacing: 30 base + 35 per index. The first planet lands at ~30, the
  // fifth at ~170 — comparable to inner solar system scale (Mercury 0.39 AU,
  // Jupiter 5.2 AU → ~5 AU of useful space; here 140 / 30 ≈ 4.7x growth).
  // Slight jitter (-2..+6) keeps the layout irregular without overlapping
  // the inner star.
  const orbitRadius = 30 + orbitIndex * 35 + rng.range(-2, 6);
  // Inclination: keep every planet on its own slightly tilted plane so they
  // don't all line up along +X. Each orbit index maps to a deterministic
  // inclination in [-12, 12] scene units (per-orbit vertical offset).
  const orbitInclination = Math.sin(orbitIndex * 1.7) * 12;
  const radius = cls.startsWith('gas') || cls === 'ice-giant'
    ? rng.range(3, 5)
    : rng.range(0.8, 2.2);
  const biomes = BIOMES_BY_PLANET[cls];
  const hasAtmosphere = !['moon'].includes(cls) && rng.chance(0.7);
  const hasWater = cls === 'rocky-ocean' || (cls === 'rocky-desert' && rng.chance(0.2));
  const hasLife = (hasAtmosphere && hasWater && rng.chance(0.25)) || biomes.includes('forest');
  const seed = rng.nextUint32();

  const resources: PlanetRecord['resources'] = [];
  for (const entry of RESOURCE_TABLE) {
    if (!entry.cls.includes(cls)) continue;
    if (rng.chance(entry.weight / 6)) {
      resources.push({ kind: entry.kind, richness: rng.range(0.3, 1.0) });
    }
  }
  // Exotic appears only on crystal-biome planets.
  if (biomes.includes('crystal') && rng.chance(0.4)) {
    resources.push({ kind: 'exotic', richness: rng.range(0.6, 1.0) });
  }

  return {
    id: `${starClass}-${orbitIndex}`,
    name: `Planet-${orbitIndex + 1}`,
    class: cls,
    biomes,
    radius,
    orbitRadius,
    orbitInclination,
    orbitPeriod: Math.sqrt(orbitRadius ** 3) * 4,
    seed,
    resources,
    hasAtmosphere,
    hasWater,
    hasLife,
  };
}

/**
 * Realism-driven spiral-arm galaxy layout.
 *
 * Real galaxies have:
 *   - A dense central bulge (radius 0..R_bulge)
 *   - A thin disk with logarithmic spiral arms (R_bulge..R_disk)
 *   - A sparse halo (R_disk..R_halo)
 *   - Vertical thickness that grows with radius (flatter near core)
 *   - Minimum spacing between stars (otherwise they look like a wall of beads)
 *
 * We approximate with:
 *   r   = exponential sample -> ~70% of stars inside R_disk, ~25% in halo, ~5% in bulge
 *   arm = pick 1 of N spiral arms + add angular noise
 *   y   = gaussian-ish, sigma scales with r (thin disk in core, thick at rim)
 *   rep = rejection sample against all previously placed stars at this r-band
 *
 * Result: it looks like a galaxy on the starmap, not a uniform soup.
 */
const R_BULGE = 60;            // central core radius
const R_DISK = 400;            // bulk of the visible galaxy
const R_HALO = 800;            // outer sparse reach
const Y_THINNESS_CORE = 6;     // bulge is almost spherical; tiny y jitter
const Y_THINNESS_RIM = 30;     // disk flares outward
const MIN_SEPARATION_CORE = 22; // stars can pack tighter near the core
const MIN_SEPARATION_DISK = 50; // standard disk spacing (was 70, halved so 60-160 target fits)
const MIN_SEPARATION_HALO = 100; // far-flung halo stars need elbow room

/** Pick a star's distance from the galactic center using a piecewise density model. */
function pickRadius(rng: Rng): number {
  const roll = rng.next();
  if (roll < 0.18) {
    // Bulge: dense, central.
    return rng.range(8, R_BULGE);
  } else if (roll < 0.82) {
    // Inner disk: the bulk of the visible galaxy. Sqrt distribution so
    // surface density falls off like 1/r — stars get sparser with distance
    // but most still live in this band.
    const u = rng.next();
    return R_BULGE + (R_DISK - R_BULGE) * Math.sqrt(u);
  } else if (roll < 0.96) {
    // Outer disk: sparser band, but still disk-like.
    const u = rng.next();
    return R_DISK + (R_HALO - R_DISK) * 0.4 * u;
  } else {
    // Halo: very sparse outliers (4% chance).
    const u = rng.next();
    return R_DISK + (R_HALO - R_DISK) * (0.4 + 0.6 * u);
  }
}

/** Minimum allowed separation at a given radius band. */
function minSeparationFor(r: number): number {
  if (r < R_BULGE) return MIN_SEPARATION_CORE;
  if (r < R_DISK) return MIN_SEPARATION_DISK;
  return MIN_SEPARATION_HALO;
}

/** Vertical half-thickness at a given radius (galactic "scale height"). */
function yThickFor(r: number): number {
  // Smoothly grow from Y_THINNESS_CORE at r=0 to Y_THINNESS_RIM at R_DISK.
  const t = Math.min(1, r / R_DISK);
  return Y_THINNESS_CORE + (Y_THINNESS_RIM - Y_THINNESS_CORE) * t;
}

/** Build a star + its system. Position is supplied by generateGalaxy via rejection sampling. */
function buildStar(
  rng: Rng,
  sector: number,
  position: { x: number; y: number; z: number },
): StarRecord {
  const cls = pickStarClass(rng);
  const app = starAppearance(cls);

  const planetTotal = planetCount(rng, cls);
  const planets: PlanetRecord[] = [];
  for (let i = 0; i < planetTotal; i++) {
    planets.push(buildPlanet(rng, cls, i, planetTotal));
  }

  const mass = rng.range(0.1, 30);

  return {
    id: `star-${sector}`,
    name: `Stellar-${String(sector).padStart(4, '0')}`,
    class: cls,
    position,
    color: { r: app.r, g: app.g, b: app.b },
    luminosity: app.lum,
    mass,
    planets,
  };
}

const NAME_SYLLABLES = [
  'al', 've', 'ri', 'an', 'or', 'es', 'te', 'no', 'ka', 'ra', 'ly', 'sa',
  'ph', 'ar', 'ti', 'qu', 'on', 'us', 'el', 'ix', 'dr', 'co', 'mi', 'st',
];

/** Generate a procedural name from a seed. */
function nameFromSeed(rng: Rng): string {
  const n = rng.intRange(2, 4);
  let out = '';
  for (let i = 0; i < n; i++) out += rng.pick(NAME_SYLLABLES);
  return out.charAt(0).toUpperCase() + out.slice(1);
}

/** Build the full galaxy record for a given coord. */
export function generateGalaxy(coord: GalaxyCoord): GalaxyRecord {
  const seed = seedFromGalaxy(coord);
  const rng = new Rng(seed);

  // Lower target count than before: 60-160 stars spread across a 480-radius
  // disk (volume ~10x larger than the old 120-radius soup) is the right
  // density for a "you can actually fly through it" galaxy. We also budget
  // for ~20% rejection from the minimum-separation sampler.
  const targetCount = rng.intRange(60, 160);
  const spiralArmCount = rng.intRange(2, 4);
  const name = nameFromSeed(rng);

  // Pre-roll one arm offset per arm so the arms don't shift every time we
  // pick a new star.
  const armOffsets = Array.from({ length: spiralArmCount }, () => rng.range(0, Math.PI * 2));

  type Pos = { x: number; y: number; z: number };
  const placed: Pos[] = [];
  const stars: StarRecord[] = [];
  const MAX_ATTEMPTS_PER_STAR = 32;
  const MAX_TOTAL_ATTEMPTS = targetCount * MAX_ATTEMPTS_PER_STAR;

  let attempts = 0;
  while (stars.length < targetCount && attempts < MAX_TOTAL_ATTEMPTS) {
    attempts++;
    const r = pickRadius(rng);
    const armIndex = rng.intRange(0, spiralArmCount - 1);
    const armBase = (armIndex / spiralArmCount) * Math.PI * 2;
    const armOffset = armOffsets[armIndex];
    const noiseAngle = rng.range(-0.35, 0.35);
    // Logarithmic spiral term (tightens near core, opens out at rim).
    const spiral = (Math.log(Math.max(1, r)) * 0.35);
    const angle = armBase + armOffset + noiseAngle + spiral;

    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    // Disk scale height grows with r; small chance of a halo outlier.
    const ySigma = yThickFor(r);
    const y = (rng.next() + rng.next() + rng.next() - 1.5) * ySigma;

    const candidate: Pos = { x, y, z };
    const minSep = minSeparationFor(r);
    let tooClose = false;
    for (const p of placed) {
      const dx = p.x - candidate.x;
      const dy = p.y - candidate.y;
      const dz = p.z - candidate.z;
      if (dx * dx + dy * dy + dz * dz < minSep * minSep) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    placed.push(candidate);
    stars.push(buildStar(rng, stars.length, candidate));
  }

  return {
    id: `galaxy-${coord.x}-${coord.y}-${coord.z}`,
    coord,
    seed,
    starCount: stars.length,
    name,
    centerPosition: { x: 0, y: 0, z: 0 },
    spiralArmCount,
    stars,
  };
}