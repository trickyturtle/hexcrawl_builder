import { describe, it, expect } from 'vitest'
import { inferSpatialConstraints } from './spatialInference.js'

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
