// ---------------------------------------------------------------------------
// Character animations — keyframe helpers for voxel character mesh
// ---------------------------------------------------------------------------
//
// Each animation manipulates the body part mesh transforms (position/rotation)
// of the CharacterMeshParts. Body part pivots are set up in mesh.ts so that
// rotations happen around natural joint positions.
//
// Animation progress loops from 0 to 1. deltaTime advances progress at a
// rate determined by the animation's playback speed.

import * as THREE from 'three'
import type { CharacterMeshParts } from './mesh'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AnimationName =
  | 'walk'
  | 'sit'
  | 'sleep'
  | 'eat'
  | 'type'
  | 'idle'
  | 'climb_stairs'
  | 'paint'
  | 'play_instrument'
  | 'tinker'
  | 'relax'
  | 'watch_tv'
  | 'read'
  | 'bathe'
  | 'groom'
  | 'dress'
  | 'rummage'
  | 'water_plant'

export interface AnimationState {
  name: AnimationName
  /** Looping progress in [0, 1] */
  progress: number
}

// ---------------------------------------------------------------------------
// Playback speeds (full cycles per second of real time)
// ---------------------------------------------------------------------------

const ANIMATION_SPEED: Readonly<Record<AnimationName, number>> = {
  walk: 1.5, // fast walk cycle
  sit: 0.5, // slow settle
  sleep: 0.1, // very slow breathing
  eat: 0.6, // medium paced
  type: 2.0, // rapid typing
  idle: 0.3, // slow breathing
  climb_stairs: 1.2, // slightly slower than walk
  paint: 0.5, // slow deliberate strokes
  play_instrument: 1.0, // moderate tempo
  tinker: 0.8, // medium paced
  relax: 0.2, // very slow
  watch_tv: 0.15, // almost still
  read: 0.25, // page turns occasionally
  bathe: 0.4,
  groom: 0.5,
  dress: 0.4,
  rummage: 0.7,
  water_plant: 0.4, // slow pouring motion
}

// ---------------------------------------------------------------------------
// Helper math
// ---------------------------------------------------------------------------

/** Oscillates between -1 and 1 using a sine wave */
function oscillate(progress: number, phaseOffset = 0, amplitude = 1): number {
  return Math.sin((progress + phaseOffset) * Math.PI * 2) * amplitude
}

/** Clamps a value to [min, max] */
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

// ---------------------------------------------------------------------------
// Animation implementations
// ---------------------------------------------------------------------------

/**
 * Walk cycle: oscillate arms and legs in opposition.
 * Arms swing forward/back; legs stride forward/back.
 */
function applyWalk(parts: CharacterMeshParts, progress: number): void {
  const swing = oscillate(progress, 0, 0.4) // ±0.4 rad arm swing

  // Arms swing opposite to each other (and opposite to their legs)
  parts.leftArm.rotation.x = swing
  parts.rightArm.rotation.x = -swing

  // Legs stride
  parts.leftLeg.rotation.x = -swing
  parts.rightLeg.rotation.x = swing

  // Slight body bob
  parts.body.position.y = 1.95 + Math.abs(oscillate(progress, 0, 0.04))

  // Head stays upright
  parts.head.rotation.x = 0
  parts.head.rotation.z = 0
}

/**
 * Sit: legs bent, slight forward torso lean.
 * This is a transition/settled pose rather than a looping cycle.
 */
function applySit(parts: CharacterMeshParts, progress: number): void {
  // Legs rotate forward at hips (~90 degrees when fully sitting)
  const legAngle = (Math.PI / 2) * clamp(progress * 2, 0, 1)
  parts.leftLeg.rotation.x = legAngle
  parts.rightLeg.rotation.x = legAngle

  // Torso leans forward slightly
  parts.body.rotation.x = 0.15 * clamp(progress * 2, 0, 1)

  // Arms rest at sides (slight angle outward)
  parts.leftArm.rotation.x = 0
  parts.rightArm.rotation.x = 0
  parts.leftArm.rotation.z = 0.1
  parts.rightArm.rotation.z = -0.1
}

/**
 * Sleep: character lies flat. Rotate the whole figure 90 degrees on Z.
 * Slow breathing oscillation on the torso scale.
 */
function applySleep(parts: CharacterMeshParts, progress: number): void {
  // Arms rest at sides
  parts.leftArm.rotation.x = 0
  parts.rightArm.rotation.x = 0
  parts.leftArm.rotation.z = 0.15
  parts.rightArm.rotation.z = -0.15

  // Legs straight
  parts.leftLeg.rotation.x = 0
  parts.rightLeg.rotation.x = 0

  // Gentle breathing: slight body scale oscillation
  const breathe = 1 + oscillate(progress, 0, 0.015)
  parts.body.scale.set(1, breathe, breathe)
  parts.head.rotation.z = oscillate(progress, 0, 0.02)
}

/**
 * Eat: bob head forward and back, raise one arm occasionally.
 */
function applyEat(parts: CharacterMeshParts, progress: number): void {
  // Head dips forward
  parts.head.rotation.x = oscillate(progress, 0, 0.15)

  // Right arm raises to bring food to mouth
  parts.rightArm.rotation.x = -(Math.PI / 4) + oscillate(progress, 0.25, 0.1)
  parts.leftArm.rotation.x = oscillate(progress, 0, 0.05)

  // Legs steady
  parts.leftLeg.rotation.x = 0
  parts.rightLeg.rotation.x = 0
}

/**
 * Type: rapid alternating arm oscillation; slight torso lean forward.
 */
function applyType(parts: CharacterMeshParts, progress: number): void {
  // Both arms move up/down alternately (typing motion)
  parts.leftArm.rotation.x = -(Math.PI / 6) + oscillate(progress, 0, 0.12)
  parts.rightArm.rotation.x = -(Math.PI / 6) + oscillate(progress, 0.5, 0.12)

  // Torso leans slightly forward
  parts.body.rotation.x = 0.12

  // Head tilts down slightly toward keyboard
  parts.head.rotation.x = 0.1

  parts.leftLeg.rotation.x = 0
  parts.rightLeg.rotation.x = 0
}

/**
 * Idle: subtle breathing effect on body scale; slight head sway.
 */
function applyIdle(parts: CharacterMeshParts, progress: number): void {
  // Breathing
  const breathe = 1 + oscillate(progress, 0, 0.012)
  parts.body.scale.set(1, breathe, 1)

  // Gentle head sway
  parts.head.rotation.z = oscillate(progress, 0.1, 0.025)

  // Arms hang naturally with slight sway
  parts.leftArm.rotation.x = oscillate(progress, 0, 0.04)
  parts.rightArm.rotation.x = oscillate(progress, 0.5, 0.04)
  parts.leftArm.rotation.z = 0.05
  parts.rightArm.rotation.z = -0.05

  parts.leftLeg.rotation.x = 0
  parts.rightLeg.rotation.x = 0

  // Reset torso lean
  parts.body.rotation.x = 0
  parts.body.position.y = 1.95
}

/**
 * Climb stairs: exaggerated walk cycle with higher knee lift.
 */
function applyClimbStairs(parts: CharacterMeshParts, progress: number): void {
  const swing = oscillate(progress, 0, 0.5)

  parts.leftArm.rotation.x = swing * 0.8
  parts.rightArm.rotation.x = -swing * 0.8

  // Higher knee lift for stairs
  parts.leftLeg.rotation.x = -swing
  parts.rightLeg.rotation.x = swing

  // More pronounced body bob
  parts.body.position.y = 1.95 + Math.abs(oscillate(progress, 0, 0.08))
}

/**
 * Paint: extend one arm outward toward easel, slow deliberate strokes.
 */
function applyPaint(parts: CharacterMeshParts, progress: number): void {
  // Right arm makes slow painting strokes
  parts.rightArm.rotation.x = -(Math.PI / 4) + oscillate(progress, 0, 0.2)
  parts.rightArm.rotation.z = -oscillate(progress, 0.25, 0.15)

  // Left arm rests (holding palette)
  parts.leftArm.rotation.x = -(Math.PI / 8)
  parts.leftArm.rotation.z = 0.2

  // Slight torso lean
  parts.body.rotation.x = 0.08
  parts.head.rotation.x = 0.08
  parts.head.rotation.z = oscillate(progress, 0, 0.02)

  parts.leftLeg.rotation.x = 0
  parts.rightLeg.rotation.x = 0
}

/**
 * Play instrument: rhythmic arm movement; slight head bob.
 */
function applyPlayInstrument(parts: CharacterMeshParts, progress: number): void {
  // Both arms in playing position, alternating
  parts.leftArm.rotation.x = -(Math.PI / 4) + oscillate(progress, 0, 0.25)
  parts.rightArm.rotation.x = -(Math.PI / 4) + oscillate(progress, 0.5, 0.25)

  // Head bobs with the rhythm
  parts.head.rotation.z = oscillate(progress, 0, 0.06)

  parts.body.rotation.x = 0.05
  parts.leftLeg.rotation.x = 0
  parts.rightLeg.rotation.x = 0
}

/**
 * Tinker: hunched over workbench, arms moving at different rates.
 */
function applyTinker(parts: CharacterMeshParts, progress: number): void {
  parts.rightArm.rotation.x = -(Math.PI / 3) + oscillate(progress, 0, 0.15)
  parts.leftArm.rotation.x = -(Math.PI / 4) + oscillate(progress, 0.3, 0.1)
  parts.leftArm.rotation.z = 0.2
  parts.rightArm.rotation.z = -0.15

  // More pronounced forward hunch
  parts.body.rotation.x = 0.2
  parts.head.rotation.x = 0.15

  parts.leftLeg.rotation.x = 0
  parts.rightLeg.rotation.x = 0
}

/**
 * Relax: character settled on sofa, legs slightly extended, arms at rest.
 * Slow breathing.
 */
function applyRelax(parts: CharacterMeshParts, progress: number): void {
  // Legs slightly extended (like resting on sofa)
  parts.leftLeg.rotation.x = Math.PI / 4
  parts.rightLeg.rotation.x = Math.PI / 4

  // Arms resting on sides of sofa
  parts.leftArm.rotation.x = 0
  parts.rightArm.rotation.x = 0
  parts.leftArm.rotation.z = 0.3
  parts.rightArm.rotation.z = -0.3

  // Torso slightly reclined
  parts.body.rotation.x = -0.15

  // Slow breathing
  const breathe = 1 + oscillate(progress, 0, 0.01)
  parts.body.scale.set(1, breathe, 1)

  parts.head.rotation.x = 0
  parts.head.rotation.z = oscillate(progress, 0, 0.015)
}

/**
 * Watch TV: similar to relax but head tilted toward screen.
 */
function applyWatchTv(parts: CharacterMeshParts, progress: number): void {
  applyRelax(parts, progress)
  // Override head to look toward TV (tilt slightly)
  parts.head.rotation.y = -0.3
  parts.head.rotation.z = oscillate(progress, 0, 0.01)
}

/**
 * Read: arms raised holding book, head tilted down.
 */
function applyRead(parts: CharacterMeshParts, progress: number): void {
  // Both arms raised as if holding a book
  parts.leftArm.rotation.x = -(Math.PI / 3)
  parts.rightArm.rotation.x = -(Math.PI / 3)
  parts.leftArm.rotation.z = 0.25
  parts.rightArm.rotation.z = -0.25

  // Head tilted down to look at book
  parts.head.rotation.x = 0.25

  // Occasional page turn (arm dips and returns)
  const pageTurnCycle = Math.floor(progress * 3)
  const pageTurnLocal = (progress * 3) % 1
  if (pageTurnCycle % 3 === 2 && pageTurnLocal < 0.2) {
    parts.rightArm.rotation.x = -(Math.PI / 3) + oscillate(pageTurnLocal * 5, 0, 0.3)
  }

  parts.leftLeg.rotation.x = 0
  parts.rightLeg.rotation.x = 0
  parts.body.rotation.x = 0.1
}

/**
 * Bathe: arms moving as if washing, head bobbing slightly.
 */
function applyBathe(parts: CharacterMeshParts, progress: number): void {
  parts.leftArm.rotation.x = -(Math.PI / 4) + oscillate(progress, 0, 0.2)
  parts.rightArm.rotation.x = -(Math.PI / 4) + oscillate(progress, 0.5, 0.2)
  parts.leftArm.rotation.z = 0.3
  parts.rightArm.rotation.z = -0.3

  parts.head.rotation.z = oscillate(progress, 0, 0.03)
  parts.body.rotation.x = 0.1

  parts.leftLeg.rotation.x = 0
  parts.rightLeg.rotation.x = 0
}

/**
 * Groom: one arm raised to face level; slight head turns.
 */
function applyGroom(parts: CharacterMeshParts, progress: number): void {
  // Right arm raised (brushing hair / teeth)
  parts.rightArm.rotation.x = -(Math.PI / 2.5) + oscillate(progress, 0, 0.15)
  parts.rightArm.rotation.z = -0.1

  parts.leftArm.rotation.x = 0
  parts.leftArm.rotation.z = 0.1

  parts.head.rotation.y = oscillate(progress, 0, 0.1)
  parts.head.rotation.z = 0

  parts.body.rotation.x = 0
  parts.leftLeg.rotation.x = 0
  parts.rightLeg.rotation.x = 0
}

/**
 * Dress: arms cycling through putting-on-clothes motions.
 */
function applyDress(parts: CharacterMeshParts, progress: number): void {
  parts.leftArm.rotation.x = oscillate(progress, 0, 0.4)
  parts.rightArm.rotation.x = oscillate(progress, 0.5, 0.4)
  parts.leftArm.rotation.z = 0.15
  parts.rightArm.rotation.z = -0.15

  parts.head.rotation.x = 0
  parts.body.rotation.x = 0

  parts.leftLeg.rotation.x = oscillate(progress, 0.25, 0.2)
  parts.rightLeg.rotation.x = oscillate(progress, 0.75, 0.2)
}

/**
 * Rummage: hunched forward, arms digging into boxes.
 */
function applyRummage(parts: CharacterMeshParts, progress: number): void {
  parts.leftArm.rotation.x = -(Math.PI / 2) + oscillate(progress, 0, 0.3)
  parts.rightArm.rotation.x = -(Math.PI / 2) + oscillate(progress, 0.4, 0.3)
  parts.leftArm.rotation.z = 0.3
  parts.rightArm.rotation.z = -0.3

  parts.body.rotation.x = 0.3
  parts.head.rotation.x = 0.2

  parts.leftLeg.rotation.x = 0
  parts.rightLeg.rotation.x = 0
}

/**
 * Water plant: right arm raised holding watering can, tilted forward to pour.
 * Left arm at side. Body leaning slightly toward the plant.
 */
function applyWaterPlant(parts: CharacterMeshParts, progress: number): void {
  // Right arm raised and tilted, pouring from watering can
  parts.rightArm.rotation.x = -(Math.PI / 3) + oscillate(progress, 0, 0.08)
  parts.rightArm.rotation.z = -0.2

  // Left arm hangs at side
  parts.leftArm.rotation.x = -0.1
  parts.leftArm.rotation.z = 0.15

  // Slight forward lean toward plant
  parts.body.rotation.x = 0.15

  // Head looking down at plant
  parts.head.rotation.x = 0.2
  parts.head.rotation.z = oscillate(progress, 0, 0.02)

  parts.leftLeg.rotation.x = 0
  parts.rightLeg.rotation.x = 0
}

// ---------------------------------------------------------------------------
// Reset helper
// ---------------------------------------------------------------------------

/**
 * Resets all body parts to a neutral standing pose.
 * Called when switching animations to prevent stuck rotations.
 */
function resetPose(parts: CharacterMeshParts): void {
  parts.head.rotation.set(0, 0, 0)
  parts.body.rotation.set(0, 0, 0)
  parts.body.position.y = 1.95  // torso center in scaled mesh (top of legs = 1.2, torso half = 0.75)
  parts.body.scale.set(1, 1, 1)

  parts.leftArm.rotation.set(0, 0, 0)
  parts.rightArm.rotation.set(0, 0, 0)
  parts.leftLeg.rotation.set(0, 0, 0)
  parts.rightLeg.rotation.set(0, 0, 0)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Advances an animation state by deltaTime (in seconds).
 * Returns the new AnimationState with updated progress.
 */
export function advanceAnimation(
  state: AnimationState,
  deltaTime: number,
): AnimationState {
  const speed = ANIMATION_SPEED[state.name] ?? 0.5
  const newProgress = (state.progress + deltaTime * speed) % 1
  return { ...state, progress: newProgress }
}

/**
 * Applies the current animation frame to the character's mesh parts.
 * This should be called every render frame after advancing the animation state.
 *
 * @param parts     The character's body part meshes
 * @param animation The current animation state (name + progress)
 */
export function applyAnimation(
  parts: CharacterMeshParts,
  animation: AnimationState,
): void {
  const { name, progress } = animation

  // Reset each frame to avoid transform accumulation from different animations
  resetPose(parts)

  switch (name) {
    case 'walk':
      applyWalk(parts, progress)
      break
    case 'sit':
      applySit(parts, progress)
      break
    case 'sleep':
      applySleep(parts, progress)
      break
    case 'eat':
      applyEat(parts, progress)
      break
    case 'type':
      applyType(parts, progress)
      break
    case 'idle':
      applyIdle(parts, progress)
      break
    case 'climb_stairs':
      applyClimbStairs(parts, progress)
      break
    case 'paint':
      applyPaint(parts, progress)
      break
    case 'play_instrument':
      applyPlayInstrument(parts, progress)
      break
    case 'tinker':
      applyTinker(parts, progress)
      break
    case 'relax':
      applyRelax(parts, progress)
      break
    case 'watch_tv':
      applyWatchTv(parts, progress)
      break
    case 'read':
      applyRead(parts, progress)
      break
    case 'bathe':
      applyBathe(parts, progress)
      break
    case 'groom':
      applyGroom(parts, progress)
      break
    case 'dress':
      applyDress(parts, progress)
      break
    case 'rummage':
      applyRummage(parts, progress)
      break
    case 'water_plant':
      applyWaterPlant(parts, progress)
      break
    default:
      applyIdle(parts, progress)
  }
}

/**
 * Maps an ActivityType to the most appropriate AnimationName.
 */
export function activityToAnimation(
  activity: import('../rooms').ActivityType,
): AnimationName {
  const map: Record<import('../rooms').ActivityType, AnimationName> = {
    relax: 'relax',
    watch_tv: 'watch_tv',
    read: 'read',
    cook: 'type', // reuse type animation (hands active at counter)
    eat: 'eat',
    sleep: 'sleep',
    dress: 'dress',
    work: 'read', // reuse read pose (looking at screen)
    type: 'type',
    bathe: 'bathe',
    groom: 'groom',
    paint: 'paint',
    play_instrument: 'play_instrument',
    tinker: 'tinker',
    rummage: 'rummage',
    use_bathroom: 'sit',
    water_plant: 'water_plant',
    idle: 'idle',
  }
  return map[activity] ?? 'idle'
}

/**
 * Creates a new animation state for the given animation name.
 */
export function createAnimationState(name: AnimationName): AnimationState {
  return { name, progress: 0 }
}
