import { hexDistance } from '../generator/hexGrid.js'

// Score a candidate hex for an entity. Returns a positive float (higher = better).
// allHexes     — hexStore object keyed by id
// assignments  — {entityId → hexId} for entities already placed this batch
// entityMap    — optional {entityId → entity object} used for module-cohesion scoring
export function scorePlacement(entity, hex, softConstraints, allHexes, assignments, entityMap = null) {
  let score = 1.0
  const reqs = entity.locationRequirements ?? {}

  // Terrain affinity: soft preference
  const affinities = reqs.terrainAffinity ?? []
  if (affinities.length > 0) {
    score *= affinities.includes(hex.terrain) ? 1.0 : 0.55
  }

  // Biome preference (soft — hard filtering happens in buildDomain)
  const biomeReqs = reqs.biomeRequirements ?? []
  if (biomeReqs.length > 0) {
    score *= biomeReqs.includes(hex.biome) ? 1.0 : 0.55
  }

  // Soft distance constraints from relationships
  for (const c of softConstraints) {
    if (c.isHard) continue
    const isFrom = c.fromEntityId === entity.id
    const isTo   = c.toEntityId   === entity.id
    if (!isFrom && !isTo) continue

    const otherId   = isFrom ? c.toEntityId : c.fromEntityId
    const otherHexId = assignments[otherId]
    if (!otherHexId) continue

    const otherHex = allHexes[otherHexId]
    if (!otherHex) continue

    const dist = hexDistance(hex, otherHex)
    if (dist < c.minHexes || dist > c.maxHexes) score *= 0.35
  }

  // Penalise ocean placement unless biome explicitly requires it
  if (hex.terrain === 'ocean' && !biomeReqs.includes('coastal')) {
    score *= 0.1
  }

  // Module cohesion + locale awareness
  // Find entity IDs already assigned to this hex in the current batch
  const assignedHere = Object.entries(assignments)
    .filter(([, hid]) => hid === hex.id)
    .map(([eid]) => eid)

  if (assignedHere.length > 0 && entityMap) {
    const mySources = new Set(entity.sources ?? [])
    const myLocale  = entity.locale ?? null

    if (mySources.size > 0) {
      // Entities from the same module already in this hex
      const sameModHere = assignedHere.filter((eid) => {
        const other = entityMap[eid]
        return other && (other.sources ?? []).some((s) => mySources.has(s))
      })

      if (sameModHere.length > 0) {
        if (myLocale) {
          // This entity has a locale — check what's already here
          const hasSameLocale = sameModHere.some((eid) => entityMap[eid]?.locale === myLocale)
          const hasDiffLocale = sameModHere.some((eid) => {
            const ol = entityMap[eid]?.locale
            return ol && ol !== myLocale
          })

          if (hasSameLocale) {
            // Same locale → strong pull to cluster in one hex
            score *= 2.5
          } else if (hasDiffLocale) {
            // Different locale from same module → avoid sharing a hex
            score *= 0.3
          }
          // Same module, sibling has no locale → neutral (no adjustment)
        } else {
          // No locale on this entity → mild cohesion with any same-module sibling
          score *= 1.4
        }
      }
    }
  }

  // Mild overcrowding penalty — kicks in after 4 entities to prevent infinite piling
  if (assignedHere.length >= 4) {
    score *= Math.pow(0.82, assignedHere.length - 3)
  }

  return score
}
