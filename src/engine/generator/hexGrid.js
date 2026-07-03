import { defineHex, Grid, rectangle, Orientation } from 'honeycomb-grid'

export function hexId(q, r) {
  return `${q},${r}`
}

export function parseHexId(id) {
  const [q, r] = id.split(',').map(Number)
  return { q, r }
}

export function hexDistance(a, b) {
  const dq = a.q - b.q
  const dr = a.r - b.r
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2
}

const AXIAL_DIRECTIONS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]

export function getNeighborIds(q, r) {
  return AXIAL_DIRECTIONS.map(([dq, dr]) => hexId(q + dq, r + dr))
}

export function createHexGrid(width, height, hexSize = 28) {
  const Hex = defineHex({
    dimensions: hexSize,
    orientation: Orientation.POINTY,
    origin: 'topLeft',
  })

  const grid = new Grid(Hex, rectangle({ width, height }))

  const hexData = []
  grid.forEach((hex) => {
    hexData.push({
      q: hex.q,
      r: hex.r,
      x: hex.x,
      y: hex.y,
      corners: hex.corners.map((c) => ({ x: c.x, y: c.y })),
    })
  })

  return hexData
}

export function getBounds(hexData) {
  if (!hexData.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const { corners } of hexData) {
    for (const { x, y } of corners) {
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}
