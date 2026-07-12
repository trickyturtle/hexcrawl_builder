import React, { useState, useMemo } from 'react'
import { useModuleStore } from '../../store/moduleStore.js'
import { useEntityStore } from '../../store/entityStore.js'
import { useHexStore } from '../../store/hexStore.js'
import { useWorldStore } from '../../store/worldStore.js'
import { useUiStore } from '../../store/uiStore.js'
import { solve } from '../../engine/solver/constraintSolver.js'
import {
  propagateTerrain,
  estimateHexesForModules,
  expandHexGrid,
  generateHexes,
} from '../../engine/generator/terrainGenerator.js'
import { applyBiomeAdjacency } from '../../engine/solver/biomeRules.js'
import { generateTerritories } from '../../engine/generator/territoryGenerator.js'
import { applyBatchRevert } from '../../engine/batchRevert.js'

export default function ModuleBrowser() {
  const modules      = useModuleStore((s) => s.modules)
  const batches      = useModuleStore((s) => s.batches)
  const pendingBatch = useModuleStore((s) => s.pendingBatch)
  const stageForBatch    = useModuleStore((s) => s.stageForBatch)
  const unstageFromBatch = useModuleStore((s) => s.unstageFromBatch)
  const commitBatch      = useModuleStore((s) => s.commitBatch)
  const revertLastBatch  = useModuleStore((s) => s.revertLastBatch)

  const entities   = useEntityStore((s) => s.entities)
  const hexes      = useHexStore((s) => s.hexes)
  const setHexes   = useHexStore((s) => s.setHexes)
  const mergeHexes = useHexStore((s) => s.mergeHexes)
  const updateHex  = useHexStore((s) => s.updateHex)
  const addRoutes  = useHexStore((s) => s.addRoutes)
  const routes     = useHexStore((s) => s.routes)
  const setRoutes  = useHexStore((s) => s.setRoutes)
  const worldParams = useWorldStore((s) => s)

  const startEditingModule = useUiStore((s) => s.startEditingModule)
  const openLibraryImport  = useUiStore((s) => s.openLibraryImport)

  const [confirmRevert, setConfirmRevert] = useState(false)
  const [solverRunning, setSolverRunning] = useState(false)
  const [solverResult, setSolverResult]   = useState(null)
  // null = auto (use recommended); number = user override
  const [hexTarget, setHexTarget]         = useState(null)

  const moduleList = Object.values(modules)
  const lastBatch  = batches[batches.length - 1]
  const committedIds = new Set(batches.flatMap((b) => b.moduleIds))

  // ── Hex sizing estimates ───────────────────────────────────────────────────
  const pendingModules = useMemo(
    () => pendingBatch.map((id) => modules[id]).filter(Boolean),
    [pendingBatch, modules]
  )
  const hexEstimate = useMemo(
    () => estimateHexesForModules(pendingModules),
    [pendingModules]
  )

  const currentMapSize  = Object.keys(hexes).length
  const effectiveTarget = hexTarget ?? hexEstimate.recommended
  const needsCreation   = currentMapSize === 0
  const needsExpansion  = !needsCreation && hexEstimate.min > 0 && currentMapSize < effectiveTarget

  const entityCountForModule = (mod) =>
    (mod.entities ?? []).filter((id) => entities[id]).length +
    Object.values(entities).filter((e) => e.sources?.includes(mod.id) && !(mod.entities ?? []).includes(e.id)).length

  // ── Commit batch with solver ───────────────────────────────────────────────
  const handleCommit = () => {
    if (!pendingBatch.length) return

    setSolverRunning(true)
    setSolverResult(null)

    // Build working hex map — create or expand as needed.
    // Everything the commit does is recorded so revert can unwind it exactly:
    // hexes added, prior values of hexes patched, entities placed, routes made.
    let workingHexes = { ...hexes }
    const addedHexIds = []
    const undoPatches = {}
    const recordPriorValues = (hid, patch) => {
      const before = workingHexes[hid]
      if (!before) return
      const prior = undoPatches[hid] ?? {}
      for (const key of Object.keys(patch)) {
        if (!(key in prior)) prior[key] = before[key]
      }
      undoPatches[hid] = prior
    }

    if (needsCreation) {
      // No map yet — generate one sized for this batch
      const { hexes: generated } = generateHexes({ ...worldParams, hexCount: effectiveTarget })
      workingHexes = {}
      for (const h of generated) {
        workingHexes[h.id] = h
        addedHexIds.push(h.id)
      }
      setHexes(workingHexes)
    } else if (needsExpansion) {
      // Existing map is too small — expand it
      const newHexes = expandHexGrid(workingHexes, effectiveTarget, worldParams)
      if (newHexes.length > 0) {
        for (const h of newHexes) {
          workingHexes[h.id] = h
          addedHexIds.push(h.id)
        }
        mergeHexes(newHexes)
        // Propagate terrain across the expanded map before solving
        const terrainUpdates = propagateTerrain(workingHexes)
        for (const [hid, patch] of Object.entries(terrainUpdates)) {
          recordPriorValues(hid, patch)
          workingHexes[hid] = { ...workingHexes[hid], ...patch }
          updateHex(hid, patch)
        }
        // Smooth biome seams between the old map and the expansion
        const adjacencyUpdates = applyBiomeAdjacency(workingHexes, worldParams.weirdnessFactor)
        for (const [hid, patch] of Object.entries(adjacencyUpdates)) {
          recordPriorValues(hid, patch)
          workingHexes[hid] = { ...workingHexes[hid], ...patch }
          updateHex(hid, patch)
        }
      }
    }

    // Collect unique entities from all pending modules
    const entityIdSet = new Set()
    for (const modId of pendingBatch) {
      const mod = modules[modId]
      if (!mod) continue
      for (const eid of (mod.entities ?? [])) entityIdSet.add(eid)
      for (const eid of Object.keys(entities)) {
        if (entities[eid].sources?.includes(modId)) entityIdSet.add(eid)
      }
    }
    const batchEntities = [...entityIdSet].map((id) => entities[id]).filter(Boolean)

    // Build placed entity→hex map from working hexes
    const placedEntityHexes = {}
    for (const [hid, hex] of Object.entries(workingHexes)) {
      for (const eid of (hex.entityIds ?? [])) placedEntityHexes[eid] = hid
    }

    let result
    try {
      result = solve({ batchEntities, batchModules: pendingModules, allModules: modules, hexes: workingHexes, placedEntityHexes, worldParams })
    } catch (err) {
      result = {
        success: false,
        placements: {},
        conflicts: [{ entityId: 'error', entityName: 'Solver error', reason: err.message }],
        routes: [],
      }
    }

    // Fail loudly (per design): if the solver couldn't satisfy all hard constraints,
    // don't place anything and don't commit — keep the batch staged so the user can
    // resolve the conflicts and try again.
    if (!result.success) {
      setSolverResult(result)
      setSolverRunning(false)
      return
    }

    // Apply terraform patches first (hexes reshaped to meet an entity's
    // requirements), so terrain propagation below sees the reshaped state.
    // Recorded in undoPatches so revert restores the original terrain.
    if (result.terraformed) {
      for (const [hexId, patch] of Object.entries(result.terraformed)) {
        if (!workingHexes[hexId]) continue
        recordPriorValues(hexId, patch)
        workingHexes[hexId] = { ...workingHexes[hexId], ...patch }
        updateHex(hexId, patch)
      }
    }

    // Apply placements to hexStore — group by hex first to avoid last-write-wins overwrite
    const appliedPlacements = {}
    const appliedFootprints = {}
    if (result.placements && Object.keys(result.placements).length > 0) {
      // Build hex → [entityId…] map so we write each hex exactly once.
      // Multi-hex footprints put the entity in every hex it spans.
      const hexEntityMap = {}
      for (const [entityId, hexId] of Object.entries(result.placements)) {
        const span = result.footprints?.[entityId] ?? [hexId]
        if (span.length > 1) appliedFootprints[entityId] = span
        for (const hid of span) {
          if (!hexEntityMap[hid]) hexEntityMap[hid] = []
          hexEntityMap[hid].push(entityId)
        }
      }
      for (const [hexId, newEntityIds] of Object.entries(hexEntityMap)) {
        const hex = workingHexes[hexId]
        if (!hex) continue
        const existing = hex.entityIds ?? []
        const toAdd = newEntityIds.filter((id) => !existing.includes(id))
        if (toAdd.length > 0) {
          const merged = [...existing, ...toAdd]
          for (const id of toAdd) {
            // primary hex only — footprint spans are tracked separately
            if (result.placements[id] === hexId) appliedPlacements[id] = hexId
          }
          // Update the local snapshot so terrain propagation sees the right state
          workingHexes[hexId] = { ...hex, entityIds: merged }
          updateHex(hexId, { entityIds: merged })
        }
      }

      // Propagate terrain after placement
      const terrainUpdates = propagateTerrain(workingHexes)
      for (const [hexId, patch] of Object.entries(terrainUpdates)) {
        recordPriorValues(hexId, patch)
        updateHex(hexId, patch)
      }
    }

    if (result.routes?.length > 0) addRoutes(result.routes)

    // Recompute faction/nation territories and religion spread across the map
    // now that the batch's entities are placed. Diff-only patches; priors are
    // recorded so batch revert restores the previous territory state.
    const territoryPatches = generateTerritories(
      workingHexes,
      useEntityStore.getState().entities,
      [...routes, ...(result.routes ?? [])],
      worldParams,
    )
    for (const [hid, patch] of Object.entries(territoryPatches)) {
      recordPriorValues(hid, patch)
      workingHexes[hid] = { ...workingHexes[hid], ...patch }
      updateHex(hid, patch)
    }

    commitBatch({
      placements: appliedPlacements,
      footprints: appliedFootprints,
      routeIds: (result.routes ?? []).map((r) => r.id),
      addedHexIds,
      hexPatches: undoPatches,
      mapCreated: needsCreation,
    })
    setSolverResult(result)
    setSolverRunning(false)
    setHexTarget(null)  // reset to auto after commit
  }

  // ── Revert ─────────────────────────────────────────────────────────────────
  // Unwinds exactly what the commit recorded: placements, routes, added hexes,
  // and terrain patches. Module profiles are kept and return to uncommitted.
  const handleRevert = () => {
    if (!confirmRevert) { setConfirmRevert(true); return }
    if (lastBatch) {
      const { hexes: nextHexes, routes: nextRoutes } =
        applyBatchRevert(lastBatch, hexes, routes, { modules, entities })
      setHexes(nextHexes)
      setRoutes(nextRoutes)
    }
    revertLastBatch()
    setConfirmRevert(false)
    setSolverResult(null)
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 text-sm">
      {/* Header */}
      <div className="px-3 py-2 border-b border-slate-700/60 flex items-center gap-2 flex-shrink-0">
        <span className="text-xs text-slate-500 mr-auto">
          {moduleList.length} module{moduleList.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={openLibraryImport}
          className="text-xs px-2 py-1 rounded border border-slate-600 hover:border-slate-400 text-slate-400 hover:text-slate-200 transition-colors"
        >
          Import…
        </button>
        <button
          onClick={() => startEditingModule('new')}
          className="text-xs px-2 py-1 rounded bg-blue-800 hover:bg-blue-700 text-blue-200 transition-colors"
        >
          + Add
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {/* ── Solver result banner ──────────────────────────────────── */}
        {solverResult && (
          <section className={`border-b ${solverResult.success ? 'border-green-700/40' : 'border-amber-700/40'}`}>
            <div className={`px-3 py-2 ${solverResult.success ? 'bg-green-900/20' : 'bg-amber-900/20'}`}>
              <div className="flex items-center justify-between mb-1">
                <p className={`text-[10px] font-semibold uppercase tracking-wider ${solverResult.success ? 'text-green-400' : 'text-amber-400'}`}>
                  {(() => {
                    const placed = Object.keys(solverResult.placements ?? {}).length
                    const conflicts = solverResult.conflicts?.length ?? 0
                    if (solverResult.success)
                      return `Placed ${placed} entit${placed === 1 ? 'y' : 'ies'}`
                    return `Placement failed — ${conflicts} conflict${conflicts === 1 ? '' : 's'} (batch still staged)`
                  })()}
                </p>
                <button
                  onClick={() => setSolverResult(null)}
                  className="text-slate-600 hover:text-slate-400 text-xs"
                >✕</button>
              </div>
              {solverResult.conflicts?.length > 0 && (
                <ul className="space-y-0.5">
                  {solverResult.conflicts.map((c, i) => (
                    <li key={i} className="text-[10px] text-red-300">
                      <span className="text-red-400 font-medium">{c.entityName}:</span> {c.reason}
                    </li>
                  ))}
                </ul>
              )}
              {solverResult.warnings?.length > 0 && (
                <ul className="space-y-0.5 mt-1">
                  {solverResult.warnings.map((w, i) => (
                    <li key={i} className="text-[10px] text-amber-300/80">⚠ {w}</li>
                  ))}
                </ul>
              )}
              {solverResult.routes?.length > 0 && (
                <p className="text-[10px] text-slate-500 mt-1">
                  {solverResult.routes.length} route{solverResult.routes.length === 1 ? '' : 's'} generated
                </p>
              )}
            </div>
          </section>
        )}

        {/* ── Pending batch ─────────────────────────────────────────── */}
        {pendingBatch.length > 0 && (
          <section className="border-b border-slate-700/60">
            <div className="px-3 pt-2 pb-2">
              <p className="text-[10px] font-semibold text-amber-500/80 uppercase tracking-wider mb-1.5">
                Pending Batch ({pendingBatch.length})
              </p>
              <ul className="space-y-1 mb-2">
                {pendingBatch.map((id) => {
                  const mod = modules[id]
                  if (!mod) return null
                  return (
                    <li key={id} className="flex items-center gap-2 text-xs">
                      <span className="text-slate-300 flex-1 truncate">{mod.name || 'Unnamed'}</span>
                      <button
                        onClick={() => unstageFromBatch(id)}
                        className="text-slate-600 hover:text-red-400 transition-colors"
                        title="Remove from batch"
                      >✕</button>
                    </li>
                  )
                })}
              </ul>

              {/* ── Hex sizing ───────────────────────────────────────── */}
              {hexEstimate.min > 0 && (
                <div className="border-t border-slate-700/40 pt-2 mt-1 mb-2">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                    Map Sizing
                  </p>
                  {/* Min / recommended labels */}
                  <div className="flex items-center gap-3 text-[10px] mb-1.5">
                    <span className="text-slate-600">
                      Min: <span className="text-slate-400">{hexEstimate.min}</span>
                    </span>
                    <span className="text-slate-700">·</span>
                    <span className="text-slate-600">
                      Rec: <span className="text-slate-300 font-medium">{hexEstimate.recommended}</span>
                    </span>
                  </div>
                  {/* Current map status */}
                  <p className={`text-[10px] mb-2 ${
                    needsCreation  ? 'text-blue-400' :
                    needsExpansion ? 'text-amber-400' :
                    'text-green-700'
                  }`}>
                    {needsCreation
                      ? 'No map yet — will generate on commit'
                      : needsExpansion
                        ? `Current: ${currentMapSize} hexes → will expand`
                        : `Current: ${currentMapSize} hexes ✓`
                    }
                  </p>
                  {/* Input + quick-set buttons */}
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={hexEstimate.min}
                      value={hexTarget ?? hexEstimate.recommended}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10)
                        setHexTarget(isNaN(v) ? null : Math.max(hexEstimate.min, v))
                      }}
                      className="w-16 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-slate-400"
                    />
                    <span className="text-[10px] text-slate-600">hexes</span>
                    <button
                      onClick={() => setHexTarget(hexEstimate.min)}
                      title="Use minimum"
                      className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                        hexTarget === hexEstimate.min
                          ? 'border-slate-500 text-slate-300'
                          : 'border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300'
                      }`}
                    >min</button>
                    <button
                      onClick={() => setHexTarget(null)}
                      title="Use recommended"
                      className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                        hexTarget === null
                          ? 'border-blue-600 text-blue-400'
                          : 'border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300'
                      }`}
                    >rec</button>
                  </div>
                </div>
              )}

              <button
                onClick={handleCommit}
                disabled={solverRunning}
                className="w-full py-1.5 text-xs rounded bg-amber-700 hover:bg-amber-600 text-white transition-colors disabled:opacity-40"
              >
                {solverRunning ? 'Solving…' : 'Commit Batch & Place →'}
              </button>
            </div>
          </section>
        )}

        {/* ── Last committed batch revert ───────────────────────────── */}
        {lastBatch && (
          <section className="border-b border-slate-700/60 px-3 py-2">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Last Batch ({lastBatch.moduleIds.length} module{lastBatch.moduleIds.length !== 1 ? 's' : ''})
            </p>
            <p className="text-[10px] text-slate-600 mb-1.5">
              {new Date(lastBatch.committedAt).toLocaleString()}
            </p>
            <button
              onClick={handleRevert}
              onMouseLeave={() => setConfirmRevert(false)}
              className={`text-xs px-2 py-1 rounded border transition-colors ${
                confirmRevert
                  ? 'border-red-600 bg-red-900/30 text-red-300'
                  : 'border-slate-600 text-slate-400 hover:border-red-600 hover:text-red-400'
              }`}
            >
              {confirmRevert ? 'Confirm revert batch' : 'Revert last batch'}
            </button>
          </section>
        )}

        {/* ── All modules ───────────────────────────────────────────── */}
        {moduleList.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-slate-600">
            No modules yet.
          </div>
        ) : (
          <ul>
            {moduleList.map((mod) => {
              const isCommitted = committedIds.has(mod.id)
              const isPending   = pendingBatch.includes(mod.id)
              const eCount      = entityCountForModule(mod)
              return (
                <li key={mod.id} className="border-b border-slate-700/30">
                  <div className="flex items-start gap-2 px-3 py-2 hover:bg-slate-800/40 transition-colors">
                    <input
                      type="checkbox"
                      checked={isPending}
                      disabled={isCommitted}
                      onChange={(e) =>
                        e.target.checked ? stageForBatch(mod.id) : unstageFromBatch(mod.id)
                      }
                      title={isCommitted ? 'Already in a committed batch' : 'Stage for next batch'}
                      className="mt-0.5 accent-amber-500 cursor-pointer disabled:cursor-not-allowed"
                    />
                    <button
                      onClick={() => startEditingModule(mod.id)}
                      className="flex-1 text-left min-w-0"
                    >
                      <p className="text-xs text-slate-200 truncate font-medium">
                        {mod.name || <span className="italic text-slate-500">Unnamed</span>}
                      </p>
                      <p className="text-[10px] text-slate-600 flex items-center gap-2 mt-0.5">
                        {mod.system && <span>{mod.system}</span>}
                        {mod.difficulty && <span className="capitalize">{mod.difficulty}</span>}
                        {eCount > 0 && <span>{eCount} entit{eCount === 1 ? 'y' : 'ies'}</span>}
                        {isCommitted && <span className="text-green-700">committed</span>}
                        {isPending && !isCommitted && <span className="text-amber-600">staged</span>}
                      </p>
                      {Array.isArray(mod.toneKeywords) && mod.toneKeywords.length > 0 && (
                        <p className="text-[10px] text-slate-700 truncate mt-0.5">
                          {mod.toneKeywords.join(', ')}
                        </p>
                      )}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
