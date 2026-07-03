import { create } from 'zustand'

export const useEntityStore = create((set) => ({
  entities: {},

  addEntity: (entity) =>
    set((s) => ({ entities: { ...s.entities, [entity.id]: entity } })),

  updateEntity: (id, patch) =>
    set((s) => ({
      entities: { ...s.entities, [id]: { ...s.entities[id], ...patch } },
    })),

  removeEntity: (id) =>
    set((s) => {
      const next = { ...s.entities }
      delete next[id]
      return { entities: next }
    }),

  addEntities: (entityArray) =>
    set((s) => {
      const next = { ...s.entities }
      for (const e of entityArray) next[e.id] = e
      return { entities: next }
    }),

  // Import entities from an external library, skipping any that already exist
  // so user edits are never overwritten.
  importEntities: (entityArray) =>
    set((s) => {
      const next = { ...s.entities }
      for (const e of entityArray) {
        if (!next[e.id]) next[e.id] = e
      }
      return { entities: next }
    }),

  hydrate: (entities) => set({ entities }),
}))
