import { hexId, createHexGrid, getBounds, getNeighborIds } from './hexGrid.js'
import { DEFAULT_HEX } from '../../data/schemas/defaultSchemas.js'

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

// Returns terrain type string based on position and world params
function terrainForHex(q, r, width, height, params) {
  const cx = (width - 1) / 2
  const cy = (height - 1) / 2
  const dist = Math.sqrt(((q - cx) / cx) ** 2 + ((r - cy) / cy) ** 2)

  // Outer ocean / coast ring
  if (dist > 0.92) return 'ocean'
  if (dist > 0.80) return 'coast'

  const n1 = hash2(q, r)
  const n2 = hash2b(q, r)

  // Mountains cluster in a rough arc
  const arcAngle = Math.atan2(r - cy, q - cx)
  const mountainArc = Math.abs(Math.sin(arcAngle * 2.3)) * (1 - dist)
  if (mountainArc > 0.38 && n1 < 0.55 && dist > 0.15) return 'mountains'
  if (mountainArc > 0.28 && n1 < 0.45 && dist > 0.1) return 'hills'

  // Moisture axis: wetter on one side
  const moisture = n2 * 0.6 + (1 - dist) * 0.4

  if (moisture > 0.7 && n1 < 0.6) return 'forest'
  if (moisture > 0.55 && n1 < 0.35) return 'swamp'
  if (moisture < 0.25) return 'desert'
  if (dist < 0.15 && n1 < 0.3 && params.ageOfWorld === 'ancient') return 'tundra'

  return 'plains'
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

// Terrain for expansion hexes — coordinate-based noise, no grid-size normalisation.
// Never produces ocean so the solver always has land to work with.
function terrainForExpansionHex(q, r, params = {}) {
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
    const terrain = terrainForExpansionHex(q, r, worldParams)
    newHexes.push({
      ...DEFAULT_HEX,
      id, q, r, x, y, corners,
      terrain,
      biome:     biomeForTerrain(terrain),
      elevation: elevationForTerrain(terrain),
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
  const { hexCount = 200, hexSizeMiles = 6, ageOfWorld = 'mature' } = worldParams

  // Compute grid dimensions from hexCount, ~golden-ratio aspect
  const ratio = 1.6
  const height = Math.round(Math.sqrt(hexCount / ratio))
  const width = Math.round(hexCount / height)

  const hexData = createHexGrid(width, height, 28)
  const bounds = getBounds(hexData)

  return {
    hexes: hexData.map(({ q, r, x, y, corners }) => ({
      ...DEFAULT_HEX,
      id: hexId(q, r),
      q,
      r,
      x,
      y,
      corners,
      terrain: terrainForHex(q, r, width, height, { ageOfWorld }),
      biome: null, // set below
      fog: 'known', // reveal all during development
    })).map((h) => ({ ...h, biome: biomeForTerrain(h.terrain), elevation: elevationForTerrain(h.terrain) })),
    bounds,
    gridDimensions: { width, height },
  }
}
