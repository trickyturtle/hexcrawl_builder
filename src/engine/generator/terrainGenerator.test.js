import { describe, it, expect } from 'vitest'
import { generateHexes, expandHexGrid, propagateTerrain, estimateHexesForModules } from './terrainGenerator.js'

describe('generateHexes', () => {
  it('generates approximately hexCount hexes', () => {
    const { hexes } = generateHexes({ hexCount: 200 })
    expect(hexes.length).toBeGreaterThan(180)
    expect(hexes.length).toBeLessThan(220)
  })

  it('honors explicit dimensions over hexCount', () => {
    const { hexes, gridDimensions } = generateHexes({ hexCount: 500, dimensions: { width: 8, height: 5 } })
    expect(gridDimensions).toEqual({ width: 8, height: 5 })
    expect(hexes).toHaveLength(40)
  })

  it('assigns terrain, biome and elevation to every hex', () => {
    const { hexes } = generateHexes({ hexCount: 100 })
    for (const h of hexes) {
      expect(h.terrain).toBeTruthy()
      expect(h.biome).toBeTruthy()
      expect(h.elevation).toBeTruthy()
    }
  })

  it('keeps the ocean ring on the map edge, not the interior (offset-column shape math)', () => {
    const { hexes, gridDimensions } = generateHexes({ hexCount: 300, mapShape: 'circular' })
    const { width, height } = gridDimensions
    for (const h of hexes.filter((x) => x.terrain === 'ocean')) {
      const col = h.q + Math.floor(h.r / 2)
      const edgeDistCols = Math.min(col, width - 1 - col) / width
      const edgeDistRows = Math.min(h.r, height - 1 - h.r) / height
      // Every ocean hex should be near at least one map edge
      expect(Math.min(edgeDistCols, edgeDistRows)).toBeLessThan(0.25)
    }
  })
})

describe('generateHexes — map shapes', () => {
  const oceanFraction = (params) => {
    const { hexes } = generateHexes(params)
    return hexes.filter((h) => h.terrain === 'ocean').length / hexes.length
  }

  it('rectangle is all land', () => {
    expect(oceanFraction({ hexCount: 200, mapShape: 'rectangle' })).toBe(0)
  })

  it('island is mostly ocean', () => {
    expect(oceanFraction({ hexCount: 200, mapShape: 'island' })).toBeGreaterThan(0.35)
  })

  it('continent has a coastline but a large interior', () => {
    const f = oceanFraction({ hexCount: 300, mapShape: 'continent' })
    expect(f).toBeGreaterThan(0.05)
    expect(f).toBeLessThan(0.5)
  })
})

describe('generateHexes — biome distribution', () => {
  it('fills interior land with the requested biome', () => {
    const { hexes } = generateHexes({
      hexCount: 200, mapShape: 'continent', biomeDistribution: { arid: 100 },
    })
    const land = hexes.filter((h) => h.terrain !== 'ocean' && h.terrain !== 'coast')
    expect(land.length).toBeGreaterThan(50)
    for (const h of land) expect(h.biome).toBe('arid')
  })

  it('splits coverage between requested biomes', () => {
    const { hexes } = generateHexes({
      hexCount: 300, mapShape: 'rectangle', weirdnessFactor: 10,
      biomeDistribution: { temperate: 50, arid: 50 },
    })
    const counts = {}
    for (const h of hexes) counts[h.biome] = (counts[h.biome] ?? 0) + 1
    expect(counts.temperate).toBeGreaterThan(hexes.length * 0.3)
    expect(counts.arid).toBeGreaterThan(hexes.length * 0.3)
  })

  it('ignores non-surface biomes in the distribution', () => {
    const { hexes } = generateHexes({
      hexCount: 100, mapShape: 'rectangle', biomeDistribution: { underground: 100 },
    })
    // falls back to the noise algorithm — no underground surface hexes
    expect(hexes.every((h) => h.biome !== 'underground')).toBe(true)
  })
})

describe('generateHexes — biome adjacency & anomalies', () => {
  it('never flags anomalies at weirdness 0', () => {
    const { hexes } = generateHexes({
      hexCount: 300, mapShape: 'rectangle', weirdnessFactor: 0,
      biomeDistribution: { tropical: 50, cold: 50 },
    })
    expect(hexes.every((h) => !h.anomaly)).toBe(true)
  })

  it('flags weirdness-enabled hard rule breaks as dimensional anomalies', () => {
    const { hexes } = generateHexes({
      hexCount: 300, mapShape: 'rectangle', weirdnessFactor: 10,
      biomeDistribution: { tropical: 50, cold: 50 },
    })
    // tropical–cold scores 0.2 (≤ 0.25): kept at weirdness 10, flagged
    expect(hexes.some((h) => h.anomaly)).toBe(true)
  })

  it('does not flag borderline-natural pairings on a default-weirdness map', () => {
    // desert next to plains (arid–temperate, 0.4) is mundane, not an anomaly
    const { hexes } = generateHexes({ hexCount: 300, weirdnessFactor: 2 })
    expect(hexes.every((h) => !h.anomaly)).toBe(true)
  })
})

describe('generateHexes — danger & magic ratings', () => {
  it('magicDensity none produces no magic anywhere', () => {
    const { hexes } = generateHexes({ hexCount: 200, magicDensity: 'none' })
    expect(hexes.every((h) => h.magic === 0)).toBe(true)
  })

  it('magicDensity wild produces high-magic hexes', () => {
    const { hexes } = generateHexes({ hexCount: 200, magicDensity: 'wild' })
    expect(hexes.some((h) => h.magic >= 3)).toBe(true)
  })

  it('peripheral danger is higher at the edges than the center', () => {
    const { hexes, gridDimensions } = generateHexes({
      hexCount: 300, mapShape: 'rectangle', dangerDistribution: 'peripheral',
    })
    const { width, height } = gridDimensions
    const cx = (width - 1) / 2
    const cy = (height - 1) / 2
    const distOf = (h) => {
      const col = h.q + Math.floor(h.r / 2)
      return Math.sqrt(((col - cx) / cx) ** 2 + ((h.r - cy) / cy) ** 2)
    }
    const avg = (arr) => arr.reduce((s, h) => s + h.danger, 0) / arr.length
    const inner = hexes.filter((h) => distOf(h) < 0.3)
    const outer = hexes.filter((h) => distOf(h) > 0.7)
    expect(avg(outer)).toBeGreaterThan(avg(inner) + 0.5)
  })

  it('concentrated danger produces level-3 pockets and safe stretches', () => {
    const { hexes } = generateHexes({
      hexCount: 300, mapShape: 'rectangle', dangerDistribution: 'concentrated',
    })
    expect(hexes.some((h) => h.danger === 3)).toBe(true)
    expect(hexes.filter((h) => h.danger === 0).length).toBeGreaterThan(hexes.length * 0.3)
  })
})

describe('estimateHexesForModules — environment transition buffer', () => {
  const mod = (environment) => ({ name: 'M', footprint: 'single', environment })

  it('requires more hexes for modules with no shared environment', () => {
    const shared = estimateHexesForModules([mod(['forest']), mod(['forest', 'hills'])])
    const disjoint = estimateHexesForModules([mod(['forest']), mod(['desert'])])
    expect(disjoint.min).toBeGreaterThan(shared.min)
  })

  it('treats legacy string environments like arrays', () => {
    const arrayForm = estimateHexesForModules([mod(['forest']), mod(['desert'])])
    const stringForm = estimateHexesForModules([mod('forest'), mod('desert')])
    expect(stringForm.min).toBe(arrayForm.min)
  })

  it('modules without environment tags add no transition buffer', () => {
    const untagged = estimateHexesForModules([mod([]), mod([])])
    const shared = estimateHexesForModules([mod(['forest']), mod(['forest'])])
    expect(untagged.min).toBe(shared.min)
  })
})

describe('expandHexGrid', () => {
  it('returns only new hexes and reaches the target count', () => {
    const { hexes } = generateHexes({ hexCount: 60 })
    const existing = {}
    for (const h of hexes) existing[h.id] = h

    const added = expandHexGrid(existing, 120, {})
    expect(Object.keys(existing).length + added.length).toBeGreaterThanOrEqual(120)
    for (const h of added) {
      expect(existing[h.id]).toBeUndefined()
      expect(h.terrain).not.toBe('ocean') // expansion never strands entities at sea
    }
  })

  it('is a no-op when the map is already big enough', () => {
    const { hexes } = generateHexes({ hexCount: 100 })
    const existing = {}
    for (const h of hexes) existing[h.id] = h
    expect(expandHexGrid(existing, 50, {})).toHaveLength(0)
  })
})

describe('propagateTerrain', () => {
  it('converts land adjacent to ocean into coast', () => {
    const { hexes } = generateHexes({ hexCount: 200 })
    const byId = {}
    for (const h of hexes) byId[h.id] = h
    const updates = propagateTerrain(byId)
    for (const patch of Object.values(updates)) {
      expect(patch.terrain).toBe('coast')
      expect(patch.biome).toBe('coastal')
    }
    // After applying, no non-coast land hex borders ocean
    for (const [hid, patch] of Object.entries(updates)) byId[hid] = { ...byId[hid], ...patch }
    const again = propagateTerrain(byId)
    expect(Object.keys(again)).toHaveLength(0)
  })
})
