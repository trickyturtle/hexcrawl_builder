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

  it('terraforms a hex for temperate mountains when none exist on the map', () => {
    // arid map — guaranteed to contain no temperate mountains
    const { hexes: arr } = generateHexes({ hexCount: 200, mapShape: 'rectangle', biomeDistribution: { arid: 100 } })
    const hexes = {}
    for (const h of arr) hexes[h.id] = h
    expect(Object.values(hexes).some((h) => h.biome === 'temperate' && h.elevation === 'mountain')).toBe(false)

    const entity = makeEntity({
      name: 'Mountain Monastery',
      locationRequirements: {
        terrainAffinity: [], proximityRequirements: [],
        biomeRequirements: ['temperate'], elevationRequirements: ['mountain'],
      },
    })
    const result = solve({ batchEntities: [entity], hexes, worldParams: {} })
    expect(result.success).toBe(true)
    const hexId = result.placements[entity.id]
    expect(hexId).toBeDefined()
    expect(result.terraformed[hexId]).toMatchObject({
      terrain: 'mountains', biome: 'temperate', elevation: 'mountain',
    })
  })

  it('does NOT terraform coastal/underground/planar (still a conflict)', () => {
    const hexes = makeHexes()
    for (const biome of ['coastal', 'underground', 'planar']) {
      const entity = makeEntity({
        name: `${biome} site`,
        locationRequirements: {
          terrainAffinity: [], elevationRequirements: [], proximityRequirements: [],
          biomeRequirements: [biome],
        },
      })
      const result = solve({ batchEntities: [entity], hexes, worldParams: {} })
      // coastal may exist naturally; only assert un-terraformable biomes that don't
      if (!Object.values(hexes).some((h) => h.biome === biome)) {
        expect(result.success).toBe(false)
        expect(result.placements[entity.id]).toBeUndefined()
      }
    }
  })

  it('grows contiguous land footprints for multi-hex locations', () => {
    const hexes = makeHexes(200)
    const entity = makeEntity({ name: 'Sprawling Ruin', hexFootprint: 4 })
    const result = solve({ batchEntities: [entity], hexes, worldParams: {} })
    expect(result.success).toBe(true)

    const span = result.footprints[entity.id]
    expect(span).toHaveLength(4)
    expect(span[0]).toBe(result.placements[entity.id]) // primary first
    for (const hid of span) expect(hexes[hid].terrain).not.toBe('ocean')
    // contiguity: every hex is within 1 of some other hex in the span
    for (const hid of span) {
      const h = hexes[hid]
      const near = span.some((other) => {
        if (other === hid) return false
        const o = hexes[other]
        const dq = h.q - o.q, dr = h.r - o.r
        return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2 === 1
      })
      expect(near).toBe(true)
    }
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
