import { getNeighborIds } from '../generator/hexGrid.js'

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

// Representative terrain for a biome, picked by a [0,1) noise value so a biome
// region isn't a single uniform terrain type.
export function terrainForBiome(biome, n = 0.7) {
  switch (biome) {
    case 'temperate': return n < 0.35 ? 'forest' : n < 0.5 ? 'hills' : 'plains'
    case 'tropical':  return n < 0.45 ? 'swamp' : 'forest'
    case 'arid':      return 'desert'
    case 'cold':      return n < 0.55 ? 'tundra' : 'mountains'
    case 'magical':   return n < 0.3 ? 'forest' : 'plains'
    case 'coastal':   return 'coast'
    default:          return 'plains'
  }
}

// Enforce biome adjacency across the map (spec: strictness modulated by
// weirdnessFactor; at high weirdness, rule-breaking pairs are kept but flagged
// as dimensional anomalies).
//
// Returns { [hexId]: patch } where patch may set biome/terrain/elevation
// (a violating hex assimilated into its neighbor's biome) and/or anomaly:true
// (the pair breaks the weirdness-0 rules but is allowed at current weirdness).
// Does not mutate the input.
export function applyBiomeAdjacency(hexes, weirdnessFactor = 2) {
  const patches = {}
  const biomeOf = (h) => patches[h.id]?.biome ?? h.biome
  // Ocean/coast hexes define the coastline; they are never rewritten
  const fixed = (h) => !h || h.terrain === 'ocean' || h.terrain === 'coast'

  const sameBiomeNeighbors = (h) =>
    getNeighborIds(h.q, h.r).filter((nid) => {
      const nb = hexes[nid]
      return nb && !fixed(nb) && biomeOf(nb) === biomeOf(h)
    }).length

  for (let pass = 0; pass < 3; pass++) {
    let changed = false
    for (const hex of Object.values(hexes)) {
      if (fixed(hex)) continue
      for (const nid of getNeighborIds(hex.q, hex.r)) {
        const nb = hexes[nid]
        if (fixed(nb)) continue
        const a = biomeOf(hex)
        const b = biomeOf(nb)
        if (a === b) continue

        if (validateBiomeAdjacency(a, b, weirdnessFactor)) {
          // Allowed at this weirdness — flag if only weirdness permits it
          if (!validateBiomeAdjacency(a, b, 0)) {
            patches[hex.id] = { ...patches[hex.id], anomaly: true }
            patches[nb.id] = { ...patches[nb.id], anomaly: true }
          }
          continue
        }

        // Violation: the hex with fewer same-biome neighbors assimilates
        const [loser, winner] = sameBiomeNeighbors(hex) < sameBiomeNeighbors(nb)
          ? [hex, nb] : [nb, hex]
        const newBiome = biomeOf(winner)
        const seed = (Math.abs(loser.q * 31 + loser.r * 17) % 100) / 100
        const newTerrain = terrainForBiome(newBiome, seed)
        patches[loser.id] = {
          ...patches[loser.id],
          biome: newBiome,
          terrain: newTerrain,
          elevation: newTerrain === 'mountains' ? 'mountain' : 'lowland',
        }
        changed = true
      }
    }
    if (!changed) break
  }

  return patches
}
