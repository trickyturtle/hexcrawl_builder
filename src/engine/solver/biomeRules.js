// Biome adjacency compatibility scores (0=incompatible, 1=fully compatible)
export const BIOME_ADJACENCY = {
  temperate:   { temperate: 1,   coastal: 1,   cold: 0.7, tropical: 0.7, arid: 0.4,  underground: 0.3, magical: 0.8, planar: 0.2 },
  coastal:     { temperate: 1,   coastal: 1,   cold: 0.6, tropical: 0.8, arid: 0.6,  underground: 0.2, magical: 0.7, planar: 0.2 },
  cold:        { temperate: 0.7, coastal: 0.6, cold: 1,   tropical: 0.2, arid: 0.3,  underground: 0.5, magical: 0.6, planar: 0.3 },
  tropical:    { temperate: 0.7, coastal: 0.8, cold: 0.2, tropical: 1,   arid: 0.5,  underground: 0.3, magical: 0.7, planar: 0.3 },
  arid:        { temperate: 0.4, coastal: 0.6, cold: 0.3, tropical: 0.5, arid: 1,    underground: 0.4, magical: 0.5, planar: 0.4 },
  underground: { temperate: 0.3, coastal: 0.2, cold: 0.5, tropical: 0.3, arid: 0.4,  underground: 1,   magical: 0.6, planar: 0.5 },
  magical:     { temperate: 0.8, coastal: 0.7, cold: 0.6, tropical: 0.7, arid: 0.5,  underground: 0.6, magical: 1,   planar: 0.8 },
  planar:      { temperate: 0.2, coastal: 0.2, cold: 0.3, tropical: 0.3, arid: 0.4,  underground: 0.5, magical: 0.8, planar: 1   },
}

// At weirdnessFactor=0 threshold is 0.5; at 10 threshold drops to 0 (anything goes)
export function validateBiomeAdjacency(biomeA, biomeB, weirdnessFactor) {
  const score = BIOME_ADJACENCY[biomeA]?.[biomeB] ?? 0.5
  const threshold = 0.5 * (1 - weirdnessFactor / 10)
  return score >= threshold
}
