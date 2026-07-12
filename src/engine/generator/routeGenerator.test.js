import { describe, it, expect } from 'vitest'
import { generateRoutes, findRoutePath } from './routeGenerator.js'

// Two-row strip map; oceanCells is a set of "col,row" strings.
// Axial q equals col for rows 0 and 1 (floor(r/2) = 0), so ids are "q,r".
function stripMap(cols, oceanCells = new Set()) {
  const hexes = {}
  for (let r = 0; r <= 1; r++) {
    for (let c = 0; c < cols; c++) {
      const id = `${c},${r}`
      hexes[id] = { id, q: c, r, terrain: oceanCells.has(id) ? 'ocean' : 'plains', entityIds: [] }
    }
  }
  return hexes
}

const rel = (accessType) => ({
  id: 'r1', fromEntityId: 'a', toEntityId: 'b',
  impliesSpatialAccess: true, accessType,
})
const entities = (accessType) => [{ id: 'a', relationships: [rel(accessType)] }]
const placements = { a: '0,0', b: '6,0' }

describe('findRoutePath', () => {
  it('land routes detour around water', () => {
    // ocean at (3,0) only — the land path goes through row 1
    const hexes = stripMap(7, new Set(['3,0']))
    const path = findRoutePath('0,0', '6,0', hexes, 'land')
    expect(path).not.toBeNull()
    expect(path[0]).toBe('0,0')
    expect(path[path.length - 1]).toBe('6,0')
    expect(path.some((hid) => hexes[hid].terrain === 'ocean')).toBe(false)
  })

  it('land routes across an impassable ocean barrier honestly fail', () => {
    const hexes = stripMap(7, new Set(['3,0', '3,1']))
    expect(findRoutePath('0,0', '6,0', hexes, 'land')).toBeNull()
  })

  it('either-access routes ship across the barrier', () => {
    const hexes = stripMap(7, new Set(['3,0', '3,1']))
    const path = findRoutePath('0,0', '6,0', hexes, 'either')
    expect(path).not.toBeNull()
    expect(path.some((hid) => hexes[hid].terrain === 'ocean')).toBe(true)
  })

  it('sea routes prefer open water over land', () => {
    // row 1 is entirely ocean — a sea route should take it rather than march overland
    const ocean = new Set()
    for (let c = 0; c < 7; c++) ocean.add(`${c},1`)
    const hexes = stripMap(7, ocean)
    const path = findRoutePath('0,0', '6,0', hexes, 'sea')
    expect(path.filter((hid) => hexes[hid].terrain === 'ocean').length).toBeGreaterThan(2)
  })
})

describe('generateRoutes', () => {
  it('tags pure land paths as mode land', () => {
    const hexes = stripMap(7)
    const [route] = generateRoutes(hexes, placements, entities('land'))
    expect(route.mode).toBe('land')
    expect(route.accessType).toBe('land')
  })

  it('tags either-access shipping legs as mixed', () => {
    const hexes = stripMap(7, new Set(['3,0', '3,1']))
    const [route] = generateRoutes(hexes, placements, entities('either'))
    expect(route.mode).toBe('mixed')
  })

  it('tags sea-access water paths as sea', () => {
    const hexes = stripMap(7, new Set(['3,0', '3,1']))
    const [route] = generateRoutes(hexes, placements, entities('sea'))
    expect(route.mode).toBe('sea')
  })

  it('skips the route entirely when a land path is impossible', () => {
    const hexes = stripMap(7, new Set(['3,0', '3,1']))
    expect(generateRoutes(hexes, placements, entities('land'))).toHaveLength(0)
  })

  it('accessType none produces no route', () => {
    const hexes = stripMap(7)
    expect(generateRoutes(hexes, placements, entities('none'))).toHaveLength(0)
  })
})
