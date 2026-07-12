// Convert module explicitDistances ("the city is three days from the dungeon")
// into hard hex-distance constraints between named batch entities, using the
// system preset's hex size and cross-country travel speed (per spec).
// Labels that match no entity in the batch produce warnings, not silent drops.
// Returns { constraints, warnings }.
export function inferModuleDistanceConstraints(modules, batchEntities, worldParams = {}) {
  const constraints = []
  const warnings = []
  if (!modules?.length) return { constraints, warnings }

  const hexSizeMiles = worldParams.hexSizeMiles > 0 ? worldParams.hexSizeMiles : 6
  const crossCountry = worldParams.travelSpeedAssumptions?.crossCountry
  const milesPerDay = crossCountry > 0 ? crossCountry : 18

  const byName = {}
  for (const e of batchEntities) {
    if (e.name) byName[e.name.trim().toLowerCase()] = e
  }

  for (const mod of modules) {
    for (const d of (mod.explicitDistances ?? [])) {
      const dist = Number(d.distance)
      if (!d.fromLabel || !d.toLabel || !(dist > 0)) continue

      const from = byName[d.fromLabel.trim().toLowerCase()]
      const to = byName[d.toLabel.trim().toLowerCase()]
      if (!from || !to || from.id === to.id) {
        const problem = !from ? `no entity named "${d.fromLabel}"`
          : !to ? `no entity named "${d.toLabel}"`
          : 'both labels refer to the same entity'
        warnings.push(
          `${mod.name || 'Module'}: distance "${d.fromLabel} → ${d.toLabel}" skipped — ${problem} in this batch`
        )
        continue
      }

      const hexes =
        d.unit === 'hexes' ? dist :
        d.unit === 'days'  ? (dist * milesPerDay) / hexSizeMiles :
        dist / hexSizeMiles // miles (default)

      // Module text distances are approximate — allow ±25% (at least ±1 hex)
      const center = Math.round(hexes)
      const tolerance = Math.max(1, Math.round(hexes * 0.25))
      constraints.push({
        fromEntityId: from.id,
        toEntityId: to.id,
        minHexes: Math.max(0, center - tolerance),
        maxHexes: center + tolerance,
        isHard: true,
      })
    }
  }

  return { constraints, warnings }
}

// Convert module-to-module relationships into soft proximity constraints
// between the modules' representative entities (first entry point, falling
// back to the module's first entity). Related adventures end up near each
// other without a hard requirement. Works across batches: if the target
// module is already committed, its representative is in placedEntityHexes
// and the constraint anchors the new module to it.
export function inferModuleRelationshipConstraints(batchModules, allModules = {}) {
  const constraints = []
  const seen = new Set()

  const representative = (mod) =>
    mod?.entryPoints?.[0] ?? (mod?.entities ?? [])[0] ?? null

  for (const mod of batchModules) {
    const fromRep = representative(mod)
    if (!fromRep) continue
    for (const raw of (mod.moduleRelationships ?? [])) {
      const targetId = typeof raw === 'string' ? raw : raw?.moduleId
      const target = allModules[targetId]
      const toRep = representative(target)
      if (!toRep || toRep === fromRep) continue

      const pairKey = [fromRep, toRep].sort().join('|')
      if (seen.has(pairKey)) continue
      seen.add(pairKey)

      constraints.push({
        fromEntityId: fromRep,
        toEntityId: toRep,
        minHexes: 0,
        maxHexes: 8,
        isHard: false,
      })
    }
  }
  return constraints
}

// Infer spatial constraints from entity relationship objects.
// Returns an array of { fromEntityId, toEntityId, minHexes, maxHexes, isHard }.
export function inferSpatialConstraints(relationships) {
  const constraints = []

  for (const rel of relationships) {
    if (!rel.fromEntityId || !rel.toEntityId) continue

    if (rel.distanceConstraint) {
      // Schema field names are min/max (unit: hexes); minHexes/maxHexes accepted too
      constraints.push({
        fromEntityId: rel.fromEntityId,
        toEntityId: rel.toEntityId,
        minHexes: rel.distanceConstraint.min ?? rel.distanceConstraint.minHexes ?? 0,
        maxHexes: rel.distanceConstraint.max ?? rel.distanceConstraint.maxHexes ?? Infinity,
        isHard: rel.distanceIsHard ?? false,
      })
    } else if (rel.impliesSpatialAccess) {
      // Implied closeness — soft "within travel range" constraint
      constraints.push({
        fromEntityId: rel.fromEntityId,
        toEntityId: rel.toEntityId,
        minHexes: 0,
        maxHexes: 10,
        isHard: false,
      })
    }
  }

  return constraints
}
