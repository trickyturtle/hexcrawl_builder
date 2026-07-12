import { describe, it, expect } from 'vitest'
import { inferSpatialConstraints, inferModuleDistanceConstraints, inferModuleRelationshipConstraints } from './spatialInference.js'

describe('inferModuleRelationshipConstraints', () => {
  const allModules = {
    'mod-a': { id: 'mod-a', name: 'A', entryPoints: ['ent-a1'], entities: ['ent-a1', 'ent-a2'], moduleRelationships: ['mod-b'] },
    'mod-b': { id: 'mod-b', name: 'B', entryPoints: [], entities: ['ent-b1'], moduleRelationships: ['mod-a'] },
  }

  it('links entry points (or first entities) with a soft proximity constraint', () => {
    const constraints = inferModuleRelationshipConstraints([allModules['mod-a']], allModules)
    expect(constraints).toHaveLength(1)
    expect(constraints[0]).toMatchObject({
      fromEntityId: 'ent-a1', // A's entry point
      toEntityId: 'ent-b1',   // B has no entry points → first entity
      isHard: false,
      maxHexes: 8,
    })
  })

  it('deduplicates reciprocal module relationships', () => {
    const constraints = inferModuleRelationshipConstraints(
      [allModules['mod-a'], allModules['mod-b']], allModules,
    )
    expect(constraints).toHaveLength(1)
  })

  it('ignores relationships to unknown modules', () => {
    const lonely = { id: 'mod-x', entities: ['e'], moduleRelationships: ['missing'] }
    expect(inferModuleRelationshipConstraints([lonely], allModules)).toHaveLength(0)
  })
})

describe('inferSpatialConstraints', () => {
  it('reads schema field names min/max on distanceConstraint', () => {
    const [c] = inferSpatialConstraints([{
      fromEntityId: 'a', toEntityId: 'b',
      distanceConstraint: { min: 2, max: 6, unit: 'hexes' },
      distanceIsHard: true,
    }])
    expect(c).toMatchObject({ minHexes: 2, maxHexes: 6, isHard: true })
  })

  it('accepts legacy minHexes/maxHexes field names', () => {
    const [c] = inferSpatialConstraints([{
      fromEntityId: 'a', toEntityId: 'b',
      distanceConstraint: { minHexes: 1, maxHexes: 4 },
    }])
    expect(c).toMatchObject({ minHexes: 1, maxHexes: 4, isHard: false })
  })

  it('defaults an unbounded constraint to 0..Infinity', () => {
    const [c] = inferSpatialConstraints([{
      fromEntityId: 'a', toEntityId: 'b', distanceConstraint: {},
    }])
    expect(c.minHexes).toBe(0)
    expect(c.maxHexes).toBe(Infinity)
  })

  it('derives a soft within-10 constraint from impliesSpatialAccess', () => {
    const [c] = inferSpatialConstraints([{
      fromEntityId: 'a', toEntityId: 'b', impliesSpatialAccess: true,
    }])
    expect(c).toMatchObject({ minHexes: 0, maxHexes: 10, isHard: false })
  })

  it('skips relationships missing endpoints', () => {
    expect(inferSpatialConstraints([{ fromEntityId: 'a', impliesSpatialAccess: true }]))
      .toHaveLength(0)
  })
})

describe('inferModuleDistanceConstraints', () => {
  const entities = [
    { id: 'city-1', name: 'Dark Elf City' },
    { id: 'dun-1', name: 'The Dungeon' },
  ]
  const worldParams = {
    hexSizeMiles: 6,
    travelSpeedAssumptions: { crossCountry: 18 },
  }
  const mod = (explicitDistances) => ({ name: 'Test Mod', explicitDistances })

  it('converts miles to hexes with ±25% tolerance (min ±1)', () => {
    const { constraints, warnings } = inferModuleDistanceConstraints(
      [mod([{ fromLabel: 'Dark Elf City', toLabel: 'The Dungeon', distance: 12, unit: 'miles' }])],
      entities, worldParams,
    )
    expect(warnings).toHaveLength(0)
    expect(constraints).toHaveLength(1)
    // 12 mi / 6 mi-per-hex = 2 hexes, tolerance 1
    expect(constraints[0]).toMatchObject({
      fromEntityId: 'city-1', toEntityId: 'dun-1', minHexes: 1, maxHexes: 3, isHard: true,
    })
  })

  it('converts days via cross-country travel speed', () => {
    const { constraints } = inferModuleDistanceConstraints(
      [mod([{ fromLabel: 'The Dungeon', toLabel: 'Dark Elf City', distance: 2, unit: 'days' }])],
      entities, worldParams,
    )
    // 2 days × 18 mi/day ÷ 6 mi/hex = 6 hexes, tolerance 2
    expect(constraints[0]).toMatchObject({ minHexes: 4, maxHexes: 8 })
  })

  it('passes hex distances through directly', () => {
    const { constraints } = inferModuleDistanceConstraints(
      [mod([{ fromLabel: 'Dark Elf City', toLabel: 'The Dungeon', distance: 4, unit: 'hexes' }])],
      entities, worldParams,
    )
    expect(constraints[0]).toMatchObject({ minHexes: 3, maxHexes: 5 })
  })

  it('matches labels case-insensitively', () => {
    const { constraints } = inferModuleDistanceConstraints(
      [mod([{ fromLabel: 'dark elf city', toLabel: 'THE DUNGEON', distance: 4, unit: 'hexes' }])],
      entities, worldParams,
    )
    expect(constraints).toHaveLength(1)
  })

  it('warns (not silently drops) when a label matches no batch entity', () => {
    const { constraints, warnings } = inferModuleDistanceConstraints(
      [mod([{ fromLabel: 'Nowhere Keep', toLabel: 'The Dungeon', distance: 4, unit: 'hexes' }])],
      entities, worldParams,
    )
    expect(constraints).toHaveLength(0)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('Nowhere Keep')
  })

  it('skips incomplete rows without warning', () => {
    const { constraints, warnings } = inferModuleDistanceConstraints(
      [mod([{ fromLabel: '', toLabel: 'The Dungeon', distance: '', unit: 'miles' }])],
      entities, worldParams,
    )
    expect(constraints).toHaveLength(0)
    expect(warnings).toHaveLength(0)
  })

  it('falls back to OSR defaults when world params are missing', () => {
    const { constraints } = inferModuleDistanceConstraints(
      [mod([{ fromLabel: 'Dark Elf City', toLabel: 'The Dungeon', distance: 1, unit: 'days' }])],
      entities, {},
    )
    // 18 mi/day ÷ 6 mi/hex = 3 hexes, tolerance 1
    expect(constraints[0]).toMatchObject({ minHexes: 2, maxHexes: 4 })
  })
})
