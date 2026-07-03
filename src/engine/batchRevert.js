// Unwind a committed module batch from map state, using the record captured at
// commit time (placements, routeIds, addedHexIds, hexPatches). Batches saved by
// older versions carry no record; for those we fall back to deriving the batch's
// entities from module membership.
//
// Pure: returns { hexes, routes } without mutating the inputs.
export function applyBatchRevert(batch, hexes, routes, { modules = {}, entities = {} } = {}) {
  const next = { ...hexes }
  const recorded = !!batch.placements

  // Legacy batches need the entity set for both un-placement and route removal
  const legacyEntityIds = new Set()
  if (!recorded) {
    for (const modId of batch.moduleIds ?? []) {
      const mod = modules[modId]
      for (const eid of (mod?.entities ?? [])) legacyEntityIds.add(eid)
      for (const [eid, e] of Object.entries(entities)) {
        if (e.sources?.includes(modId)) legacyEntityIds.add(eid)
      }
    }
  }

  // 1. Un-place the batch's entities
  if (recorded) {
    for (const [eid, hid] of Object.entries(batch.placements)) {
      const hex = next[hid]
      if (!hex) continue
      next[hid] = { ...hex, entityIds: (hex.entityIds ?? []).filter((id) => id !== eid) }
    }
  } else {
    for (const [hid, hex] of Object.entries(next)) {
      const filtered = (hex.entityIds ?? []).filter((id) => !legacyEntityIds.has(id))
      if (filtered.length !== (hex.entityIds ?? []).length) {
        next[hid] = { ...hex, entityIds: filtered }
      }
    }
  }

  // 2. Restore hex fields the commit changed (terrain propagation, biome
  //    adjacency smoothing) to their pre-commit values
  for (const [hid, prior] of Object.entries(batch.hexPatches ?? {})) {
    if (next[hid]) next[hid] = { ...next[hid], ...prior }
  }

  // 3. Remove hexes the commit added (map creation or expansion) — unless the
  //    user has since placed something there manually
  for (const hid of (batch.addedHexIds ?? [])) {
    if (next[hid] && (next[hid].entityIds ?? []).length === 0) delete next[hid]
  }

  // 4. Remove the batch's routes
  const nextRoutes = recorded
    ? routes.filter((r) => !(batch.routeIds ?? []).includes(r.id))
    : routes.filter((r) => !(r.entityPairIds ?? []).some((id) => legacyEntityIds.has(id)))

  return { hexes: next, routes: nextRoutes }
}
