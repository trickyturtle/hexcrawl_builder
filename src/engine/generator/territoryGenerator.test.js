import { describe, it, expect } from 'vitest'
import { generateTerritories } from './territoryGenerator.js'
import { generateHexes } from './terrainGenerator.js'
import { hexDistance } from './hexGrid.js'

function makeMap(count = 300) {
  const { hexes } = generateHexes({ hexCount: count, mapShape: 'rectangle' })
  const byId = {}
  for (const h of hexes) byId[h.id] = h
  return byId
}

function makeFaction(id, hexes, homeHexId, fields = {}) {
  hexes[homeHexId] = { ...hexes[homeHexId], entityIds: [...(hexes[homeHexId].entityIds ?? []), id] }
  return {
    id, name: id, subclass: 'Faction',
    territoryTendency: 'concentrated', territorySize: 'medium',
    relationships: [], ...fields,
  }
}

const applied = (hexes, patches) => {
  const next = {}
  for (const [hid, h] of Object.entries(hexes)) next[hid] = { ...h, ...(patches[hid] ?? {}) }
  return next
}

describe('generateTerritories — factions', () => {
  it('grows contiguous territory around a concentrated faction home', () => {
    const hexes = makeMap()
    const faction = makeFaction('fac-1', hexes, '5,5')
    const patches = generateTerritories(hexes, { 'fac-1': faction }, [], { politicalFragmentation: 'fragmented' })
    const map = applied(hexes, patches)
    const held = Object.values(map).filter((h) => (h.factionIds ?? []).includes('fac-1'))
    expect(held.length).toBeGreaterThan(5)
    // includes the home hex and stays within reach
    expect(map['5,5'].factionIds).toContain('fac-1')
    const home = hexes['5,5']
    for (const h of held) expect(hexDistance(h, home)).toBeLessThanOrEqual(5)
  })

  it('territory scales with politicalFragmentation', () => {
    const count = (frag) => {
      const hexes = makeMap()
      const faction = makeFaction('fac-1', hexes, '5,5')
      const patches = generateTerritories(hexes, { 'fac-1': faction }, [], { politicalFragmentation: frag })
      return Object.values(patches).filter((p) => p.factionIds?.includes('fac-1')).length
    }
    expect(count('tribal')).toBeLessThan(count('fragmented'))
    expect(count('fragmented')).toBeLessThan(count('unified'))
  })

  it("'none' fragmentation generates no polities", () => {
    const hexes = makeMap()
    const faction = makeFaction('fac-1', hexes, '5,5')
    const patches = generateTerritories(hexes, { 'fac-1': faction }, [], { politicalFragmentation: 'none' })
    expect(Object.values(patches).some((p) => p.factionIds?.length)).toBe(false)
  })

  it('diffuse tendency scatters presence with gaps', () => {
    const hexes = makeMap()
    const faction = makeFaction('fac-1', hexes, '8,5', { territoryTendency: 'diffuse' })
    const patches = generateTerritories(hexes, { 'fac-1': faction }, [], { politicalFragmentation: 'fragmented' })
    const map = applied(hexes, patches)
    const home = hexes['8,5']
    const withinReach = Object.values(map).filter((h) =>
      h.terrain !== 'ocean' && hexDistance(h, home) <= 4
    )
    const held = withinReach.filter((h) => (h.factionIds ?? []).includes('fac-1'))
    expect(held.length).toBeGreaterThan(0)
    expect(held.length).toBeLessThan(withinReach.length) // gaps exist
  })

  it('uses the homeBaseEntityId location when set', () => {
    const hexes = makeMap()
    // home base location placed at 10,6; faction entity itself placed at 2,2
    hexes['10,6'] = { ...hexes['10,6'], entityIds: ['loc-hb'] }
    const faction = makeFaction('fac-1', hexes, '2,2', { homeBaseEntityId: 'loc-hb' })
    const patches = generateTerritories(hexes, { 'fac-1': faction }, [], { politicalFragmentation: 'tribal' })
    const map = applied(hexes, patches)
    expect(map['10,6'].factionIds).toContain('fac-1')
  })

  it('never claims ocean hexes', () => {
    const { hexes: arr } = generateHexes({ hexCount: 300, mapShape: 'island' })
    const hexes = {}
    for (const h of arr) hexes[h.id] = h
    const land = arr.find((h) => h.terrain !== 'ocean' && h.terrain !== 'coast')
    const faction = makeFaction('fac-1', hexes, land.id, { territorySize: 'large' })
    const patches = generateTerritories(hexes, { 'fac-1': faction }, [], { politicalFragmentation: 'unified' })
    const map = applied(hexes, patches)
    for (const h of Object.values(map)) {
      if (h.terrain === 'ocean') expect(h.factionIds ?? []).toHaveLength(0)
    }
  })
})

describe('generateTerritories — nations', () => {
  it('nations are exclusive: contested hexes go to the nearest home', () => {
    const hexes = makeMap()
    const a = makeFaction('nat-a', hexes, '5,5', { subclass: 'Nation' })
    const b = makeFaction('nat-b', hexes, '9,5', { subclass: 'Nation' })
    const patches = generateTerritories(hexes, { 'nat-a': a, 'nat-b': b }, [], { politicalFragmentation: 'unified' })
    const map = applied(hexes, patches)
    for (const h of Object.values(map)) {
      const nations = (h.factionIds ?? []).filter((id) => id.startsWith('nat-'))
      expect(nations.length).toBeLessThanOrEqual(1)
    }
    // both still hold their own homes
    expect(map['5,5'].factionIds).toContain('nat-a')
    expect(map['9,5'].factionIds).toContain('nat-b')
  })

  it('plain factions may overlap each other', () => {
    const hexes = makeMap()
    const a = makeFaction('fac-a', hexes, '6,5')
    const b = makeFaction('fac-b', hexes, '7,5')
    const patches = generateTerritories(hexes, { 'fac-a': a, 'fac-b': b }, [], { politicalFragmentation: 'fragmented' })
    const map = applied(hexes, patches)
    const overlap = Object.values(map).some((h) =>
      (h.factionIds ?? []).includes('fac-a') && (h.factionIds ?? []).includes('fac-b')
    )
    expect(overlap).toBe(true)
  })
})

describe('generateTerritories — religions', () => {
  it('spreads from hexes of related entities', () => {
    const hexes = makeMap()
    hexes['4,4'] = { ...hexes['4,4'], entityIds: ['temple-1'] }
    const religion = {
      id: 'rel-1', name: 'The Flame', subclass: 'Religion',
      relationships: [{ id: 'r1', fromEntityId: 'rel-1', toEntityId: 'temple-1' }],
    }
    const patches = generateTerritories(hexes, { 'rel-1': religion }, [], { politicalFragmentation: 'none' })
    const map = applied(hexes, patches)
    expect(map['4,4'].religionIds).toContain('rel-1')
    const present = Object.values(map).filter((h) => (h.religionIds ?? []).includes('rel-1'))
    expect(present.length).toBeGreaterThan(1) // spread beyond the seed
  })

  it('travels along trade routes touching its seeds', () => {
    const hexes = makeMap()
    hexes['3,3'] = { ...hexes['3,3'], entityIds: ['rel-1'] } // religion's own placement
    const religion = { id: 'rel-1', name: 'The Tide', subclass: 'Religion', relationships: [] }
    const route = { id: 'route-1', path: ['3,3', '5,3', '7,3', '9,3', '11,3'] }
    const patches = generateTerritories(hexes, { 'rel-1': religion }, [route], { politicalFragmentation: 'none' })
    const map = applied(hexes, patches)
    // far end of the route, well beyond the 3-hex local spread
    expect(map['11,3'].religionIds).toContain('rel-1')
  })
})

describe('generateTerritories — diffs and determinism', () => {
  it('emits patches only for hexes that changed', () => {
    const hexes = makeMap()
    const faction = makeFaction('fac-1', hexes, '5,5')
    const patches = generateTerritories(hexes, { 'fac-1': faction }, [], { politicalFragmentation: 'tribal' })
    const map = applied(hexes, patches)
    // re-running on the applied state changes nothing
    const again = generateTerritories(map, { 'fac-1': faction }, [], { politicalFragmentation: 'tribal' })
    expect(Object.keys(again)).toHaveLength(0)
  })

  it('clears territory when a faction disappears', () => {
    const hexes = makeMap()
    const faction = makeFaction('fac-1', hexes, '5,5')
    const map = applied(hexes, generateTerritories(hexes, { 'fac-1': faction }, [], { politicalFragmentation: 'tribal' }))
    // faction deleted → recompute with no entities
    const patches = generateTerritories(map, {}, [], { politicalFragmentation: 'tribal' })
    const cleared = applied(map, patches)
    expect(Object.values(cleared).every((h) => (h.factionIds ?? []).length === 0)).toBe(true)
  })
})
