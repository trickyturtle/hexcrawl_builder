import { describe, it, expect } from 'vitest'
import { solve } from './constraintSolver.js'
import { generateHexes } from '../generator/terrainGenerator.js'

function makeHexes(count = 60) {
  const { hexes } = generateHexes({ hexCount: count })
  const byId = {}
  for (const h of hexes) byId[h.id] = h
  return byId
}

function makeEntity(fields = {}) {
  return {
    id: fields.id ?? crypto.randomUUID(),
    name: fields.name ?? 'Test Entity',
    subclass: 'Location',
    sources: [],
    relationships: [],
    locationRequirements: {
      terrainAffinity: [],
      biomeRequirements: [],
      elevationRequirements: [],
      proximityRequirements: [],
    },
    tags: [],
    ...fields,
  }
}

describe('solve', () => {
  it('returns success with no entities', () => {
    const result = solve({ batchEntities: [], hexes: makeHexes(), worldParams: {} })
    expect(result.success).toBe(true)
    expect(result.placements).toEqual({})
  })

  it('places an unconstrained entity on a land hex', () => {
    const hexes = makeHexes()
    const entity = makeEntity()
    const result = solve({ batchEntities: [entity], hexes, worldParams: {} })
    expect(result.success).toBe(true)
    const hex = hexes[result.placements[entity.id]]
    expect(hex).toBeDefined()
    expect(hex.terrain).not.toBe('ocean')
  })

  it('respects hard biome requirements', () => {
    const hexes = makeHexes(200)
    const entity = makeEntity({
      locationRequirements: {
        terrainAffinity: [], elevationRequirements: [], proximityRequirements: [],
        biomeRequirements: ['arid'],
      },
    })
    const result = solve({ batchEntities: [entity], hexes, worldParams: {} })
    expect(result.success).toBe(true)
    expect(hexes[result.placements[entity.id]].biome).toBe('arid')
  })

  it('reports a conflict (not a placement) when a biome does not exist on the map', () => {
    const hexes = makeHexes()
    const entity = makeEntity({
      name: 'Planar Gate',
      locationRequirements: {
        terrainAffinity: [], elevationRequirements: [], proximityRequirements: [],
        biomeRequirements: ['planar'],
      },
    })
    const result = solve({ batchEntities: [entity], hexes, worldParams: {} })
    expect(result.success).toBe(false)
    expect(result.placements[entity.id]).toBeUndefined()
    expect(result.conflicts).toHaveLength(1)
    expect(result.conflicts[0].entityName).toBe('Planar Gate')
    expect(result.conflicts[0].reason).toContain('planar')
  })

  it('honors hard proximity requirements written with the schema field name entityId', () => {
    const hexes = makeHexes(200)
    const anchor = makeEntity({ name: 'Anchor' })
    // Pre-place the anchor on a known land hex
    const landHexId = Object.values(hexes).find((h) => h.terrain !== 'ocean').id
    const dependent = makeEntity({
      name: 'Dependent',
      locationRequirements: {
        terrainAffinity: [], biomeRequirements: [], elevationRequirements: [],
        proximityRequirements: [{ entityId: anchor.id, minHexes: 0, maxHexes: 2, isHard: true }],
      },
    })
    const result = solve({
      batchEntities: [dependent],
      hexes,
      placedEntityHexes: { [anchor.id]: landHexId },
      worldParams: {},
    })
    expect(result.success).toBe(true)
    const placedHex = hexes[result.placements[dependent.id]]
    const anchorHex = hexes[landHexId]
    const dq = placedHex.q - anchorHex.q
    const dr = placedHex.r - anchorHex.r
    const dist = (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2
    expect(dist).toBeLessThanOrEqual(2)
  })

  it('enforces hard relationship distance constraints between batch entities', () => {
    const hexes = makeHexes(200)
    const a = makeEntity({ name: 'A' })
    const b = makeEntity({ name: 'B' })
    a.relationships = [{
      id: 'r1', fromEntityId: a.id, toEntityId: b.id,
      distanceConstraint: { min: 0, max: 3 }, distanceIsHard: true,
    }]
    const result = solve({ batchEntities: [a, b], hexes, worldParams: {} })
    expect(result.success).toBe(true)
    const ha = hexes[result.placements[a.id]]
    const hb = hexes[result.placements[b.id]]
    const dq = ha.q - hb.q
    const dr = ha.r - hb.r
    const dist = (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2
    expect(dist).toBeLessThanOrEqual(3)
  })
})
