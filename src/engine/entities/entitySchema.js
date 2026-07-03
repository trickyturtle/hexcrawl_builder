import { v4 as uuidv4 } from 'uuid'

export const ENTITY_SUBCLASSES = [
  'Location',
  'Faction',
  'Nation',
  'Religion',
  'NPC',
  'GeographicFeature',
  'Event',
]

export function createEntity(fields = {}) {
  return {
    id: uuidv4(),
    name: '',
    description: '',
    subclass: 'Location',
    sources: [],
    // locale: optional string that groups entities within a module into geographic clusters.
    // Entities sharing a locale are placed near each other; entities in different locales
    // of the same module are pushed apart. e.g. 'keep', 'caves', 'dungeon', 'city'.
    locale: null,
    obsidianLink: null,
    pdfReference: null,
    relationships: [],
    locationRequirements: {
      terrainAffinity: [],
      biomeRequirements: [],
      elevationRequirements: [],
      proximityRequirements: [],
    },
    tags: [],
    ...fields,
  }
}
