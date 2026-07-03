import { v4 as uuidv4 } from 'uuid'

export function createRelationship(fields = {}) {
  return {
    id: uuidv4(),
    fromEntityId: null,
    toEntityId: null,
    label: '',
    description: '',
    directionality: 'bidirectional',
    impliesSpatialAccess: false,
    accessType: 'either',
    distanceConstraint: null,
    distanceIsHard: false,
    isPublicKnowledge: true,
    spatialException: '',
    ...fields,
  }
}
