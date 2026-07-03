import { describe, it, expect } from 'vitest'
import { generateHexes, expandHexGrid, propagateTerrain } from './terrainGenerator.js'

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
    const { hexes, gridDimensions } = generateHexes({ hexCount: 300 })
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
