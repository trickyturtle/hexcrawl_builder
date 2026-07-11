import React from 'react'
import { useEntityStore } from '../../store/entityStore.js'
import { useModuleStore } from '../../store/moduleStore.js'
import { useUiStore } from '../../store/uiStore.js'
import EntityBadge from '../ui/EntityBadge.jsx'
import HyperlinkText from '../ui/HyperlinkText.jsx'

export default function EntityDetail({ entityId }) {
  const entity = useEntityStore((s) => s.entities[entityId])
  const entities = useEntityStore((s) => s.entities)
  const modules = useModuleStore((s) => s.modules)
  const selectEntity = useUiStore((s) => s.selectEntity)
  const startEditingEntity = useUiStore((s) => s.startEditingEntity)

  if (!entity) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-slate-600">
        Entity not found
      </div>
    )
  }

  const sourceModules = (entity.sources ?? [])
    .map((id) => modules[id])
    .filter(Boolean)

  return (
    <div className="flex-1 overflow-y-auto text-sm">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-slate-700/40 bg-slate-800/30">
        <div className="flex items-start gap-2 mb-1">
          <EntityBadge subclass={entity.subclass} className="mt-0.5" />
          <h2 className="text-slate-100 font-semibold leading-snug flex-1">
            {entity.name || <span className="italic text-slate-500">Unnamed</span>}
          </h2>
          <button
            onClick={() => startEditingEntity(entity.id)}
            className="text-[10px] px-2 py-1 rounded border border-slate-600 hover:border-slate-400 text-slate-400 hover:text-slate-200 transition-colors shrink-0"
          >
            Edit
          </button>
        </div>
        <p className="text-[10px] font-mono text-slate-600">{entity.id}</p>
      </div>

      <div className="px-4 py-3 space-y-5">
        {/* ── Description ─────────────────────────────────────────── */}
        {entity.description && (
          <Section label="Description">
            <HyperlinkText
              text={entity.description}
              className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap block"
            />
          </Section>
        )}

        {/* ── Subclass fields ─────────────────────────────────────── */}
        {(entity.subclass === 'Faction' || entity.subclass === 'Nation') && (
          <Section label={entity.subclass === 'Nation' ? 'Nation' : 'Faction'}>
            <div className="space-y-1 text-xs">
              <div className="flex gap-2">
                <span className="text-slate-600 w-20 shrink-0">Home base</span>
                {entity.homeBaseEntityId && entities[entity.homeBaseEntityId] ? (
                  <button
                    onClick={() => selectEntity(entity.homeBaseEntityId)}
                    className="text-slate-200 hover:text-white hover:underline"
                  >
                    {entities[entity.homeBaseEntityId].name || 'Unnamed'}
                  </button>
                ) : (
                  <span className="text-slate-500 italic">own hex</span>
                )}
              </div>
              <div className="flex gap-2">
                <span className="text-slate-600 w-20 shrink-0">Territory</span>
                <span className="text-slate-400 capitalize">
                  {entity.territoryTendency ?? 'concentrated'} · {entity.territorySize ?? 'medium'}
                </span>
              </div>
              {entity.subclass === 'Nation' && entity.diplomaticStatus && (
                <div className="flex gap-2">
                  <span className="text-slate-600 w-20 shrink-0">Diplomacy</span>
                  <span className="text-slate-400">{entity.diplomaticStatus}</span>
                </div>
              )}
            </div>
          </Section>
        )}

        {entity.subclass === 'Event' && entity.timelinePosition && (
          <Section label="Timeline">
            <p className="text-xs text-slate-400">{entity.timelinePosition}</p>
          </Section>
        )}

        {/* ── Tags ────────────────────────────────────────────────── */}
        {entity.tags?.length > 0 && (
          <Section label="Tags">
            <div className="flex flex-wrap gap-1">
              {entity.tags.map((t) => (
                <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-400">
                  {t}
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* ── Sources (modules) ───────────────────────────────────── */}
        {sourceModules.length > 0 && (
          <Section label="Sources">
            <ul className="space-y-1">
              {sourceModules.map((mod) => (
                <li key={mod.id} className="text-xs flex items-center gap-2">
                  <span className="text-slate-300">{mod.name}</span>
                  {mod.system && <span className="text-slate-600">{mod.system}</span>}
                  {entity.pdfReference?.page && (
                    <span className="text-slate-600">p.{entity.pdfReference.page}</span>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* ── External links ──────────────────────────────────────── */}
        {(entity.obsidianLink || entity.pdfReference) && (
          <Section label="References">
            {entity.obsidianLink && (
              <ObsidianLink path={entity.obsidianLink} />
            )}
            {entity.pdfReference && (
              <p className="text-xs text-slate-400">
                PDF: {entity.pdfReference.file}
                {entity.pdfReference.page && ` — p.${entity.pdfReference.page}`}
              </p>
            )}
          </Section>
        )}

        {/* ── Location requirements ───────────────────────────────── */}
        {hasLocationRequirements(entity.locationRequirements) && (
          <Section label="Placement Constraints">
            <LocationRequirements req={entity.locationRequirements} entities={entities} />
          </Section>
        )}

        {/* ── Relationships ───────────────────────────────────────── */}
        <Section label={`Relationships${entity.relationships?.length ? ` (${entity.relationships.length})` : ''}`}>
          {!entity.relationships?.length ? (
            <p className="text-xs text-slate-600 italic">None defined</p>
          ) : (
            <ul className="space-y-2">
              {entity.relationships.map((rel, i) => (
                <RelationshipRow
                  key={rel.id ?? `${rel.fromEntityId}-${rel.toEntityId}-${i}`}
                  rel={rel}
                  currentEntityId={entity.id}
                  entities={entities}
                  onSelectEntity={selectEntity}
                />
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ label, children }) {
  return (
    <section>
      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
        {label}
      </p>
      {children}
    </section>
  )
}

function ObsidianLink({ path }) {
  const href = `obsidian://open?file=${encodeURIComponent(path)}`
  const isSafe = href.startsWith('obsidian://')

  const handleClick = (e) => {
    e.preventDefault()
    if (isSafe) window.open(href, '_blank', 'noreferrer')
  }

  return (
    <button
      onClick={handleClick}
      className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1 transition-colors"
    >
      <span>⬡</span>
      <span className="truncate">{path}</span>
    </button>
  )
}

function RelationshipRow({ rel, currentEntityId, entities, onSelectEntity }) {
  const isFrom = rel.fromEntityId === currentEntityId
  const otherId = isFrom ? rel.toEntityId : rel.fromEntityId
  const other = entities[otherId]

  return (
    <li className="text-xs border border-slate-700/50 rounded px-2 py-1.5 space-y-1">
      <div className="flex items-center gap-2">
        <DirectionalityArrow directionality={rel.directionality} isFrom={isFrom} />
        {other ? (
          <button
            onClick={() => onSelectEntity(other.id)}
            className="text-slate-200 hover:text-white hover:underline flex items-center gap-1.5"
          >
            <EntityBadge subclass={other.subclass} />
            <span>{other.name || <span className="italic text-slate-500">Unnamed</span>}</span>
          </button>
        ) : (
          <span className="text-slate-600 font-mono text-[10px]">{otherId ?? 'Unknown'}</span>
        )}
      </div>

      {rel.label && (
        <p className="text-slate-400 italic">"{rel.label}"</p>
      )}

      {rel.description && (
        <p className="text-slate-500 text-[11px] leading-relaxed">{rel.description}</p>
      )}

      <div className="flex flex-wrap gap-1 pt-0.5">
        {rel.impliesSpatialAccess && (
          <RelTag>{rel.accessType ?? 'access'} access</RelTag>
        )}
        {rel.distanceConstraint && (
          <RelTag>
            {rel.distanceConstraint.min ?? rel.distanceConstraint.minHexes ?? 0}
            –{rel.distanceConstraint.max ?? rel.distanceConstraint.maxHexes ?? '∞'} hexes
            {!rel.distanceIsHard && ' (soft)'}
          </RelTag>
        )}
        {!rel.isPublicKnowledge && <RelTag>secret</RelTag>}
        {rel.spatialException && <RelTag title={rel.spatialException}>exception</RelTag>}
      </div>
    </li>
  )
}

function DirectionalityArrow({ directionality, isFrom }) {
  if (directionality === 'bidirectional') return <span className="text-slate-500">↔</span>
  return <span className="text-slate-500">{isFrom ? '→' : '←'}</span>
}

function RelTag({ children, title }) {
  return (
    <span
      title={title}
      className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-500"
    >
      {children}
    </span>
  )
}

function hasLocationRequirements(req) {
  if (!req) return false
  return (
    req.terrainAffinity?.length > 0 ||
    req.biomeRequirements?.length > 0 ||
    req.elevationRequirements?.length > 0 ||
    req.proximityRequirements?.length > 0
  )
}

function LocationRequirements({ req, entities }) {
  return (
    <div className="space-y-1 text-xs">
      {req.terrainAffinity?.length > 0 && (
        <ReqRow label="Terrain" values={req.terrainAffinity} />
      )}
      {req.biomeRequirements?.length > 0 && (
        <ReqRow label="Biome" values={req.biomeRequirements} />
      )}
      {req.elevationRequirements?.length > 0 && (
        <ReqRow label="Elevation" values={req.elevationRequirements} />
      )}
      {req.proximityRequirements?.map((p, i) => {
        const targetId = p.entityId ?? p.targetEntityId
        const target = entities[targetId]
        return (
          <div key={i} className="flex gap-2 text-slate-400">
            <span className="text-slate-600">{p.isHard ? 'must' : 'prefer'}</span>
            <span>
              {p.minHexes}–{p.maxHexes} hexes from{' '}
              <span className="text-slate-300">{target?.name ?? targetId}</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

function ReqRow({ label, values }) {
  return (
    <div className="flex gap-2">
      <span className="text-slate-600 w-16 shrink-0">{label}</span>
      <span className="text-slate-400 capitalize">{values.join(', ')}</span>
    </div>
  )
}
