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
