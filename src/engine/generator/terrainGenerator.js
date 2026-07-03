import { hexId, createHexGrid, getBounds, getNeighborIds } from './hexGrid.js'
import { DEFAULT_HEX } from '../../data/schemas/defaultSchemas.js'
import { applyBiomeAdjacency, terrainForBiome } from '../solver/biomeRules.js'

// Deterministic hash → [0,1) for a given q,r position
function hash2(q, r) {
  let h = ((q * 1234567891) ^ (r * 987654321)) >>> 0
  h ^= h >>> 16
  h = Math.imul(h, 0x45d9f3b)
  h ^= h >>> 16
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) / 4294967295
}

function hash2b(q, r) {
  return hash2(q + 999, r - 888)
}

// Biomes usable as interior land fill. Coastal comes from the shoreline,
// underground is independent of the surface, planar is anomaly-only.
const NATURAL_FILL_BIOMES = ['temperate', 'tropical', 'arid', 'cold', 'magical']

// ── Map shape ─────────────────────────────────────────────────────────────────
// Normalized "distance from land center" for shape masking: > 0.92 is ocean,
// > 0.80 is coast. q,r are axial; col is the offset column (q + floor(r/2)) so
// shape math isn't sheared.
function shapeDistance(col, r, width, height, mapShape) {
  const cx = (width - 1) / 2
  const cy = (height - 1) / 2
  const ex = cx > 0 ? (col - cx) / cx : 0
  const ey = cy > 0 ? (r - cy) / cy : 0
  const dist = Math.sqrt(ex * ex + ey * ey)
  const n = hash2(col + 777, r + 333) // coastline noise, stable per position

  switch (mapShape) {
    case 'rectangle':
      return 0 // simple grid: all land, no ocean ring
    case 'island':
      return dist * 1.55 + (n - 0.5) * 0.18
    case 'continent':
      return dist + (n - 0.5) * 0.38
    case 'irregular': {
      // two offset lobes, take the nearer one, heavy coastline noise
      const ex2 = cx > 0 ? (col - cx * 0.55) / cx : 0
      const ey2 = cy > 0 ? (r - cy * 1.35) / cy : 0
      const d2 = Math.sqrt(ex2 * ex2 + ey2 * ey2)
      return Math.min(dist * 1.2, d2 * 1.4) + (n - 0.5) * 0.45
    }
    case 'circular':
    default:
      return dist
  }
}

// ── Biome distribution ────────────────────────────────────────────────────────
// biomeDistribution is { biome: percentage }. Only natural fill biomes count;
// returns null when nothing usable is set (falls back to the noise algorithm).
function normalizeBiomeWeights(biomeDistribution) {
  if (!biomeDistribution) return null
  const entries = NATURAL_FILL_BIOMES
    .map((b) => [b, Number(biomeDistribution[b]) || 0])
    .filter(([, v]) => v > 0)
  const total = entries.reduce((s, [, v]) => s + v, 0)
  if (total <= 0) return null
  return entries.map(([b, v]) => [b, v / total])
}

function pickWeighted(weights, n) {
  let acc = 0
  for (const [biome, w] of weights) {
    acc += w
    if (n < acc) return biome
  }
  return weights[weights.length - 1][0]
}

// ── Interior terrain (legacy noise algorithm, used without biomeDistribution) ─
function noiseTerrain(q, r, col, cx, cy, dist, params) {
  const n1 = hash2(q, r)
  const n2 = hash2b(q, r)

  // Mountains cluster in a rough arc
  const arcAngle = Math.atan2(r - cy, col - cx)
  const mountainArc = Math.abs(Math.sin(arcAngle * 2.3)) * (1 - Math.min(dist, 1))
  if (mountainArc > 0.38 && n1 < 0.55 && dist > 0.15) return 'mountains'
  if (mountainArc > 0.28 && n1 < 0.45 && dist > 0.1) return 'hills'

  // Moisture axis: wetter toward the interior
  const moisture = n2 * 0.6 + (1 - Math.min(dist, 1)) * 0.4

  if (moisture > 0.7 && n1 < 0.6) return 'forest'
  if (moisture > 0.55 && n1 < 0.35) return 'swamp'
  if (moisture < 0.25) return 'desert'
  if (dist < 0.15 && n1 < 0.3 && params.ageOfWorld === 'ancient') return 'tundra'

  return 'plains'
}

function terrainAndBiome(q, r, col, width, height, params) {
  const d = shapeDistance(col, r, width, height, params.mapShape ?? 'continent')
  if (d > 0.92) return { terrain: 'ocean', biome: 'coastal' }
  if (d > 0.80) return { terrain: 'coast', biome: 'coastal' }

  const weights = normalizeBiomeWeights(params.biomeDistribution)
  if (weights) {
    const biome = pickWeighted(weights, hash2(q + 555, r - 222))
    return { terrain: terrainForBiome(biome, hash2(q, r)), biome }
  }

  const cx = (width - 1) / 2
  const cy = (height - 1) / 2
  const terrain = noiseTerrain(q, r, col, cx, cy, d, params)
  return { terrain, biome: biomeForTerrain(terrain) }
}

function biomeForTerrain(terrain) {
  const map = {
    plains: 'temperate',
    forest: 'temperate',
    hills: 'temperate',
    mountains: 'cold',
    desert: 'arid',
    swamp: 'tropical',
    tundra: 'cold',
    coast: 'coastal',
    ocean: 'coastal',
    underground: 'underground',
  }
  return map[terrain] ?? 'temperate'
}

function elevationForTerrain(terrain) {
  if (terrain === 'mountains') return 'mountain'
  if (terrain === 'underground') return 'underground'
  return 'lowland'
}

// ── Danger / magic ratings (0–3 per hex) ──────────────────────────────────────
export function dangerForHex(col, r, width, height, params = {}) {
  const { dangerDistribution = 'even' } = params
  const n = hash2(col + 4242, r + 1717)
  const cx = (width - 1) / 2
  const cy = (height - 1) / 2
  const ex = cx > 0 ? (col - cx) / cx : 0
  const ey = cy > 0 ? (r - cy) / cy : 0
  const dist = Math.sqrt(ex * ex + ey * ey)

  switch (dangerDistribution) {
    case 'concentrated': {
      // low-frequency cluster noise: a few pockets of high danger
      const c = hash2(Math.floor(col / 4) + 99, Math.floor(r / 4) + 55)
      if (c > 0.85) return n > 0.3 ? 3 : 2
      if (c > 0.7) return n > 0.5 ? 2 : 1
      return n > 0.8 ? 1 : 0
    }
    case 'peripheral':
      return Math.max(0, Math.min(3, Math.round(dist * 3.2 - 0.4 + (n - 0.5) * 0.8)))
    case 'random':
      return Math.floor(n * 4)
    case 'even':
    default:
      return n > 0.75 ? 2 : 1
  }
}

export function magicForHex(col, r, params = {}) {
  const { magicDensity = 'low' } = params
  const n = hash2(col - 3131, r + 8888)
  switch (magicDensity) {
    case 'none':   return 0
    case 'medium': return n > 0.9 ? 2 : n > 0.7 ? 1 : 0
    case 'high':   return n > 0.9 ? 3 : n > 0.7 ? 2 : n > 0.45 ? 1 : 0
    case 'wild':   return Math.floor(hash2b(col + 12, r - 7) * 4)
    case 'low':
    default:       return n > 0.92 ? 1 : 0
  }
}

// Terrain for expansion hexes — coordinate-based noise, no grid-size normalisation.
// Never produces ocean so the solver always has land to work with.
function terrainForExpansionHex(q, r, params = {}) {
  const weights = normalizeBiomeWeights(params.biomeDistribution)
  if (weights) {
    const biome = pickWeighted(weights, hash2(q + 555, r - 222))
    return terrainForBiome(biome, hash2(q, r))
  }
  const { ageOfWorld = 'mature' } = params
  const n1 = hash2(q, r)
  const n2 = hash2b(q, r)
  const moisture = n2 * 0.6 + 0.4
  if (n1 > 0.88) return 'mountains'
  if (n1 > 0.75) return 'hills'
  if (moisture > 0.70 && n1 < 0.55) return 'forest'
  if (moisture > 0.58 && n1 < 0.30) return 'swamp'
  if (moisture < 0.25) return 'desert'
  if (ageOfWorld === 'ancient' && n1 < 0.08) return 'tundra'
  return 'plains'
}

// ── Public: hex-count estimation ─────────────────────────────────────────────
// Returns { min, recommended } for placing a set of modules on a new or existing map.
export function estimateHexesForModules(modules) {
  const n = modules.length
  if (n === 0) return { min: 0, recommended: 0 }

  // Sprawling modules need more home hexes
  const totalFootprint = modules.reduce((sum, m) => (
    sum + (m.footprint === 'sprawling' ? Math.max(2, m.localeCount ?? 2) : 1)
  ), 0)

  const contextHexes  = n * 6        // ring-1 context per module (6 neighbours)
  const travelGapsMin = (n - 1) * 3  // minimum traversable gaps between modules

  // Parse environment tags (handles both array and legacy string forms)
  const envTags = modules.map((m) => {
    if (Array.isArray(m.environment)) return m.environment.map((e) => e.toLowerCase())
    if (typeof m.environment === 'string' && m.environment)
      return m.environment.split(/[/,·]+/).map((s) => s.trim().toLowerCase()).filter(Boolean)
    return []
  })

  // Count module pairs with no shared environment → need terrain transition buffer
  let incompatiblePairs = 0
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (!envTags[i].length || !envTags[j].length) continue
      const shared = envTags[i].some((a) => envTags[j].some((b) => a.includes(b) || b.includes(a)))
      if (!shared) incompatiblePairs++
    }
  }

  const rawMin = totalFootprint + contextHexes + travelGapsMin + incompatiblePairs * 4
  const min    = Math.max(10, Math.ceil(rawMin / 5) * 5)

  // Recommended adds ring-2 context per module + comfortable inter-module travel
  const rawRec      = rawMin + n * 12 + (n - 1) * 5
  const recommended = Math.max(min + 10, Math.ceil(rawRec / 10) * 10)

  return { min, recommended }
}

// ── Public: map expansion ────────────────────────────────────────────────────
// Grows the hex grid to at least targetCount hexes.
// Returns array of NEW hex objects to merge into the store (does not modify existing).
export function expandHexGrid(existingHexes, targetCount, worldParams = {}) {
  const existingCount = Object.keys(existingHexes).length
  if (existingCount >= targetCount) return []

  // Find current bounding box
  const hexList = Object.values(existingHexes)
  const maxQ = hexList.reduce((m, h) => Math.max(m, h.q), 0)
  const maxR = hexList.reduce((m, h) => Math.max(m, h.r), 0)
  const oldWidth  = maxQ + 1
  const oldHeight = maxR + 1

  // Compute new dimensions (same 1.6 aspect ratio as generateHexes)
  const ratio = 1.6
  let newHeight = Math.max(oldHeight, Math.round(Math.sqrt(targetCount / ratio)))
  let newWidth  = Math.max(oldWidth,  Math.round(targetCount / newHeight))
  while (newWidth * newHeight < targetCount) newWidth++

  // Generate full expanded grid — existing hexes' x/y positions are unchanged because
  // we only grow rightward/downward (origin:'topLeft' offset doesn't shift).
  const fullGrid = createHexGrid(newWidth, newHeight, 28)

  const newHexes = []
  for (const { q, r, x, y, corners } of fullGrid) {
    const id = hexId(q, r)
    if (existingHexes[id]) continue
    const col = q + Math.floor(r / 2)
    const terrain = terrainForExpansionHex(q, r, worldParams)
    newHexes.push({
      ...DEFAULT_HEX,
      id, q, r, x, y, corners,
      terrain,
      biome:     biomeForTerrain(terrain),
      elevation: elevationForTerrain(terrain),
      danger:    dangerForHex(col, r, newWidth, newHeight, worldParams),
      magic:     magicForHex(col, r, worldParams),
      fog: 'known',
    })
  }
  return newHexes
}

// After batch placement, normalise terrain so land hexes adjacent to ocean become coast.
// Returns { [hexId]: patchObject } — apply via updateHex for each entry.
export function propagateTerrain(hexes) {
  const updates = {}
  for (const hex of Object.values(hexes)) {
    if (hex.terrain === 'ocean' || hex.terrain === 'coast') continue
    const neighbors = getNeighborIds(hex.q, hex.r)
    if (neighbors.some((nid) => hexes[nid]?.terrain === 'ocean')) {
      updates[hex.id] = { terrain: 'coast', biome: 'coastal', elevation: 'lowland' }
    }
  }
  return updates
}

export function generateHexes(worldParams) {
  const { hexCount = 200, dimensions = null, weirdnessFactor = 2 } = worldParams

  // Explicit dimensions override hexCount; otherwise compute ~golden-ratio grid
  let width, height
  if (dimensions?.width > 0 && dimensions?.height > 0) {
    width = Math.round(dimensions.width)
    height = Math.round(dimensions.height)
  } else {
    const ratio = 1.6
    height = Math.max(1, Math.round(Math.sqrt(hexCount / ratio)))
    width = Math.max(1, Math.round(hexCount / height))
  }

  const hexData = createHexGrid(width, height, 28)
  const bounds = getBounds(hexData)

  const byId = {}
  for (const { q, r, x, y, corners } of hexData) {
    const col = q + Math.floor(r / 2)
    const { terrain, biome } = terrainAndBiome(q, r, col, width, height, worldParams)
    const id = hexId(q, r)
    byId[id] = {
      ...DEFAULT_HEX,
      id, q, r, x, y, corners,
      terrain,
      biome,
      elevation: elevationForTerrain(terrain),
      danger: dangerForHex(col, r, width, height, worldParams),
      magic: magicForHex(col, r, worldParams),
      fog: 'known', // reveal all during development
    }
  }

  // Enforce biome adjacency rules (smooths violations; flags weirdness-enabled
  // rule breaks as dimensional anomalies)
  const patches = applyBiomeAdjacency(byId, weirdnessFactor)
  for (const [id, patch] of Object.entries(patches)) {
    byId[id] = { ...byId[id], ...patch }
  }

  return {
    hexes: Object.values(byId),
    bounds,
    gridDimensions: { width, height },
  }
}
