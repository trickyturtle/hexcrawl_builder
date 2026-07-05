import { describe, it, expect } from 'vitest'
import { applyBatchRevert } from './batchRevert.js'

const hex = (id, fields = {}) => {
  const [q, r] = id.split(',').map(Number)
  return { id, q, r, terrain: 'plains', biome: 'temperate', entityIds: [], ...fields }
}

describe('applyBatchRevert — recorded batches', () => {
  const batch = {
    id: 'b1',
    moduleIds: ['m1'],
    placements: { 'ent-a': '0,0', 'ent-b': '1,0' },
    routeIds: ['route-1'],
    addedHexIds: ['2,0', '3,0'],
    hexPatches: { '1,0': { terrain: 'plains', biome: 'temperate' } },
  }

  const makeState = () => ({
    hexes: {
      '0,0': hex('0,0', { entityIds: ['ent-a'] }),
      '1,0': hex('1,0', { entityIds: ['ent-b'], terrain: 'coast', biome: 'coastal' }),
      '2,0': hex('2,0'), // added by the commit, empty
      '3,0': hex('3,0', { entityIds: ['manual-ent'] }), // added, but user placed something
    },
    routes: [
      { id: 'route-1', entityPairIds: ['ent-a', 'ent-b'] },
      { id: 'route-2', entityPairIds: ['other-x', 'other-y'] },
    ],
  })

  it('removes exactly the recorded placements', () => {
    const { hexes } = applyBatchRevert(batch, makeState().hexes, [])
    expect(hexes['0,0'].entityIds).toEqual([])
    expect(hexes['1,0'].entityIds).toEqual([])
  })

  it('restores patched hex fields to their pre-commit values', () => {
    const { hexes } = applyBatchRevert(batch, makeState().hexes, [])
    expect(hexes['1,0'].terrain).toBe('plains')
    expect(hexes['1,0'].biome).toBe('temperate')
  })

  it('removes added hexes unless the user placed something there', () => {
    const { hexes } = applyBatchRevert(batch, makeState().hexes, [])
    expect(hexes['2,0']).toBeUndefined()
    expect(hexes['3,0']).toBeDefined() // kept: manual-ent lives there
  })

  it('removes only the recorded routes', () => {
    const s = makeState()
    const { routes } = applyBatchRevert(batch, s.hexes, s.routes)
    expect(routes.map((r) => r.id)).toEqual(['route-2'])
  })

  it('leaves manual placements made after the commit alone', () => {
    const s = makeState()
    s.hexes['0,0'] = { ...s.hexes['0,0'], entityIds: ['ent-a', 'user-added'] }
    const { hexes } = applyBatchRevert(batch, s.hexes, [])
    expect(hexes['0,0'].entityIds).toEqual(['user-added'])
  })

  it('tolerates placements pointing at hexes that no longer exist', () => {
    const stale = { ...batch, placements: { 'ent-a': '99,99' } }
    expect(() => applyBatchRevert(stale, makeState().hexes, [])).not.toThrow()
  })

  it('does not mutate its inputs', () => {
    const s = makeState()
    const hexesBefore = JSON.stringify(s.hexes)
    const routesBefore = JSON.stringify(s.routes)
    applyBatchRevert(batch, s.hexes, s.routes)
    expect(JSON.stringify(s.hexes)).toBe(hexesBefore)
    expect(JSON.stringify(s.routes)).toBe(routesBefore)
  })
})

describe('applyBatchRevert — legacy batches (no record)', () => {
  const legacyBatch = { id: 'b0', moduleIds: ['m1'] } // pre-record save file

  const modules = { m1: { id: 'm1', entities: ['ent-a'] } }
  const entities = {
    'ent-a': { id: 'ent-a', sources: ['m1'] },
    'ent-b': { id: 'ent-b', sources: ['m1'] }, // linked by source only
    'ent-c': { id: 'ent-c', sources: ['other'] },
  }

  it('falls back to module membership for un-placement', () => {
    const hexes = {
      '0,0': hex('0,0', { entityIds: ['ent-a', 'ent-c'] }),
      '1,0': hex('1,0', { entityIds: ['ent-b'] }),
    }
    const { hexes: next } = applyBatchRevert(legacyBatch, hexes, [], { modules, entities })
    expect(next['0,0'].entityIds).toEqual(['ent-c'])
    expect(next['1,0'].entityIds).toEqual([])
  })

  it('removes routes by entity-pair membership', () => {
    const routes = [
      { id: 'r1', entityPairIds: ['ent-a', 'ent-b'] },
      { id: 'r2', entityPairIds: ['ent-c', 'other-z'] },
    ]
    const { routes: next } = applyBatchRevert(legacyBatch, {}, routes, { modules, entities })
    expect(next.map((r) => r.id)).toEqual(['r2'])
  })
})
