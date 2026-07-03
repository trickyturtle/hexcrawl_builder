import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'

export const useModuleStore = create((set, get) => ({
  modules: {},
  batches: [],
  pendingBatch: [],   // module IDs staged for next commit

  addModule: (moduleProfile) => {
    const id = uuidv4()
    const mod = { ...moduleProfile, id, entities: moduleProfile.entities ?? [] }
    set((s) => ({ modules: { ...s.modules, [id]: mod } }))
    return id
  },

  updateModule: (id, patch) =>
    set((s) => ({ modules: { ...s.modules, [id]: { ...s.modules[id], ...patch } } })),

  removeModule: (id) =>
    set((s) => {
      const next = { ...s.modules }
      delete next[id]
      return {
        modules: next,
        pendingBatch: s.pendingBatch.filter((x) => x !== id),
      }
    }),

  stageForBatch: (id) =>
    set((s) =>
      s.pendingBatch.includes(id)
        ? s
        : { pendingBatch: [...s.pendingBatch, id] }
    ),

  unstageFromBatch: (id) =>
    set((s) => ({ pendingBatch: s.pendingBatch.filter((x) => x !== id) })),

  // record: what the commit actually did, so revert can unwind it exactly —
  // { placements: {entityId: hexId}, routeIds: [], addedHexIds: [],
  //   hexPatches: {hexId: priorValues}, mapCreated: bool }
  commitBatch: (record = {}) => {
    const ids = get().pendingBatch
    if (!ids.length) return null
    const batch = {
      id: uuidv4(),
      moduleIds: ids,
      committedAt: new Date().toISOString(),
      placements: {},
      routeIds: [],
      addedHexIds: [],
      hexPatches: {},
      mapCreated: false,
      ...record,
    }
    set((s) => ({ batches: [...s.batches, batch], pendingBatch: [] }))
    return batch
  },

  // Removes the batch record only. Module profiles are kept — they return to
  // the uncommitted state so the user can adjust constraints and re-commit
  // without retyping anything. Map-side unwinding (placements, routes, hexes)
  // is the caller's job via applyBatchRevert.
  revertLastBatch: () => {
    const { batches } = get()
    if (!batches.length) return null
    const last = batches[batches.length - 1]
    set({ batches: batches.slice(0, -1) })
    return last
  },

  // Add an entity ID to a module's entities list
  addEntityToModule: (moduleId, entityId) =>
    set((s) => {
      const mod = s.modules[moduleId]
      if (!mod) return s
      if (mod.entities.includes(entityId)) return s
      return {
        modules: {
          ...s.modules,
          [moduleId]: { ...mod, entities: [...mod.entities, entityId] },
        },
      }
    }),

  removeEntityFromModule: (moduleId, entityId) =>
    set((s) => {
      const mod = s.modules[moduleId]
      if (!mod) return s
      return {
        modules: {
          ...s.modules,
          [moduleId]: { ...mod, entities: mod.entities.filter((id) => id !== entityId) },
        },
      }
    }),

  // Import a module from an external library, preserving its existing ID.
  // Returns the id if imported, null if it already existed (skip).
  importModule: (moduleProfile) => {
    const id = moduleProfile.id
    if (!id) return null
    if (get().modules[id]) return null
    set((s) => ({
      modules: {
        ...s.modules,
        [id]: { ...moduleProfile, entities: moduleProfile.entities ?? [] },
      },
    }))
    return id
  },

  hydrate: ({ modules, batches }) =>
    set({ modules: modules ?? {}, batches: batches ?? [], pendingBatch: [] }),
}))
