import { describe, it, expect } from 'vitest'
import { validateBiomeAdjacency, applyBiomeAdjacency, terrainForBiome } from './biomeRules.js'

describe('validateBiomeAdjacency', () => {
  it('rejects incompatible biomes at weirdness 0', () => {
    expect(validateBiomeAdjacency('cold', 'tropical', 0)).toBe(false)
    expect(validateBiomeAdjacency('arid', 'cold', 0)).toBe(false)
  })

  it('accepts compatible biomes at weirdness 0', () => {
    expect(validateBiomeAdjacency('temperate', 'coastal', 0)).toBe(true)
    expect(validateBiomeAdjacency('cold', 'temperate', 0)).toBe(true)
  })

  it('allows anything at weirdness 10', () => {
    expect(validateBiomeAdjacency('cold', 'tropical', 10)).toBe(true)
    expect(validateBiomeAdjacency('planar', 'temperate', 10)).toBe(true)
  })

  it('loosens gradually with weirdness', () => {
    // cold–tropical scores 0.2; threshold reaches 0.2 at weirdness 6
    expect(validateBiomeAdjacency('cold', 'tropical', 5)).toBe(false)
    expect(validateBiomeAdjacency('cold', 'tropical', 6)).toBe(true)
  })
})

describe('terrainForBiome', () => {
  it('maps each fill biome to a plausible terrain', () => {
    expect(terrainForBiome('arid')).toBe('desert')
    expect(['tundra', 'mountains']).toContain(terrainForBiome('cold', 0.9))
    expect(['forest', 'hills', 'plains']).toContain(terrainForBiome('temperate', 0.1))
  })
})

// Three hexes in a row on r=0: '0,0' and '2,0' both neighbor '1,0'
function rowOfThree(biomes, terrains) {
  const hexes = {}
  biomes.forEach((biome, i) => {
    hexes[`${i},0`] = { id: `${i},0`, q: i, r: 0, biome, terrain: terrains[i] }
  })
  return hexes
}

describe('applyBiomeAdjacency', () => {
  it('assimilates the minority hex into its neighbor biome at weirdness 0', () => {
    const hexes = rowOfThree(['cold', 'arid', 'cold'], ['tundra', 'desert', 'tundra'])
    const patches = applyBiomeAdjacency(hexes, 0)
    expect(patches['1,0']).toBeDefined()
    expect(patches['1,0'].biome).toBe('cold')
    expect(['tundra', 'mountains']).toContain(patches['1,0'].terrain)
    expect(patches['0,0']).toBeUndefined()
    expect(patches['2,0']).toBeUndefined()
  })

  it('keeps rule-breaking pairs at high weirdness but flags them as anomalies', () => {
    const hexes = rowOfThree(['tropical', 'cold'], ['swamp', 'tundra'])
    const patches = applyBiomeAdjacency(hexes, 10)
    expect(patches['0,0']?.anomaly).toBe(true)
    expect(patches['1,0']?.anomaly).toBe(true)
    expect(patches['0,0']?.biome).toBeUndefined() // biomes untouched
    expect(patches['1,0']?.biome).toBeUndefined()
  })

  it('does nothing for compatible neighbors', () => {
    const hexes = rowOfThree(['temperate', 'temperate', 'cold'], ['plains', 'forest', 'tundra'])
    expect(applyBiomeAdjacency(hexes, 0)).toEqual({})
  })

  it('never rewrites ocean or coast hexes', () => {
    const hexes = rowOfThree(['coastal', 'arid'], ['ocean', 'desert'])
    expect(applyBiomeAdjacency(hexes, 0)).toEqual({})
  })
})
