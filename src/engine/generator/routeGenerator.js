import { v4 as uuidv4 } from 'uuid'
import { hexId, hexDistance, parseHexId } from './hexGrid.js'

// Generate route records for entity pairs connected by impliesSpatialAccess relationships.
// placements  — {entityId: hexId} for newly placed entities
// entities    — array of entity objects from the batch
// Returns array of route objects: { id, fromHexId, toHexId, entityPairIds, path }
export function generateRoutes(hexes, placements, entities) {
  const routes = []
  const seen = new Set()

  for (const entity of entities) {
    for (const rel of (entity.relationships ?? [])) {
      if (!rel.impliesSpatialAccess) continue
      if (!rel.fromEntityId || !rel.toEntityId) continue

      const pairKey = [rel.fromEntityId, rel.toEntityId].sort().join('|')
      if (seen.has(pairKey)) continue
      seen.add(pairKey)

      const fromHexId = placements[rel.fromEntityId]
      const toHexId   = placements[rel.toEntityId]
      if (!fromHexId || !toHexId) continue

      const fromCoords = parseHexId(fromHexId)
      const toCoords   = parseHexId(toHexId)
      const path = hexLinePath(fromCoords, toCoords)

      routes.push({
        id: uuidv4(),
        fromHexId,
        toHexId,
        entityPairIds: [rel.fromEntityId, rel.toEntityId],
        path,
      })
    }
  }

  return routes
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function hexLerp(a, b, t) {
  return { q: a.q + (b.q - a.q) * t, r: a.r + (b.r - a.r) * t }
}

function hexRound({ q: fq, r: fr }) {
  let q = Math.round(fq)
  let r = Math.round(fr)
  let s = Math.round(-fq - fr)
  const dq = Math.abs(q - fq)
  const dr = Math.abs(r - fr)
  const ds = Math.abs(s - (-fq - fr))
  if (dq > dr && dq > ds) q = -r - s
  else if (dr > ds) r = -q - s
  return { q, r }
}

function hexLinePath(a, b) {
  const n = hexDistance(a, b)
  if (n === 0) return [hexId(a.q, a.r)]
  const path = []
  for (let i = 0; i <= n; i++) {
    const rounded = hexRound(hexLerp(a, b, i / n))
    path.push(hexId(rounded.q, rounded.r))
  }
  return path
}
