import { describe, it, expect } from 'vitest'
import { hexId, parseHexId, hexDistance, getNeighborIds, createHexGrid, getBounds } from './hexGrid.js'

describe('hexId / parseHexId', () => {
  it('round-trips positive and negative axial coordinates', () => {
    expect(parseHexId(hexId(3, 7))).toEqual({ q: 3, r: 7 })
    expect(parseHexId(hexId(-4, 12))).toEqual({ q: -4, r: 12 })
  })
})

describe('hexDistance', () => {
  it('is zero for identical hexes', () => {
    expect(hexDistance({ q: 2, r: 3 }, { q: 2, r: 3 })).toBe(0)
  })

  it('is 1 for all six axial neighbors', () => {
    for (const nid of getNeighborIds(0, 0)) {
      expect(hexDistance({ q: 0, r: 0 }, parseHexId(nid))).toBe(1)
    }
  })

  it('computes straight-line axial distances', () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 3, r: 0 })).toBe(3)
    expect(hexDistance({ q: 0, r: 0 }, { q: 0, r: 5 })).toBe(5)
    expect(hexDistance({ q: 0, r: 0 }, { q: -2, r: 2 })).toBe(2) // shared diagonal
  })

  it('is symmetric', () => {
    expect(hexDistance({ q: -3, r: 5 }, { q: 4, r: -1 }))
      .toBe(hexDistance({ q: 4, r: -1 }, { q: -3, r: 5 }))
  })
})

describe('createHexGrid', () => {
  it('creates width × height hexes with axial coordinates', () => {
    const grid = createHexGrid(5, 4)
    expect(grid).toHaveLength(20)
    // honeycomb's rectangle traverser shifts q negative on lower rows (axial coords)
    const row2 = grid.filter((h) => h.r === 2).map((h) => h.q)
    expect(Math.min(...row2)).toBe(-1)
  })

  it('gives every hex six corners and a stable id scheme', () => {
    const grid = createHexGrid(3, 3)
    for (const h of grid) {
      expect(h.corners).toHaveLength(6)
      expect(parseHexId(hexId(h.q, h.r))).toEqual({ q: h.q, r: h.r })
    }
  })
})

describe('getBounds', () => {
  it('returns a zero box for an empty grid', () => {
    expect(getBounds([]).width).toBe(0)
  })

  it('covers all corners', () => {
    const grid = createHexGrid(4, 3)
    const b = getBounds(grid)
    for (const { corners } of grid) {
      for (const { x, y } of corners) {
        expect(x).toBeGreaterThanOrEqual(b.minX)
        expect(x).toBeLessThanOrEqual(b.maxX)
        expect(y).toBeGreaterThanOrEqual(b.minY)
        expect(y).toBeLessThanOrEqual(b.maxY)
      }
    }
  })
})
