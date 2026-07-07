export const DEFAULT_MODULE = {
  name: '',
  system: '',
  sourceFile: '',
  pdfStartPage: 1,
  footprint: 'single',
  localeCount: 1,
  // Environment tags (e.g. 'forest', 'coastal', 'underground') — used by map
  // sizing to add transition space between modules with no shared environment
  environment: [],
  explicitDistances: [],
  entryPoints: [],
  toneKeywords: [],
  difficulty: 'medium',
  moduleRelationships: [],
  entities: [],
  obsidianNote: null,
  notes: '',
}

export const DEFAULT_HEX = {
  terrain: 'plains',
  biome: null,
  elevation: 'lowland',
  entityIds: [],
  fog: 'unknown',
  eventLog: [],
  season: null,
  danger: 0,      // 0–3, from dangerDistribution
  magic: 0,       // 0–3, from magicDensity
  anomaly: false, // biome adjacency broken by weirdness (dimensional anomaly)
  tags: [],       // free-form GM tags ('cleared', 'lair', …)
}

export const TERRAIN_TYPES = [
  'plains', 'forest', 'hills', 'mountains', 'desert',
  'swamp', 'tundra', 'coast', 'ocean', 'underground',
]

// Default biome suggestions — not exhaustive. Entities may require any biome string;
// the solver matches by exact string. Add custom biomes freely in the entity form.
export const BIOME_TYPES = [
  'temperate', 'tropical', 'arid', 'cold', 'coastal',
  'underground', 'magical', 'planar',
]
