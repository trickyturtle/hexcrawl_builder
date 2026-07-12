import React from 'react'
import { useEntityStore } from '../../store/entityStore.js'
import { useModuleStore } from '../../store/moduleStore.js'
import { useUiStore } from '../../store/uiStore.js'
import { useVaultStore } from '../../store/vaultStore.js'
import { buildObsidianUri, resolveNoteLink, readNote, writeEntityNote } from '../../persistence/obsidianVault.js'
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
        <ReferencesSection entity={entity} entities={entities} />

        {entity.pdfReference && (
          <Section label="PDF">
            <p className="text-xs text-slate-400">
              {entity.pdfReference.file}
              {entity.pdfReference.page && ` — p.${entity.pdfReference.page}`}
            </p>
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

// Obsidian references: link opens via the URI scheme (vault-qualified when a
// vault is connected); the note body renders inline when the vault has it.
// With a vault connected and no note yet, entity notes can be written back.
function ReferencesSection({ entity, entities }) {
  const vaultHandle = useVaultStore((s) => s.vaultHandle)
  const vaultName = useVaultStore((s) => s.vaultName)
  const noteIndex = useVaultStore((s) => s.noteIndex)
  const updateEntity = useEntityStore((s) => s.updateEntity)

  // preview is keyed by note path so stale text never shows for another note
  const [preview, setPreview] = React.useState(null) // { path, text }
  const [writing, setWriting] = React.useState(false)

  const resolvedPath = entity.obsidianLink && noteIndex
    ? resolveNoteLink(noteIndex, entity.obsidianLink)
    : null

  React.useEffect(() => {
    if (!vaultHandle || !resolvedPath) return
    let cancelled = false
    readNote(vaultHandle, resolvedPath)
      .then((text) => {
        if (cancelled) return
        // strip frontmatter for the preview
        const body = text.replace(/^---\n[\s\S]*?\n---\n?/, '').trim()
        setPreview({
          path: resolvedPath,
          text: body.slice(0, 600) + (body.length > 600 ? '…' : ''),
        })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [vaultHandle, resolvedPath])

  const previewText = preview?.path === resolvedPath ? preview.text : null

  const handleWriteNote = async () => {
    if (!vaultHandle || writing) return
    setWriting(true)
    try {
      const { path } = await writeEntityNote(vaultHandle, entity, entities)
      updateEntity(entity.id, { obsidianLink: path })
      // refresh the index so the new note resolves immediately
      const { indexVault } = await import('../../persistence/obsidianVault.js')
      useVaultStore.getState().setVault(vaultHandle, await indexVault(vaultHandle))
    } finally {
      setWriting(false)
    }
  }

  if (!entity.obsidianLink && !vaultHandle) return null

  return (
    <Section label="Obsidian">
      {entity.obsidianLink ? (
        <>
          <button
            onClick={() => window.open(
              buildObsidianUri(vaultName, resolvedPath ?? entity.obsidianLink),
              '_blank', 'noreferrer',
            )}
            className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1 transition-colors"
          >
            <span>⬡</span>
            <span className="truncate">{entity.obsidianLink}</span>
          </button>
          {vaultHandle && !resolvedPath && (
            <p className="text-[10px] text-amber-500/70 mt-1">note not found in connected vault</p>
          )}
          {previewText && (
            <pre className="mt-1.5 text-[11px] text-slate-400 whitespace-pre-wrap leading-relaxed bg-slate-800/50 border border-slate-700/50 rounded px-2 py-1.5 max-h-48 overflow-y-auto font-sans">
              {previewText}
            </pre>
          )}
        </>
      ) : (
        <button
          onClick={handleWriteNote}
          disabled={writing}
          className="text-xs px-2 py-1 rounded border border-violet-800/60 hover:border-violet-600 text-violet-300/80 hover:text-violet-200 transition-colors disabled:opacity-40"
        >
          {writing ? 'Writing…' : '⬡ Write note to vault'}
        </button>
      )}
    </Section>
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
