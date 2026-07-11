import { getNeighborIds } from './hexGrid.js'

// ── Territory generation ──────────────────────────────────────────────────────
// Computes faction/nation territories and religion spread for the whole map.
//
// - Each Faction/Nation grows territory outward (BFS over land) from its home
//   base: the hex of its homeBaseEntityId if that entity is placed, else the
//   hex the faction entity itself was placed in.
// - Reach = world politicalFragmentation (unified > fragmented > tribal;
//   'none' disables polities entirely) scaled by the faction's territorySize.
// - 'concentrated' tendency fills the whole reach with a lightly ragged rim;
//   'diffuse' scatters presence that thins with distance.
// - Factions may overlap each other. Nations are exclusive against other
//   nations: contested hexes go to the nearest nation (sorted id breaks ties).
// - Religions spread from every placed entity related to them (plus their own
//   hex), and travel along trade routes whose endpoints touch their seeds.
//
// Deterministic (hash noise only). Returns diff-only patches:
// { [hexId]: { factionIds, religionIds } } for hexes whose lists changed —
// callers record prior values for batch revert.

function hash01(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 100000) / 100000
}

const FRAGMENTATION_REACH = { unified: 7, fragmented: 4, tribal: 2 }
const SIZE_SCALE = { small: 0.6, medium: 1, large: 1.5 }

const isLand = (hex) => hex && hex.terrain !== 'ocean'

// BFS distances from a start hex across land, up to maxDepth
function landDistances(startHexId, hexes, maxDepth) {
  const dist = { [startHexId]: 0 }
  let frontier = [startHexId]
  for (let d = 1; d <= maxDepth; d++) {
    const next = []
    for (const hid of frontier) {
      const hex = hexes[hid]
      if (!hex) continue
      for (const nid of getNeighborIds(hex.q, hex.r)) {
        if (dist[nid] !== undefined) continue
        if (!isLand(hexes[nid])) continue
        dist[nid] = d
        next.push(nid)
      }
    }
    frontier = next
  }
  return dist
}

// Map each placed entity to its hex
function buildEntityHexIndex(hexes) {
  const index = {}
  for (const [hid, hex] of Object.entries(hexes)) {
    for (const eid of (hex.entityIds ?? [])) index[eid] = hid
  }
  return index
}

export function generateTerritories(hexes, entities, routes = [], worldParams = {}) {
  const fragmentation = worldParams.politicalFragmentation ?? 'fragmented'
  const entityHex = buildEntityHexIndex(hexes)
  const entityList = Object.values(entities)

  // hexId → Set of faction ids / religion ids
  const factionSets = {}
  const religionSets = {}

  // ── Faction / Nation territories ────────────────────────────────────────
  const factions = fragmentation === 'none' ? [] : entityList
    .filter((e) => e.subclass === 'Faction' || e.subclass === 'Nation')
    .sort((a, b) => a.id.localeCompare(b.id)) // stable order for determinism

  // nation contest resolution: hexId → { nationId, dist }
  const nationClaims = {}

  for (const faction of factions) {
    const homeHexId = (faction.homeBaseEntityId && entityHex[faction.homeBaseEntityId])
      || entityHex[faction.id]
    if (!homeHexId || !isLand(hexes[homeHexId])) continue

    const baseReach = FRAGMENTATION_REACH[fragmentation] ?? 4
    const reach = Math.max(1, Math.round(baseReach * (SIZE_SCALE[faction.territorySize] ?? 1)))
    const diffuse = faction.territoryTendency === 'diffuse'
    const dist = landDistances(homeHexId, hexes, diffuse ? reach + 2 : reach)

    for (const [hid, d] of Object.entries(dist)) {
      let claimed
      if (diffuse) {
        // scattered presence thinning with distance; home hex always held
        claimed = d === 0 || hash01(`${faction.id}:${hid}`) < 0.95 - (d / (reach + 2)) * 0.75
      } else {
        // solid core with a lightly ragged rim
        claimed = d < reach || (d === reach && hash01(`${faction.id}:${hid}`) < 0.5)
      }
      if (!claimed) continue

      if (faction.subclass === 'Nation') {
        const prev = nationClaims[hid]
        if (!prev || d < prev.dist) nationClaims[hid] = { nationId: faction.id, dist: d }
      } else {
        (factionSets[hid] ??= new Set()).add(faction.id)
      }
    }
  }

  // Nations are exclusive against each other — apply resolved claims
  for (const [hid, { nationId }] of Object.entries(nationClaims)) {
    (factionSets[hid] ??= new Set()).add(nationId)
  }

  // ── Religion spread ─────────────────────────────────────────────────────
  const religions = entityList
    .filter((e) => e.subclass === 'Religion')
    .sort((a, b) => a.id.localeCompare(b.id))

  // relationships live on entities; collect both directions per religion
  const relatedTo = (religionId) => {
    const related = new Set()
    for (const e of entityList) {
      for (const rel of (e.relationships ?? [])) {
        if (rel.fromEntityId === religionId) related.add(rel.toEntityId)
        if (rel.toEntityId === religionId) related.add(rel.fromEntityId)
      }
    }
    return related
  }

  for (const religion of religions) {
    const seeds = new Set()
    if (entityHex[religion.id]) seeds.add(entityHex[religion.id])
    for (const eid of relatedTo(religion.id)) {
      if (entityHex[eid]) seeds.add(entityHex[eid])
    }
    if (seeds.size === 0) continue

    const present = new Set()
    for (const seed of seeds) {
      const dist = landDistances(seed, hexes, 3)
      for (const [hid, d] of Object.entries(dist)) {
        if (d === 0 || hash01(`${religion.id}:${hid}`) < 0.85 - d * 0.2) present.add(hid)
      }
    }

    // spread along trade routes whose endpoints touch a seed
    for (const route of routes) {
      const touches = route.path?.some((hid) => seeds.has(hid))
      if (!touches) continue
      for (const hid of route.path) {
        if (isLand(hexes[hid])) present.add(hid)
      }
    }

    for (const hid of present) {
      (religionSets[hid] ??= new Set()).add(religion.id)
    }
  }

  // ── Diff against current hex state, emit only changes ───────────────────
  const patches = {}
  for (const [hid, hex] of Object.entries(hexes)) {
    const newFactions = [...(factionSets[hid] ?? [])].sort()
    const newReligions = [...(religionSets[hid] ?? [])].sort()
    const oldFactions = [...(hex.factionIds ?? [])].sort()
    const oldReligions = [...(hex.religionIds ?? [])].sort()
    const factionsChanged = newFactions.join('|') !== oldFactions.join('|')
    const religionsChanged = newReligions.join('|') !== oldReligions.join('|')
    if (factionsChanged || religionsChanged) {
      patches[hid] = {}
      if (factionsChanged) patches[hid].factionIds = newFactions
      if (religionsChanged) patches[hid].religionIds = newReligions
    }
  }
  return patches
}
