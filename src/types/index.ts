/**
 * Shared type definitions for Stellar Drift.
 *
 * All world coordinates use integer Cartesian space. A "galaxy coordinate"
 * is a 3D int vector; the seed pipeline is deterministic given a coord.
 */

/** Integer 3D coordinate in the meta-galaxy. */
export interface GalaxyCoord {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Integer 2D coordinate within a single galaxy (which star). */
export interface StarCoord {
  readonly sector: number; // 0..N within galaxy
  readonly orbit: number;  // 0..M within star system
}

/** Classification of a generated star. Drives rendering tint & planet types. */
export type StarClass =
  | 'O' | 'B' | 'A' | 'F' | 'G' | 'K' | 'M'
  | 'red-giant' | 'white-dwarf' | 'neutron' | 'black-hole';

export type PlanetClass =
  | 'rocky-desert'
  | 'rocky-ocean'
  | 'rocky-ice'
  | 'rocky-lava'
  | 'gas-giant'
  | 'ice-giant'
  | 'moon';

export type BiomeClass =
  | 'plains' | 'forest' | 'desert' | 'tundra'
  | 'ocean' | 'volcanic' | 'crystal' | 'toxic';

/** Resources that can be mined from a planet. */
export type ResourceKind =
  | 'carbon' | 'iron' | 'copper' | 'platinum'
  | 'water' | 'helium-3' | 'uranium' | 'exotic';

/** Player identity chosen at game start. */
export type PlayerArchetype = 'wanderer' | 'empire-builder';

/** Persisted player state, stored in localStorage. */
export interface PlayerState {
  archetype: PlayerArchetype;
  currentGalaxy: GalaxyCoord;
  currentSystem: StarCoord | null;
  credits: number;
  cargo: Partial<Record<ResourceKind, number>>;
  upgrades: {
    engine: number;
    cargo: number;
    scanner: number;
    shield: number;
  };
  discoveredPlanets: string[]; // hashed planet ids
  foundedStations: string[];   // hashed station ids
  reputation: number;          // M4: derived from discoveries + stations
  createdAt: number;
  updatedAt: number;
}

/** A generated planet within a star system. */
export interface PlanetRecord {
  id: string;
  name: string;
  class: PlanetClass;
  biomes: BiomeClass[];
  radius: number;          // scene units
  orbitRadius: number;     // scene units, distance from star
  orbitPeriod: number;     // seconds (game-time, for animation)
  seed: number;            // used to derive terrain features
  resources: Array<{ kind: ResourceKind; richness: number }>;
  hasAtmosphere: boolean;
  hasWater: boolean;
  hasLife: boolean;
}

export interface StarRecord {
  id: string;
  name: string;
  class: StarClass;
  position: { x: number; y: number; z: number }; // within galaxy scene
  color: { r: number; g: number; b: number };   // RGB tint
  luminosity: number;                            // 0..1
  mass: number;                                  // solar masses
  planets: PlanetRecord[];
}

export interface GalaxyRecord {
  id: string;
  coord: GalaxyCoord;
  seed: number;
  starCount: number;
  name: string;
  centerPosition: { x: number; y: number; z: number };
  spiralArmCount: number;
  stars: StarRecord[];
}