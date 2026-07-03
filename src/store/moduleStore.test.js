import { describe, it, expect, beforeEach } from 'vitest'
import { useModuleStore } from './moduleStore.js'

const reset = () => useModuleStore.getState().hydrate({ modules: {}, batches: [] })

describe('moduleStore batches', () => {
  beforeEach(reset)

  it('commitBatch stores the commit record alongside module ids', () => {
    const s = useModuleStore.getState()
    const modId = s.addModule({ name: 'Mod A' })
    s.stageForBatch(modId)

    const batch = useModuleStore.getState().commitBatch({
      placements: { 'ent-1': '0,0' },
      routeIds: ['r1'],
      addedHexIds: ['5,5'],
      hexPatches: { '1,1': { terrain: 'plains' } },
      mapCreated: true,
    })

    expect(batch.moduleIds).toEqual([modId])
    expect(batch.placements).toEqual({ 'ent-1': '0,0' })
    expect(batch.routeIds).toEqual(['r1'])
    expect(batch.addedHexIds).toEqual(['5,5'])
    expect(batch.mapCreated).toBe(true)
    expect(useModuleStore.getState().pendingBatch).toEqual([])
  })

  it('commitBatch defaults record fields for a bare call', () => {
    const s = useModuleStore.getState()
    const modId = s.addModule({ name: 'Mod A' })
    s.stageForBatch(modId)
    const batch = useModuleStore.getState().commitBatch()
    expect(batch.placements).toEqual({})
    expect(batch.routeIds).toEqual([])
    expect(batch.mapCreated).toBe(false)
  })

  it('commitBatch with nothing staged is a no-op', () => {
    expect(useModuleStore.getState().commitBatch()).toBeNull()
  })

  it('revertLastBatch removes the batch but keeps module profiles', () => {
    const s = useModuleStore.getState()
    const modId = s.addModule({ name: 'Keeper' })
    s.stageForBatch(modId)
    useModuleStore.getState().commitBatch()

    const reverted = useModuleStore.getState().revertLastBatch()
    expect(reverted.moduleIds).toEqual([modId])

    const after = useModuleStore.getState()
    expect(after.batches).toHaveLength(0)
    expect(after.modules[modId]).toBeDefined() // profile survives revert
    expect(after.modules[modId].name).toBe('Keeper')
  })

  it('revertLastBatch on empty history returns null', () => {
    expect(useModuleStore.getState().revertLastBatch()).toBeNull()
  })
})
