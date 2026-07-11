import { readJson, writeJson } from './fileSystem.js'
import { useWorldStore } from '../store/worldStore.js'
import { useHexStore } from '../store/hexStore.js'
import { useEntityStore } from '../store/entityStore.js'
import { useModuleStore } from '../store/moduleStore.js'

const WORLD_PARAMS_KEYS = [
  'hexCount', 'dimensions', 'hexSizeMiles', 'mapShape',
  'settlementDensity', 'politicalFragmentation', 'dangerDistribution',
  'magicDensity', 'ageOfWorld', 'weirdnessFactor', 'biomeDistribution',
  'systemPreset', 'travelSpeedAssumptions', 'currentSeason',
]

// world.json files written before the weirdnessFactor rename used misspelled
// keys (both spellings existed). Migrate them on load; saves write only the
// correct key. Exported for tests.
export function normalizeWorldData(worldData) {
  if (!worldData || typeof worldData !== 'object') return worldData
  const { weirndesseFactor, weirndessFactor, ...rest } = worldData
  if (rest.weirdnessFactor === undefined) {
    const legacy = weirndesseFactor ?? weirndessFactor
    if (legacy !== undefined) rest.weirdnessFactor = legacy
  }
  return rest
}

export async function saveWorld(dirHandle) {
  const ws = useWorldStore.getState()
  const hs = useHexStore.getState()
  const es = useEntityStore.getState()
  const ms = useModuleStore.getState()

  const worldData = {}
  for (const k of WORLD_PARAMS_KEYS) worldData[k] = ws[k]

  await Promise.all([
    writeJson(dirHandle, 'world.json',    worldData),
    writeJson(dirHandle, 'hexes.json',    Object.values(hs.hexes)),
    writeJson(dirHandle, 'routes.json',   hs.routes),
    writeJson(dirHandle, 'entities.json', es.entities),
    writeJson(dirHandle, 'modules.json',  ms.modules),
    writeJson(dirHandle, 'batches.json',  ms.batches),
  ])
}

export async function loadWorld(dirHandle) {
  const [worldData, hexArray, routes, entities, modules, batches] = await Promise.all([
    readJson(dirHandle, 'world.json'),
    readJson(dirHandle, 'hexes.json'),
    readJson(dirHandle, 'routes.json').catch(() => []),
    readJson(dirHandle, 'entities.json'),
    readJson(dirHandle, 'modules.json'),
    readJson(dirHandle, 'batches.json'),
  ])

  if (worldData) {
    useWorldStore.getState().hydrate(normalizeWorldData(worldData))
  }

  if (hexArray) {
    const byId = {}
    for (const h of hexArray) byId[h.id] = h
    useHexStore.getState().hydrate(byId)
  }

  useHexStore.getState().hydrateRoutes(routes ?? [])

  if (entities) {
    useEntityStore.getState().hydrate(entities)
  }

  if (modules !== null || batches !== null) {
    useModuleStore.getState().hydrate({
      modules: modules ?? {},
      batches: batches ?? [],
    })
  }
}

// Returns true if the directory looks like a saved world
export async function isWorldDirectory(dirHandle) {
  try {
    await dirHandle.getFileHandle('world.json')
    return true
  } catch {
    return false
  }
}
