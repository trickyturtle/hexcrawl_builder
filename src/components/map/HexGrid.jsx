import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { useHexStore } from '../../store/hexStore.js'
import { useUiStore } from '../../store/uiStore.js'
import { useModuleStore } from '../../store/moduleStore.js'
import HexCell from './HexCell.jsx'

const PADDING = 60

export default function HexGrid() {
  const hexes = useHexStore((s) => s.hexes)
  const routes = useHexStore((s) => s.routes)
  const selectedHexId = useUiStore((s) => s.selectedHexId)
  const selectHex = useUiStore((s) => s.selectHex)
  const clearSelection = useUiStore((s) => s.clearSelection)
  const overlays = useUiStore((s) => s.overlays)
  const batches = useModuleStore((s) => s.batches)
  const modules = useModuleStore((s) => s.modules)

  const [pan, setPan] = useState({ x: PADDING, y: PADDING })
  const [zoom, setZoom] = useState(1)

  // Keep refs in sync so event handlers always see current values without stale closures
  const panRef = useRef(pan)
  const zoomRef = useRef(zoom)
  panRef.current = pan
  zoomRef.current = zoom

  const svgRef = useRef(null)
  const dragRef = useRef(null)    // { startX, startY } anchor when drag starts
  const movedRef = useRef(false)  // true if pointer moved enough to count as a drag

  // ── Pan ────────────────────────────────────────────────────────────────────
  const handlePointerDown = useCallback((e) => {
    if (e.button !== 0) return
    dragRef.current = {
      startX: e.clientX - panRef.current.x,
      startY: e.clientY - panRef.current.y,
      targetHexId: e.target?.dataset?.id ?? null,
    }
    movedRef.current = false
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [])

  const handlePointerMove = useCallback((e) => {
    if (!dragRef.current) return
    const newX = e.clientX - dragRef.current.startX
    const newY = e.clientY - dragRef.current.startY
    const dx = newX - panRef.current.x
    const dy = newY - panRef.current.y
    if (Math.hypot(dx, dy) > 4) movedRef.current = true
    setPan({ x: newX, y: newY })
  }, [])

  const handlePointerUp = useCallback(() => {
    if (!movedRef.current && dragRef.current?.targetHexId) {
      const hexId = dragRef.current.targetHexId
      if (hexId === useUiStore.getState().selectedHexId) {
        clearSelection()
      } else {
        selectHex(hexId)
      }
    }
    dragRef.current = null
  }, [selectHex, clearSelection])

  // ── Zoom (non-passive wheel on SVG) ───────────────────────────────────────
  useEffect(() => {
    const el = svgRef.current
    if (!el) return

    function onWheel(e) {
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const z = zoomRef.current
      const p = panRef.current
      const wx = (mx - p.x) / z
      const wy = (my - p.y) / z
      const nz = Math.max(0.15, Math.min(10, z * factor))
      setZoom(nz)
      setPan({ x: mx - wx * nz, y: my - wy * nz })
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // ── Module footprint batch map ────────────────────────────────────────────
  // Maps hexId → batch index for the Modules footprint overlay
  const hexBatchMap = useMemo(() => {
    if (!overlays.moduleFootprints) return {}
    // Reverse: entityId → hexId
    const entityHex = {}
    for (const [hid, hex] of Object.entries(hexes)) {
      for (const eid of (hex.entityIds ?? [])) entityHex[eid] = hid
    }
    const map = {}
    for (let i = 0; i < batches.length; i++) {
      for (const modId of batches[i].moduleIds) {
        const mod = modules[modId]
        if (!mod) continue
        for (const eid of (mod.entities ?? [])) {
          const hid = entityHex[eid]
          if (hid !== undefined && !(hid in map)) map[hid] = i
        }
      }
    }
    return map
  }, [overlays.moduleFootprints, batches, modules, hexes])

  // ── Fit to screen on first load ───────────────────────────────────────────
  const hexArray = Object.values(hexes)

  useEffect(() => {
    if (!hexArray.length || !svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    // Find bounding box of all hex centers
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const h of hexArray) {
      if (h.x < minX) minX = h.x
      if (h.y < minY) minY = h.y
      if (h.x > maxX) maxX = h.x
      if (h.y > maxY) maxY = h.y
    }
    const gridW = maxX - minX + 60
    const gridH = maxY - minY + 60
    const scaleX = (rect.width - PADDING * 2) / gridW
    const scaleY = (rect.height - PADDING * 2) / gridH
    const fitZoom = Math.min(scaleX, scaleY, 2)
    const px = (rect.width - gridW * fitZoom) / 2 - minX * fitZoom + 30 * fitZoom
    const py = (rect.height - gridH * fitZoom) / 2 - minY * fitZoom + 30 * fitZoom
    setZoom(fitZoom)
    setPan({ x: px, y: py })
  // Run only when hexes are first populated
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hexArray.length])

  if (!hexArray.length) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-600 select-none">
        <div className="text-center space-y-2">
          <HexIcon />
          <p className="text-sm">No world generated yet</p>
          <p className="text-xs text-slate-700">Use the sidebar to create a new world</p>
        </div>
      </div>
    )
  }

  return (
    <svg
      ref={svgRef}
      className="flex-1 w-full h-full select-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{ cursor: dragRef.current ? 'grabbing' : 'grab', background: '#0a0a14' }}
    >
      <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
        {hexArray.map((hex) => (
          <HexCell
            key={hex.id}
            hex={hex}
            selected={hex.id === selectedHexId}
            fogVisible={overlays.fog}
            batchIndex={overlays.moduleFootprints ? (hexBatchMap[hex.id] ?? -1) : -1}
          />
        ))}

        {/* Trade route lines */}
        {overlays.tradeRoutes && routes.map((route) => {
          const pts = route.path
            .map((hid) => {
              const h = hexes[hid]
              if (!h?.corners) return null
              const cx = h.corners.reduce((s, c) => s + c.x, 0) / h.corners.length
              const cy = h.corners.reduce((s, c) => s + c.y, 0) / h.corners.length
              return [cx, cy]
            })
            .filter(Boolean)
          if (pts.length < 2) return null
          return (
            <polyline
              key={route.id}
              points={pts.map(([x, y]) => `${x},${y}`).join(' ')}
              stroke="rgba(248,231,28,0.5)"
              strokeWidth={1.2}
              fill="none"
              strokeDasharray="4,3"
              strokeLinecap="round"
              style={{ pointerEvents: 'none' }}
            />
          )
        })}
      </g>
    </svg>
  )
}

function HexIcon() {
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" className="mx-auto opacity-20">
      <polygon points="28,3 51,16 51,40 28,53 5,40 5,16" fill="none" stroke="#94a3b8" strokeWidth="2" />
    </svg>
  )
}
