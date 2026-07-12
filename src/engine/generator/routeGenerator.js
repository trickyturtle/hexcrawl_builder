import { v4 as uuidv4 } from 'uuid'
import { hexId, hexDistance, parseHexId, getNeighborIds } from './hexGrid.js'

// ── Terrain movement costs for route pathfinding ─────────────────────────────
// Roads follow the cheap ground; shipping makes ocean viable but a route only
// takes to the water when its access type allows it.
const LAND_COST = {
  plains: 1, coast: 1, desert: 1.4, forest: 1.6, tundra: 1.6,
  hills: 1.8, swamp: 2.4, underground: 2, mountains: 3,
}

function stepCost(hex, accessType) {
  if (!hex) return Infinity
  if (hex.terrain === 'ocean') {
    if (accessType === 'land') return Infinity // no shipping on a land route
    return accessType === 'sea' ? 0.8 : 1.1    // sea routes prefer open water
  }
  // a sea route's overland legs (getting to/from port) are expensive
  if (accessType === 'sea') return 2.5
  return LAND_COST[hex.terrain] ?? 1.5
}

// ── A* between two hexes ──────────────────────────────────────────────────────
// Returns an array of hex ids, or null when no permitted path exists (e.g. a
// land-only route between separate landmasses — honest failure, no route).
export function findRoutePath(fromId, toId, hexes, accessType = 'either') {
  const start = hexes[fromId]
  const goal = hexes[toId]
  if (!start || !goal) return null
  if (fromId === toId) return [fromId]

  const open = new Map([[fromId, hexDistance(start, goal)]]) // id → f
  const gScore = { [fromId]: 0 }
  const cameFrom = {}
  const closed = new Set()

  while (open.size > 0) {
    let current = null
    let bestF = Infinity
    for (const [id, f] of open) {
      if (f < bestF) { bestF = f; current = id }
    }
    open.delete(current)

    if (current === toId) {
      const path = [current]
      while (cameFrom[path[0]]) path.unshift(cameFrom[path[0]])
      return path
    }

    closed.add(current)
    if (closed.size > 5000) return null // safety valve on huge maps

    const hex = hexes[current]
    for (const nid of getNeighborIds(hex.q, hex.r)) {
      if (closed.has(nid)) continue
      const nHex = hexes[nid]
      const cost = stepCost(nHex, accessType)
      if (!Number.isFinite(cost)) continue
      const tentative = gScore[current] + cost
      if (tentative < (gScore[nid] ?? Infinity)) {
        gScore[nid] = tentative
        cameFrom[nid] = current
        open.set(nid, tentative + hexDistance(nHex, goal))
      }
    }
  }
  return null
}

// 'land' when the path never touches water; 'sea' for sea-access routes that
// do; 'mixed' when an either-access route takes a shipping leg
function routeMode(path, hexes, accessType) {
  const touchesOcean = path.some((hid) => hexes[hid]?.terrain === 'ocean')
  if (!touchesOcean) return 'land'
  return accessType === 'sea' ? 'sea' : 'mixed'
}

// Generate route records for entity pairs connected by impliesSpatialAccess
// relationships, honouring each relationship's accessType:
//   land — path over land only (skipped with a warning-free null if impossible)
//   sea — prefers open water, overland only near the endpoints
//   either — cheapest mix of both
//   none — no route at all
// placements  — {entityId: hexId} for newly placed entities
// entities    — array of entity objects from the batch
// Returns array of route objects: { id, fromHexId, toHexId, entityPairIds, path, mode, accessType }
export function generateRoutes(hexes, placements, entities) {
  const routes = []
  const seen = new Set()

  for (const entity of entities) {
    for (const rel of (entity.relationships ?? [])) {
      if (!rel.impliesSpatialAccess) continue
      if (!rel.fromEntityId || !rel.toEntityId) continue
      const accessType = rel.accessType ?? 'either'
      if (accessType === 'none') continue

      const pairKey = [rel.fromEntityId, rel.toEntityId].sort().join('|')
      if (seen.has(pairKey)) continue
      seen.add(pairKey)

      const fromHexId = placements[rel.fromEntityId]
      const toHexId   = placements[rel.toEntityId]
      if (!fromHexId || !toHexId) continue

      let path
      if (hexes[fromHexId] && hexes[toHexId]) {
        path = findRoutePath(fromHexId, toHexId, hexes, accessType)
        // no permitted path (e.g. land-only across the sea) → honestly no route
        if (!path) continue
      } else {
        // endpoints outside the known grid — straight-line fallback
        path = hexLinePath(parseHexId(fromHexId), parseHexId(toHexId))
      }

      routes.push({
        id: uuidv4(),
        fromHexId,
        toHexId,
        entityPairIds: [rel.fromEntityId, rel.toEntityId],
        path,
        accessType,
        mode: routeMode(path, hexes, accessType),
      })
    }
  }

  return routes
}

// ── Straight-line fallback (used only when pathfinding has no grid to work
// with, e.g. endpoints outside the known map) ─────────────────────────────────

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
