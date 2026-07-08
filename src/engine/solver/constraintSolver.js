import { hexDistance } from '../generator/hexGrid.js'
import { inferSpatialConstraints, inferModuleDistanceConstraints } from './spatialInference.js'
import { scorePlacement } from './scoring.js'
import { generateRoutes } from '../generator/routeGenerator.js'
import { terrainForBiome, TERRAFORMABLE_BIOMES } from './biomeRules.js'

const MAX_ITERATIONS = 5000

// ── Public API ────────────────────────────────────────────────────────────────

// batchEntities    — array of full entity objects from the current batch
// batchModules     — module profiles in the batch (for explicitDistances)
// hexes            — hexStore.hexes (object keyed by id)
// placedEntityHexes — {entityId: hexId} for already-committed entities
// worldParams      — from worldStore (hexSizeMiles + travel speeds convert
//                    module text distances to hexes)
export function solve({ batchEntities, batchModules = [], hexes, placedEntityHexes = {}, worldParams = {} }) {
  const { constraints: moduleConstraints, warnings } =
    inferModuleDistanceConstraints(batchModules, batchEntities, worldParams)

  if (!batchEntities.length) {
    return { success: true, placements: {}, conflicts: [], routes: [], warnings }
  }

  const hexArray = Object.values(hexes)
  const allRelationships = batchEntities.flatMap((e) => e.relationships ?? [])
  const spatialConstraints = [...inferSpatialConstraints(allRelationships), ...moduleConstraints]

  // Map for O(1) entity lookup during scoring (used for module-cohesion bonus)
  const entityMap = Object.fromEntries(batchEntities.map((e) => [e.id, e]))

  // Build per-entity candidate domains (hard filters only)
  const domains = {}
  for (const entity of batchEntities) {
    domains[entity.id] = buildDomain(
      entity, hexArray, placedEntityHexes, spatialConstraints, hexes,
    )
  }

  // Separate entities by whether they have any valid candidate hexes
  const emptyDomainConflicts = batchEntities
    .filter((e) => domains[e.id].length === 0)
    .map((e) => ({
      entityId: e.id,
      entityName: e.name || 'Unnamed',
      reason: diagnoseEmptyDomain(e, hexArray, placedEntityHexes, spatialConstraints, hexes),
    }))

  // Only attempt placement for entities that have at least one candidate hex.
  // Empty-domain entities are reported as conflicts but do NOT block the others.
  const placeableEntities = batchEntities.filter((e) => domains[e.id].length > 0)

  // Backtracking CSP on placeable entities
  let assignments = { ...placedEntityHexes }
  const newPlacements = {}
  if (placeableEntities.length > 0) {
    const counter = { count: 0 }
    const btResult = backtrack(
      placeableEntities, domains, { ...placedEntityHexes },
      spatialConstraints, hexes, counter, entityMap,
    )
    if (!btResult.success) {
      return greedyFallback(placeableEntities, domains, emptyDomainConflicts,
        spatialConstraints, hexes, entityMap, warnings)
    }
    assignments = btResult.placements
    for (const e of placeableEntities) newPlacements[e.id] = assignments[e.id]
  }

  // Terraform pass: entities whose requirements match no existing hex get the
  // best-scoring empty hex reshaped to fit (per design, terrain/biome
  // propagate from placed entities — the world conforms to the modules).
  // Coastal/underground/planar requirements can't be conjured and stay
  // conflicts.
  const terraformed = {}
  const conflicts = []
  for (const c of emptyDomainConflicts) {
    const entity = entityMap[c.entityId]
    const t = entity && tryTerraform(entity, hexArray, hexes, assignments, spatialConstraints, entityMap)
    if (t) {
      newPlacements[entity.id] = t.hexId
      assignments = { ...assignments, [entity.id]: t.hexId }
      terraformed[t.hexId] = t.patch
    } else {
      conflicts.push(c)
    }
  }

  const placedList = batchEntities.filter((e) => newPlacements[e.id])
  const routes = generateRoutes(hexes, newPlacements, placedList)

  if (conflicts.length === 0) {
    return { success: true, placements: newPlacements, conflicts: [], routes, warnings, terraformed }
  }
  return { success: false, partial: true, placements: newPlacements, conflicts, routes, warnings, terraformed }
}

// ── Greedy fallback ─────────────────────────────────────────────────────────
// When backtracking can't satisfy every hard constraint simultaneously, place
// each placeable entity at its best available hex independently and report any
// remaining hard-constraint violations (per design: fail loudly, don't silently
// produce a broken world).
function greedyFallback(placeableEntities, domains, emptyDomainConflicts, spatialConstraints, hexes, entityMap, warnings) {
  const fallback = {}
  const conflicts = [...emptyDomainConflicts]

  for (const entity of placeableEntities) {
    const best = domains[entity.id]
      .map((h) => ({ h, s: scorePlacement(entity, h, spatialConstraints, hexes, fallback, entityMap) }))
      .sort((a, b) => b.s - a.s)[0]
    fallback[entity.id] = best.h.id
  }

  for (const entity of placeableEntities) {
    if (!fallback[entity.id]) continue
    const hex = hexes[fallback[entity.id]]
    if (!hex) continue
    if (!checkHardConstraints(entity, hex, fallback, spatialConstraints, hexes)) {
      if (!conflicts.find((c) => c.entityId === entity.id)) {
        conflicts.push({ entityId: entity.id, entityName: entity.name || 'Unnamed',
          reason: 'Could not satisfy all hard distance constraints' })
      }
    }
  }

  return { success: false, partial: true, placements: fallback, conflicts, routes: [], warnings }
}

// ── Terraform ───────────────────────────────────────────────────────────────
// When an entity's biome/elevation requirements match no existing hex, reshape
// the best-scoring candidate hex to fit rather than failing. This realises the
// spec's "propagate terrain/biome outward from placed entities" — a module that
// needs temperate mountains gets them, instead of a hard conflict.
//
// Only requirements the generator itself can produce are conjured:
// - biome must be one of TERRAFORMABLE_BIOMES (not coastal/underground/planar)
// - elevation 'underground' is never surfaced; other elevations are fine
// Returns { hexId, patch } or null if the requirement can't be terraformed.
function tryTerraform(entity, hexArray, hexes, assignments, constraints, entityMap) {
  const reqs = entity.locationRequirements ?? {}
  const biomeReqs = (reqs.biomeRequirements ?? []).filter((b) => b !== null && b !== undefined)
  const elevReqs = (reqs.elevationRequirements ?? []).filter((e) => e !== 'underground')

  // Pick a target biome we can actually build
  let targetBiome = null
  if (biomeReqs.length > 0) {
    targetBiome = biomeReqs.find((b) => TERRAFORMABLE_BIOMES.includes(b))
    if (!targetBiome) return null // e.g. coastal/underground/planar — can't conjure
  }

  // Pick a target terrain honouring elevation, then affinity, then biome
  const affinity = reqs.terrainAffinity ?? []
  let targetTerrain
  if (elevReqs.includes('mountain')) {
    targetTerrain = 'mountains'
  } else if (affinity.length > 0 && affinity[0] !== 'ocean' && affinity[0] !== 'coast') {
    targetTerrain = affinity[0]
  } else if (targetBiome) {
    targetTerrain = terrainForBiome(targetBiome, 0.5)
  } else {
    targetTerrain = 'plains'
  }
  if (!targetBiome) targetBiome = biomeForSurfaceTerrain(targetTerrain)

  // Candidate land hexes not already holding a placement this batch. Prefer
  // reshaping plains/hills (low-value filler) over forests, deserts, etc.
  const taken = new Set(Object.values(assignments))
  const candidates = hexArray.filter((h) =>
    h.terrain !== 'ocean' && h.terrain !== 'coast' && !taken.has(h.id)
  )
  if (candidates.length === 0) return null

  const reshapeCost = (h) => (h.terrain === 'plains' ? 0 : h.terrain === 'hills' ? 1 : 2)
  const best = candidates
    .map((h) => ({
      h,
      // low reshape cost first, then soft-constraint score for good placement
      key: reshapeCost(h) * 1000 - scorePlacement(entity, h, constraints, hexes, assignments, entityMap),
    }))
    .sort((a, b) => a.key - b.key)[0].h

  return {
    hexId: best.id,
    patch: {
      terrain: targetTerrain,
      biome: targetBiome,
      elevation: targetTerrain === 'mountains' ? 'mountain' : 'lowland',
    },
  }
}

// Surface-terrain → biome without the mountains→cold shortcut, so a terraformed
// temperate-mountain hex keeps its requested biome
function biomeForSurfaceTerrain(terrain) {
  switch (terrain) {
    case 'desert': return 'arid'
    case 'swamp': return 'tropical'
    case 'tundra': return 'cold'
    default: return 'temperate'
  }
}

// ── Backtracking ──────────────────────────────────────────────────────────────

function backtrack(unassigned, domains, assignments, constraints, hexes, counter, entityMap) {
  if (counter.count++ > MAX_ITERATIONS) return { success: false }
  if (!unassigned.length) return { success: true, placements: assignments }

  // MRV: entity with smallest domain
  let bestIdx = 0
  for (let i = 1; i < unassigned.length; i++) {
    if (domains[unassigned[i].id].length < domains[unassigned[bestIdx].id].length) bestIdx = i
  }
  const entity   = unassigned[bestIdx]
  const remaining = unassigned.filter((_, i) => i !== bestIdx)

  // Sort candidates by score descending
  const candidates = domains[entity.id]
    .map((h) => ({ h, s: scorePlacement(entity, h, constraints, hexes, assignments, entityMap) }))
    .sort((a, b) => b.s - a.s)

  for (const { h: hex } of candidates) {
    if (!checkHardConstraints(entity, hex, assignments, constraints, hexes)) continue
    const next = { ...assignments, [entity.id]: hex.id }
    const result = backtrack(remaining, domains, next, constraints, hexes, counter, entityMap)
    if (result.success) return result
  }

  return { success: false }
}

// ── Domain building ───────────────────────────────────────────────────────────

function buildDomain(entity, hexArray, placedEntityHexes, constraints, allHexes) {
  const reqs      = entity.locationRequirements ?? {}
  const biomeReqs = reqs.biomeRequirements ?? []
  const elevReqs  = reqs.elevationRequirements ?? []
  const proxReqs  = reqs.proximityRequirements ?? []

  // Underground elevation is independent of surface terrain (per design): an underground
  // entity can exist below any non-ocean surface hex, so we drop 'underground' from
  // the surface elevation filter entirely.
  const surfaceElevReqs = elevReqs.filter((e) => e !== 'underground')

  return hexArray.filter((hex) => {
    // Skip ocean unless coastal biome is explicitly required
    if (hex.terrain === 'ocean' && !biomeReqs.includes('coastal')) return false

    // Hard biome filter
    if (biomeReqs.length > 0 && !biomeReqs.includes(hex.biome)) return false

    // Hard elevation filter (underground excluded — see above)
    if (surfaceElevReqs.length > 0 && !surfaceElevReqs.includes(hex.elevation)) return false

    // Hard proximity requirements against pre-existing placements
    for (const req of proxReqs) {
      if (!req.isHard) continue
      const otherHexId = placedEntityHexes[proximityTargetId(req)]
      if (!otherHexId) continue
      const otherHex = allHexes[otherHexId]
      if (!otherHex) continue
      const dist = hexDistance(hex, otherHex)
      if (dist < (req.minHexes ?? 0) || dist > (req.maxHexes ?? Infinity)) return false
    }

    // Hard spatial constraints from relationships against pre-existing placements
    for (const c of constraints) {
      if (!c.isHard) continue
      const isFrom = c.fromEntityId === entity.id
      const isTo   = c.toEntityId   === entity.id
      if (!isFrom && !isTo) continue
      const otherId = isFrom ? c.toEntityId : c.fromEntityId
      const otherHexId = placedEntityHexes[otherId]
      if (!otherHexId) continue
      const otherHex = allHexes[otherHexId]
      if (!otherHex) continue
      const dist = hexDistance(hex, otherHex)
      if (dist < c.minHexes || dist > c.maxHexes) return false
    }

    return true
  })
}

// ── Diagnostics ───────────────────────────────────────────────────────────────
// Called only when buildDomain returns empty — explains specifically what failed.

function diagnoseEmptyDomain(entity, hexArray, placedEntityHexes, constraints, allHexes) {
  const reqs      = entity.locationRequirements ?? {}
  const biomeReqs = reqs.biomeRequirements ?? []
  const elevReqs  = reqs.elevationRequirements ?? []
  const proxReqs  = reqs.proximityRequirements ?? []

  const surfaceElevReqs = elevReqs.filter((e) => e !== 'underground')

  // Land hexes only (exclude ocean for availability reporting)
  const landHexes   = hexArray.filter((h) => h.terrain !== 'ocean')
  const mapBiomes   = [...new Set(landHexes.map((h) => h.biome))].filter(Boolean).sort()
  const mapElevs    = [...new Set(landHexes.map((h) => h.elevation))].filter(Boolean).sort()

  const parts = []

  // ── Biome constraint ──────────────────────────────────────────────────────
  if (biomeReqs.length > 0) {
    const satisfied = biomeReqs.some((b) => mapBiomes.includes(b))
    if (!satisfied) {
      parts.push(
        `needs biome [${biomeReqs.join(', ')}] — ` +
        `map has [${mapBiomes.join(', ') || 'none'}]`
      )
    }
  }

  // ── Elevation constraint ─────────────────────────────────────────────────
  if (surfaceElevReqs.length > 0) {
    const satisfied = surfaceElevReqs.some((e) => mapElevs.includes(e))
    if (!satisfied) {
      parts.push(
        `needs elevation [${surfaceElevReqs.join(', ')}] — ` +
        `map has [${mapElevs.join(', ') || 'none'}]`
      )
    }
  }

  // ── Proximity / distance constraints ─────────────────────────────────────
  for (const req of proxReqs) {
    if (!req.isHard) continue
    const otherHexId = placedEntityHexes[proximityTargetId(req)]
    if (!otherHexId) continue
    const otherHex = allHexes[otherHexId]
    if (otherHex) {
      parts.push(
        `proximity to ${proximityTargetId(req)}: ` +
        `min ${req.minHexes ?? 0}–max ${req.maxHexes ?? '∞'} hexes, no hex satisfies`
      )
    }
  }

  // ── Spatial (relationship-derived) constraints ────────────────────────────
  for (const c of constraints) {
    if (!c.isHard) continue
    const isFrom = c.fromEntityId === entity.id
    const isTo   = c.toEntityId   === entity.id
    if (!isFrom && !isTo) continue
    const otherId    = isFrom ? c.toEntityId : c.fromEntityId
    const otherHexId = placedEntityHexes[otherId]
    if (otherHexId) {
      parts.push(
        `distance constraint to pre-placed entity: ` +
        `min ${c.minHexes}–max ${c.maxHexes} hexes, no hex satisfies`
      )
    }
  }

  if (parts.length > 0) return parts.join('; ')

  // Fallback — report the raw requirement values so the user can investigate
  const reqs_summary = []
  if (biomeReqs.length)      reqs_summary.push(`biome: [${biomeReqs.join(', ')}]`)
  if (surfaceElevReqs.length) reqs_summary.push(`elevation: [${surfaceElevReqs.join(', ')}]`)
  if (proxReqs.length)       reqs_summary.push(`${proxReqs.length} proximity req(s)`)
  if (constraints.some((c) => c.isHard && (c.fromEntityId === entity.id || c.toEntityId === entity.id)))
    reqs_summary.push('spatial distance constraint(s)')

  return reqs_summary.length > 0
    ? `requirements not satisfiable: ${reqs_summary.join(', ')}`
    : 'no hexes pass all hard constraints (check entity requirements)'
}

// Proximity requirements are stored as { entityId, … } (per schema and EntityForm);
// targetEntityId is accepted for data written by older versions of the solver docs.
function proximityTargetId(req) {
  return req.entityId ?? req.targetEntityId
}

// ── Constraint checking ───────────────────────────────────────────────────────

function checkHardConstraints(entity, hex, assignments, constraints, hexes) {
  // Spatial constraints from relationships
  for (const c of constraints) {
    if (!c.isHard) continue
    const isFrom = c.fromEntityId === entity.id
    const isTo   = c.toEntityId   === entity.id
    if (!isFrom && !isTo) continue

    const otherId    = isFrom ? c.toEntityId : c.fromEntityId
    const otherHexId = assignments[otherId]
    if (!otherHexId) continue

    const otherHex = hexes[otherHexId]
    if (!otherHex) continue

    const dist = hexDistance(hex, otherHex)
    if (dist < c.minHexes || dist > c.maxHexes) return false
  }

  // Entity's own hard proximity requirements
  for (const req of (entity.locationRequirements?.proximityRequirements ?? [])) {
    if (!req.isHard) continue
    const otherHexId = assignments[proximityTargetId(req)]
    if (!otherHexId) continue
    const otherHex = hexes[otherHexId]
    if (!otherHex) continue
    const dist = hexDistance(hex, otherHex)
    if (dist < (req.minHexes ?? 0) || dist > (req.maxHexes ?? Infinity)) return false
  }

  return true
}
