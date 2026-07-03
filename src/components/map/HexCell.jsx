import React, { memo } from 'react'

export const TERRAIN_FILL = {
  plains:      '#6b9e6b',
  forest:      '#2e6b2e',
  hills:       '#7a6045',
  mountains:   '#8a8a8a',
  desert:      '#c8a84b',
  swamp:       '#4a5e38',
  tundra:      '#9eb5be',
  coast:       '#6ab5d8',
  ocean:       '#1e5f9e',
  underground: '#181818',
}

const TERRAIN_STROKE = {
  plains:      '#4e7a4e',
  forest:      '#1a4d1a',
  hills:       '#5a4530',
  mountains:   '#666',
  desert:      '#a08030',
  swamp:       '#334428',
  tundra:      '#7a9aa3',
  coast:       '#4a9abf',
  ocean:       '#144a80',
  underground: '#0d0d0d',
}

const FOG_FILL = {
  unknown:  '#0f0f1a',
  explored: 'rgba(20,20,40,0.75)',
  known:    null,
}

// Colors used to tint hexes for each module batch index
const BATCH_COLORS = [
  'rgba(59,130,246,0.45)',   // blue
  'rgba(245,158,11,0.45)',   // amber
  'rgba(16,185,129,0.45)',   // green
  'rgba(239,68,68,0.45)',    // red
  'rgba(139,92,246,0.45)',   // purple
  'rgba(236,72,153,0.45)',   // pink
  'rgba(20,184,166,0.45)',   // teal
  'rgba(249,115,22,0.45)',   // orange
]

// fogVisible: whether the fog-of-war overlay is active
// dangerVisible/magicVisible: tint hexes by their danger/magic rating (0–3)
// batchIndex: -1 = no batch tint; 0+ = color from BATCH_COLORS
const HexCell = memo(function HexCell({
  hex, selected, fogVisible = false, dangerVisible = false, magicVisible = false, batchIndex = -1,
}) {
  const { id, corners, terrain, fog, entityIds, danger = 0, magic = 0, anomaly = false } = hex
  const entityCount = entityIds?.length ?? 0

  const points = corners.map((c) => `${c.x},${c.y}`).join(' ')

  // When fog overlay is off, treat every hex as fully revealed
  const effectiveFog = fogVisible ? fog : 'known'

  const fill = effectiveFog === 'unknown' ? FOG_FILL.unknown
             : (TERRAIN_FILL[terrain] ?? '#555')

  const stroke = selected
    ? '#f8e71c'
    : effectiveFog === 'unknown'
    ? '#0d0d1a'
    : (TERRAIN_STROKE[terrain] ?? '#444')

  const strokeWidth = selected ? 2 : 0.8

  // Center = mean of all corner coordinates (always correct for any hex)
  const cx = corners.reduce((s, c) => s + c.x, 0) / corners.length
  const cy = corners.reduce((s, c) => s + c.y, 0) / corners.length

  return (
    <g>
      <polygon
        data-id={id}
        points={points}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        opacity={effectiveFog === 'explored' ? 0.55 : 1}
        style={{ cursor: 'pointer' }}
      />

      {/* Module batch tint — colored fill overlay for the footprints overlay */}
      {batchIndex >= 0 && (
        <polygon
          points={points}
          fill={BATCH_COLORS[batchIndex % BATCH_COLORS.length]}
          stroke="none"
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* Danger overlay — red tint scaled by rating */}
      {dangerVisible && danger > 0 && effectiveFog !== 'unknown' && (
        <polygon
          points={points}
          fill={`rgba(220,38,38,${0.14 * danger})`}
          stroke="none"
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* Magic overlay — violet tint scaled by rating */}
      {magicVisible && magic > 0 && effectiveFog !== 'unknown' && (
        <polygon
          points={points}
          fill={`rgba(147,51,234,${0.16 * magic})`}
          stroke="none"
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* Dimensional anomaly marker — biome adjacency broken by weirdness */}
      {anomaly && effectiveFog !== 'unknown' && (
        <circle
          cx={cx}
          cy={cy}
          r={5}
          fill="none"
          stroke="#e879f9"
          strokeWidth={0.9}
          strokeDasharray="2.2,2.2"
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* Entity presence dot */}
      {entityCount > 0 && effectiveFog !== 'unknown' && (
        <circle
          cx={cx}
          cy={cy}
          r={entityCount > 2 ? 3.5 : 2.5}
          fill="rgba(255, 240, 100, 0.9)"
          stroke="rgba(0, 0, 0, 0.5)"
          strokeWidth={0.6}
          style={{ pointerEvents: 'none' }}
        />
      )}
    </g>
  )
})

export default HexCell
