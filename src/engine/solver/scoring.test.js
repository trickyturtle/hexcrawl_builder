import { describe, it, expect } from 'vitest'
import { solve } from './constraintSolver.js'
import { generateHexes } from '../generator/terrainGenerator.js'
import { hexDistance } from '../generator/hexGrid.js'

function makeHexes(count = 200) {
  const { hexes } = generateHexes({ hexCount: count })
  const byId = {}
  for (const h of hexes) byId[h.id] = h
  return byId
}

function makeEntity(id, name, sources) {
  return {
    id, name, sources,
    subclass: 'Location',
    relationships: [],
    locationRequirements: {
      terrainAffinity: [], biomeRequirements: [],
      elevationRequirements: [], proximityRequirements: [],
    },
    tags: [],
  }
}

describe('placement dispersion', () => {
  // Regression: unconstrained entities from different modules used to tie on
  // score everywhere, so the stable sort placed them all in a line along the
  // first hexes in iteration order (the top coast row).
  it('spreads unrelated modules across the map instead of lining them up', () => {
    const hexes = makeHexes(200)
    const entities = ['m1', 'm2', 'm3', 'm4', 'm5'].map((m, i) =>
      makeEntity(`ent-${m}`, `Site ${i}`, [m])
    )
    const result = solve({ batchEntities: entities, hexes, worldParams: {} })
    expect(result.success).toBe(true)

    const placedHexes = entities.map((e) => hexes[result.placements[e.id]])

    // No two unrelated entities within the spread radius of each other
    let minDist = Infinity
    for (let i = 0; i < placedHexes.length; i++) {
      for (let j = i + 1; j < placedHexes.length; j++) {
        minDist = Math.min(minDist, hexDistance(placedHexes[i], placedHexes[j]))
      }
    }
    expect(minDist).toBeGreaterThanOrEqual(3)

    // Not all in one row (the old failure mode)
    const rows = new Set(placedHexes.map((h) => h.r))
    expect(rows.size).toBeGreaterThan(1)
  })

  it('prefers interior land over the coast ring for entities that do not want coast', () => {
    const hexes = makeHexes(200)
    const entities = ['m1', 'm2', 'm3'].map((m, i) =>
      makeEntity(`ent-${m}`, `Inland ${i}`, [m])
    )
    const result = solve({ batchEntities: entities, hexes, worldParams: {} })
    expect(result.success).toBe(true)
    for (const e of entities) {
      const hex = hexes[result.placements[e.id]]
      expect(hex.terrain).not.toBe('ocean')
      expect(hex.terrain).not.toBe('coast')
    }
  })

  it('still clusters same-locale entities from one module in one hex', () => {
    const hexes = makeHexes(200)
    const a = makeEntity('loc-a', 'Gatehouse', ['mod-x'])
    const b = makeEntity('loc-b', 'Inner Keep', ['mod-x'])
    a.locale = 'keep'
    b.locale = 'keep'
    const result = solve({ batchEntities: [a, b], hexes, worldParams: {} })
    expect(result.success).toBe(true)
    expect(result.placements['loc-a']).toBe(result.placements['loc-b'])
  })

  it('does not repel entities bound by a distance constraint', () => {
    const hexes = makeHexes(200)
    const a = makeEntity('rel-a', 'Port', ['m1'])
    const b = makeEntity('rel-b', 'Outpost', ['m2'])
    a.relationships = [{
      id: 'r1', fromEntityId: 'rel-a', toEntityId: 'rel-b',
      distanceConstraint: { min: 0, max: 2 }, distanceIsHard: true,
    }]
    const result = solve({ batchEntities: [a, b], hexes, worldParams: {} })
    expect(result.success).toBe(true)
    const dist = hexDistance(hexes[result.placements['rel-a']], hexes[result.placements['rel-b']])
    expect(dist).toBeLessThanOrEqual(2)
  })

  it('is deterministic — identical input gives identical placements', () => {
    const entities = ['m1', 'm2', 'm3'].map((m, i) => makeEntity(`ent-${m}`, `Site ${i}`, [m]))
    const r1 = solve({ batchEntities: entities, hexes: makeHexes(200), worldParams: {} })
    const r2 = solve({ batchEntities: entities, hexes: makeHexes(200), worldParams: {} })
    expect(r1.placements).toEqual(r2.placements)
  })
})
