// ---------------------------------------------------------------------------
// Character system — public exports
// ---------------------------------------------------------------------------

// Seeder
export { seedFromName, seededRandom, seededRngFromKey } from './seeder'
export type {
  CharacterAppearance,
  HairStyle,
  OutfitStyle,
  HobbyType,
  PersonalityBias,
} from './seeder'

// Mesh
export { buildCharacterMesh } from './mesh'
export type { CharacterMesh, CharacterMeshParts } from './mesh'

// State machine
export { CharacterStateMachine } from './stateMachine'
export type {
  TopLevelState,
  ActiveSubState,
  SleepingState,
  MovingState,
  PerformingState,
  TransitioningState,
  CharacterStateData,
} from './stateMachine'

// Needs
export {
  advanceNeeds,
  applyActivityEffect,
  applyInstantActivityEffect,
  getMostUrgentNeed,
  getMostUrgentNeedValue,
  hasAnyCriticalNeed,
  getCriticalNeeds,
  CRITICAL_NEED_THRESHOLD,
  DEFAULT_NEEDS,
} from './needs'
export type { Needs } from './needs'

// Schedule
export {
  selectNextActivity,
  getInitialActivity,
  describeActivity,
} from './schedule'
export type { GameClock, ActivitySelection } from './schedule'

// Pathfinder
export {
  findPath,
  requiresStaircase,
  getPositionAlongLeg,
  getPositionAlongPath,
  getStaircasePosition,
  getFacingAngle,
  validateAdjacencyGraph,
} from './pathfinder'

// Animations
export {
  applyAnimation,
  advanceAnimation,
  activityToAnimation,
  createAnimationState,
} from './animations'
export type { AnimationName, AnimationState } from './animations'

// Phrases
export { PHRASES, pickPhrase, selectPhraseCategory } from './phrases'
export type { PhraseCategory } from './phrases'

// Main character class
export { Character, REAL_SECONDS_PER_GAME_MINUTE } from './character'
export type { CharacterState } from './character'
