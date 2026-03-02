// ---------------------------------------------------------------------------
// Character — main class that wires together all subsystems
// ---------------------------------------------------------------------------
//
// The Character class is the single entry point for the character simulation.
// It owns:
//   - The Three.js mesh (visual representation)
//   - The state machine (what the character is doing)
//   - The needs system (hunger, sleep, hygiene, entertainment)
//   - The schedule system (what to do next)
//   - The pathfinder (how to get there)
//   - The animation system (how to look while doing it)
//
// Usage:
//   const char = new Character('Alice', scene, savedState)
//   // in render loop:
//   char.update(deltaTime)
//   // to save:
//   const state = char.getState()

import * as THREE from 'three'
import { seedFromName } from './seeder'
import { buildCharacterMesh } from './mesh'
import type { CharacterMesh } from './mesh'
import { attachClothing } from './accessories'
import type { ClothingItem } from '@/lib/characterSchema'
import { CharacterStateMachine } from './stateMachine'
import type { CharacterStateData } from './stateMachine'
import { advanceNeeds, applyActivityEffect, DEFAULT_NEEDS } from './needs'
import type { Needs } from './needs'
import {
  selectNextActivity,
  getInitialActivity,
  describeActivity,
} from './schedule'
import type { GameClock } from './schedule'
import { findPath, getPositionAlongPath } from './pathfinder'
import {
  applyAnimation,
  advanceAnimation,
  activityToAnimation,
  createAnimationState,
} from './animations'
import type { AnimationState } from './animations'
import type { RoomId, ActivityType, Room } from '../rooms'
import { ROOM_MAP } from '../rooms'
import type { StairXPerFloor } from '@/lib/layout'
import { pickPhrase, selectPhraseCategory } from './phrases'
import { deriveMood, applyFaceExpression } from './face'
import type { SfxEngine } from '../sfx/engine'
import {
  createFootstepDetectorState,
  detectFootsteps,
} from '../sfx/footstepDetector'
import type { FootstepDetectorState } from '../sfx/footstepDetector'

// ---------------------------------------------------------------------------
// Configurable constants
// ---------------------------------------------------------------------------

/**
 * How many real seconds equal one in-game minute.
 * Default: 1 real second = 10 game minutes (so 1 real minute = 10 game hours,
 * and a full game day takes 2.4 real minutes).
 *
 * Adjust this to change simulation speed.
 */
export const REAL_SECONDS_PER_GAME_MINUTE = 1 / 10

/** Movement speed: how many path-leg progress units per real second */
const MOVEMENT_SPEED = 0.2

/** Plant health decay rate per game hour (dies in ~96 game hours = 4 game days) */
const PLANT_DECAY_RATE = 1.0 / 96
/** Plant health restoration rate per game hour during water_plant activity */
const PLANT_RESTORE_RATE = 2.0

/** Y offset above floor so character's back rests on the duvet surface */
const SLEEP_Y_ABOVE_FLOOR = 1.45
/** Z position of feet near headboard when sleeping (6.5 = bed center, clear of back wall at z=7.0) */
const SLEEP_FEET_Z = 6.5

/** Staircase traversal speed: progress units per real second */
const STAIRCASE_SPEED = 0.3

// ---------------------------------------------------------------------------
// Persisted state interface
// ---------------------------------------------------------------------------

export interface CharacterState {
  name: string
  currentRoom: RoomId
  currentActivity: ActivityType
  needs: Needs
  clock: GameClock
  position: { x: number; y: number; z: number }
  accessories: ClothingItem[]
  plantHealth?: number
}

// ---------------------------------------------------------------------------
// Thought bubble configuration
// ---------------------------------------------------------------------------

/** How long a thought stays visible (real seconds) */
const THOUGHT_DURATION = 10
/** Minimum quiet period between thoughts (real seconds) */
const THOUGHT_COOLDOWN_MIN = 15
/** Maximum quiet period between thoughts (real seconds) */
const THOUGHT_COOLDOWN_MAX = 30
/** Short gap between queued chat-trigger phrases (real seconds) */
const QUEUED_THOUGHT_GAP = 3

// ---------------------------------------------------------------------------
// Main Character class
// ---------------------------------------------------------------------------

export class Character {
  private readonly name: string
  private readonly scene: THREE.Scene
  private readonly mesh: CharacterMesh
  private readonly fsm: CharacterStateMachine
  private roomMap: Readonly<Record<RoomId, Room>>
  private stairXPerFloor: StairXPerFloor
  private needs: Needs
  private clock: GameClock
  private currentRoom: RoomId
  private currentActivity: ActivityType
  private animationState: AnimationState
  private currentThought: string | null = null
  /** Counts down in real seconds while a thought is visible */
  private thoughtTimer = 0
  /** Counts down in real seconds during the quiet gap between thoughts */
  private thoughtCooldown = 0
  /** Monotonically increasing seed so consecutive picks stay varied */
  private thoughtSeed = 0
  /** Visitor message queued for display; consumed on next stationary frame */
  private _injectedThought: string | null = null
  /** Additional chat-trigger phrases waiting to be shown after the first */
  private _thoughtQueue: string[] = []
  /** Clothing items currently worn by this character */
  private _accessories: ClothingItem[] = []
  /** Clothing item queued to be applied after the next 'dress' activity completes */
  private _clothingQueue: ClothingItem | null = null
  /** SFX engine for procedural sound synthesis (null if audio unavailable) */
  private sfx: SfxEngine | null = null
  /** Tracks animation progress to detect foot-down moments */
  private footstepDetector: FootstepDetectorState = createFootstepDetectorState()
  /**
   * When a command interrupts mid-movement, stores the character's exact world
   * position so the first leg of the new path can lerp smoothly from there
   * instead of snapping to a room center.
   */
  private _moveFromPosition: THREE.Vector3 | null = null

  /**
   * Captures the character's current world position for smooth first-leg lerp.
   * Snaps Y to the effective room's floor level so the lerp stays horizontal
   * when the character was interrupted mid-staircase (prevents floating
   * diagonally through the air or dropping below the floor).
   */
  private _capturePosition(effectiveRoom: RoomId): void {
    this._moveFromPosition = this.mesh.group.position.clone()
    this._moveFromPosition.y = this.roomMap[effectiveRoom].center.y
  }
  /** Plant health [0–1]: 1 = lush green, 0 = dead brown */
  private _plantHealth = 1.0

  constructor(
    name: string,
    scene: THREE.Scene,
    initialState?: CharacterState,
    sfx?: SfxEngine,
    roomMap?: Readonly<Record<RoomId, Room>>,
    stairXPerFloor?: StairXPerFloor,
  ) {
    this.name = name
    this.scene = scene
    this.roomMap = roomMap ?? ROOM_MAP
    this.stairXPerFloor = stairXPerFloor ?? { 1: 29.5, 2: 29.5, 3: 29.5 }

    // Build appearance from name seed
    const appearance = seedFromName(name)

    // Initialize accessories from saved state (before building mesh so hat appears immediately)
    if (initialState) {
      this._accessories = [...(initialState.accessories ?? [])]
      this._plantHealth = initialState.plantHealth ?? 1.0
    }

    // Build Three.js mesh (passes accessories so they render on first frame)
    this.mesh = buildCharacterMesh(appearance, this._accessories)
    scene.add(this.mesh.group)

    // Initialize state from saved state or defaults
    if (initialState) {
      this.needs = { ...initialState.needs }
      this.clock = { ...initialState.clock }
      this.currentRoom = initialState.currentRoom
      this.currentActivity = initialState.currentActivity
      this.mesh.group.position.set(
        initialState.position.x,
        initialState.position.y,
        initialState.position.z,
      )
    } else {
      this.needs = { ...DEFAULT_NEEDS }
      this.clock = { hour: 8, day: 0 } // Start at 8am on day 0
      const initial = getInitialActivity(name, this.roomMap)
      this.currentRoom = initial.room
      this.currentActivity = initial.activity
      // Place character at room center
      const room = this.roomMap[this.currentRoom]
      this.mesh.group.position.copy(room.center)
    }

    // Initialize animation
    this.animationState = createAnimationState(
      activityToAnimation(this.currentActivity),
    )

    // Initialize state machine to 'performing' the current activity
    this.fsm = new CharacterStateMachine({
      kind: 'active/performing',
      activity: this.currentActivity,
      durationHours: 0.5,
      elapsedHours: 0,
    })

    // Restore sleep state if character is sleeping
    if (this.currentActivity === 'sleep') {
      this.fsm.transitionToSleeping()
    }

    this.sfx = sfx ?? null
  }

  // -------------------------------------------------------------------------
  // Update loop
  // -------------------------------------------------------------------------

  /**
   * Called each animation frame. deltaTime is in real seconds.
   *
   * This method:
   *   1. Advances the game clock
   *   2. Updates needs (passive decay + activity effects)
   *   3. Advances the current FSM state
   *   4. Selects the next activity when current one completes
   *   5. Moves the character mesh along path
   *   6. Applies the appropriate animation
   *   7. Updates thought bubble
   */
  update(deltaTime: number): void {
    // --- 1. Advance game clock ---
    const deltaGameMinutes = deltaTime / REAL_SECONDS_PER_GAME_MINUTE
    const deltaGameHours = deltaGameMinutes / 60
    this.clock = this._advanceClock(this.clock, deltaGameHours)

    // --- 2. Advance needs ---
    const state = this.fsm.state
    if (state.kind === 'active/performing') {
      this.needs = applyActivityEffect(this.needs, state.activity, deltaGameHours)
    } else {
      this.needs = advanceNeeds(this.needs, deltaGameHours)
    }

    // --- 2b. Plant health decay / restoration ---
    if (state.kind === 'active/performing' && state.activity === 'water_plant') {
      this._plantHealth = Math.min(1, this._plantHealth + PLANT_RESTORE_RATE * deltaGameHours)
    } else {
      this._plantHealth = Math.max(0, this._plantHealth - PLANT_DECAY_RATE * deltaGameHours)
    }

    // --- 3. Advance FSM and handle transitions ---
    switch (state.kind) {
      case 'sleeping':
        this._updateSleeping(deltaGameHours)
        break

      case 'active/performing':
        this._updatePerforming(deltaGameHours)
        break

      case 'active/moving':
        this._updateMoving(deltaTime)
        break

      case 'transitioning':
        this._updateTransitioning(deltaTime)
        break
    }

    // Restore upright rotation when not sleeping
    if (state.kind !== 'sleeping') {
      this.mesh.group.rotation.x = 0
    }

    // --- 4. Apply animation ---
    this.animationState = advanceAnimation(this.animationState, deltaTime)
    applyAnimation(this.mesh.parts, this.animationState)

    // --- 4b. Detect and play footstep sounds ---
    if (this.sfx) {
      const footstepEvents = detectFootsteps(
        this.footstepDetector,
        this.animationState,
      )
      for (const event of footstepEvents) {
        this.sfx.playFootstep(event.surface)
      }
    }

    // Rotate character to face movement direction if moving, or face the
    // camera (rotation.y = 0 → front face on -Z side) when stationary so
    // the face features are visible in the dollhouse view.
    if (state.kind === 'active/moving' || state.kind === 'transitioning') {
      this.mesh.group.rotation.y = this._getFacingAngleToRoom(this.currentRoom)
    } else if (state.kind !== 'sleeping') {
      this.mesh.group.rotation.y = 0
    }

    // --- 5. Update face expression based on mood ---
    const mood = deriveMood(this.needs, this.currentActivity)
    applyFaceExpression(this.mesh.face, mood)

    // --- 6. Update thought bubble ---
    this._updateThoughtBubble(deltaTime)
  }

  // -------------------------------------------------------------------------
  // Private update helpers
  // -------------------------------------------------------------------------

  private _updateSleeping(deltaGameHours: number): void {
    const room = this.roomMap[this.currentRoom]
    this.mesh.group.position.set(room.center.x, room.center.y + SLEEP_Y_ABOVE_FLOOR, SLEEP_FEET_Z)
    this.mesh.group.rotation.x = -Math.PI / 2

    this.fsm.advanceSleep(deltaGameHours)

    // Wake up after 6am or when sleep need drops below 0.1
    const hour = this.clock.hour % 24
    if (hour >= 6 && hour < 7 && this.needs.sleep < 0.3) {
      this._selectAndStartNextActivity()
    }

    // Ensure sleeping animation
    if (this.animationState.name !== 'sleep') {
      this.animationState = createAnimationState('sleep')
    }
  }

  private _updatePerforming(deltaGameHours: number): void {
    const done = this.fsm.advanceActivity(deltaGameHours)
    if (done) {
      // If a clothing item was queued and we just finished dressing, apply it now
      if (this.currentActivity === 'dress' && this._clothingQueue !== null) {
        this._applyClothing(this._clothingQueue)
        this._clothingQueue = null
      }
      this._selectAndStartNextActivity()
    }
  }

  private _updateMoving(deltaTime: number): void {
    const movingState = this.fsm.movingState  // snapshot before advancement
    if (!movingState) return

    const arrived = this.fsm.advanceMovement(deltaTime * MOVEMENT_SPEED)

    // Update mesh position — for the first leg of an interrupted path, lerp
    // from the actual world position captured at interrupt time so there is no
    // snap to a room center.
    let pos: THREE.Vector3
    if (this._moveFromPosition !== null && movingState.pathIndex === 1) {
      // Target = wherever leg 1 ends (staircase entry point, or next room center)
      const legEnd = getPositionAlongPath(
        movingState.path, 1, 1.0,
        this.roomMap, this.stairXPerFloor,
      )
      pos = new THREE.Vector3().lerpVectors(
        this._moveFromPosition, legEnd, movingState.legProgress,
      )
    } else {
      pos = getPositionAlongPath(
        movingState.path,
        movingState.pathIndex,
        movingState.legProgress,
        this.roomMap,
        this.stairXPerFloor,
      )
    }
    this.mesh.group.position.copy(pos)

    // Clear override once the first leg is complete (check post-advance state)
    if (this._moveFromPosition !== null && !arrived) {
      const postAdvance = this.fsm.movingState!
      if (postAdvance.pathIndex > 1) {
        this._moveFromPosition = null
      }
    }

    // Use climb_stairs animation when moving to or from the staircase room
    const destRoom = movingState.path[movingState.pathIndex]
    const fromRoom = movingState.path[movingState.pathIndex - 1]
    const onStaircase = destRoom === 'staircase' || fromRoom === 'staircase'
    if (onStaircase) {
      if (this.animationState.name !== 'climb_stairs') {
        this.animationState = createAnimationState('climb_stairs')
      }
    } else {
      if (this.animationState.name !== 'walk') {
        this.animationState = createAnimationState('walk')
      }
    }

    if (arrived) {
      this._moveFromPosition = null
      // Arrived at destination room
      const destRoom = movingState.path[movingState.path.length - 1]
      this.currentRoom = destRoom
      this.mesh.group.position.copy(this.roomMap[destRoom].center)

      // Start the queued activity
      const { activity, durationHours } = this._getQueuedActivity()
      this._startPerforming(activity, durationHours)
    }
  }

  private _updateTransitioning(deltaTime: number): void {
    const done = this.fsm.advanceStaircase(deltaTime * STAIRCASE_SPEED)

    if (this.animationState.name !== 'climb_stairs') {
      this.animationState = createAnimationState('climb_stairs')
    }

    if (done) {
      const transState = this.fsm.transitioningState
      if (transState) {
        this.currentRoom = transState.destinationRoom
        this.mesh.group.position.copy(this.roomMap[this.currentRoom].center)
        const { activity, durationHours } = this._getQueuedActivity()
        this._startPerforming(activity, durationHours)
      }
    }
  }

  // -------------------------------------------------------------------------
  // Activity selection and navigation
  // -------------------------------------------------------------------------

  private _queued: { activity: ActivityType; durationHours: number } | null = null

  /**
   * Returns the best room to start pathfinding from when interrupting movement.
   *
   * While moving, this.currentRoom still holds the origin room (only updated
   * on arrival). This method reads the active path state to find the last
   * real (non-staircase) room the character has fully passed through, or the
   * destination of the current leg when the character is exiting the staircase.
   */
  private _getEffectiveCurrentRoom(): RoomId {
    const state = this.fsm.state
    if (state.kind !== 'active/moving') return this.currentRoom

    const { path, pathIndex } = state
    const fromRoom = path[pathIndex - 1]
    const toRoom = path[pathIndex]

    // Coming off the staircase: character is already on the destination floor.
    // Use the destination room so the new path starts on the correct floor.
    if (fromRoom === 'staircase') return toRoom

    // All other cases (heading toward staircase, or same-floor leg at any
    // progress): snap back to fromRoom. Using toRoom here would jump the
    // character forward to a room center they haven't reached yet.
    return fromRoom
  }

  private _getQueuedActivity(): { activity: ActivityType; durationHours: number } {
    if (this._queued) {
      const q = this._queued
      this._queued = null
      return q
    }
    return { activity: 'idle', durationHours: 0.25 }
  }

  private _selectAndStartNextActivity(): void {
    const appearance = seedFromName(this.name)
    const selection = selectNextActivity(
      this.clock,
      this.needs,
      appearance.personalityBias,
      appearance.hobbyType,
      this.currentRoom,
      this.name,
      this.roomMap,
    )

    this.currentActivity = selection.activity

    if (selection.room === this.currentRoom) {
      // Already in the right room — just start the activity
      this._startPerforming(selection.activity, selection.durationHours)
    } else {
      // Need to navigate to a different room
      const path = findPath(
        this.currentRoom,
        selection.room,
        `${this.name}:path:${this.clock.day}:${Math.floor(this.clock.hour)}`,
        this.roomMap,
      )

      // Queue the activity to start upon arrival
      this._queued = {
        activity: selection.activity,
        durationHours: selection.durationHours,
      }

      this.fsm.transitionToMoving(path)
      this.animationState = createAnimationState('walk')
    }
  }

  private _startPerforming(activity: ActivityType, durationHours: number): void {
    this.currentActivity = activity

    if (activity === 'sleep') {
      this.fsm.transitionToSleeping()
      this.animationState = createAnimationState('sleep')
    } else {
      this.fsm.transitionToPerforming(activity, durationHours)
      this.animationState = createAnimationState(activityToAnimation(activity))
    }
  }

  // -------------------------------------------------------------------------
  // Utility helpers
  // -------------------------------------------------------------------------

  private _advanceClock(clock: GameClock, deltaHours: number): GameClock {
    let newHour = clock.hour + deltaHours
    let newDay = clock.day

    if (newHour >= 24) {
      newDay += Math.floor(newHour / 24)
      newHour = newHour % 24
    }

    return { hour: newHour, day: newDay }
  }

  private _getFacingAngleToRoom(roomId: RoomId): number {
    // Simple: face along X axis based on room position relative to world center
    const room = this.roomMap[roomId]
    const dx = room.center.x - 8 // 8 is approx house center x
    return dx > 0 ? 0 : Math.PI
  }

  // -------------------------------------------------------------------------
  // Thought bubble
  // -------------------------------------------------------------------------

  private _updateThoughtBubble(deltaTime: number): void {
    const state = this.fsm.state

    // Suppress thoughts while the character is walking or climbing stairs —
    // only show when idle or performing a stationary activity.
    const isStationary =
      state.kind === 'active/performing' || state.kind === 'sleeping'

    if (!isStationary) {
      // Clear any showing thought while moving.
      if (this.currentThought !== null) {
        this.currentThought = null
        this.thoughtTimer = 0
      }
      // If no injected thought is pending, this isn't the initial transit
      // from goToRoom — discard leftover queue so trigger phrases don't
      // leak into an unrelated room.
      if (this._injectedThought === null) {
        this._thoughtQueue = []
      }
      // Keep the cooldown ticking so thoughts don't appear the instant
      // the character stops moving.
      if (this.thoughtCooldown > 0) {
        this.thoughtCooldown -= deltaTime
      }
      return
    }

    // If a visitor message is queued and the character is stationary, show it now
    if (this._injectedThought !== null) {
      this.currentThought = this._injectedThought
      this._injectedThought = null
      this.thoughtTimer = THOUGHT_DURATION + 2
      this.thoughtCooldown = 0
      return
    }

    // If a thought is currently showing, count it down
    if (this.currentThought !== null) {
      this.thoughtTimer -= deltaTime
      if (this.thoughtTimer <= 0) {
        // Thought expired — use a short gap if more queued phrases remain
        this.currentThought = null
        this.thoughtCooldown = this._thoughtQueue.length > 0
          ? QUEUED_THOUGHT_GAP
          : THOUGHT_COOLDOWN_MIN +
            Math.random() * (THOUGHT_COOLDOWN_MAX - THOUGHT_COOLDOWN_MIN)
      }
      return
    }

    // No thought showing — tick the cooldown
    if (this.thoughtCooldown > 0) {
      this.thoughtCooldown -= deltaTime
      return
    }

    // Cooldown expired — drain queued phrases before falling through to auto
    if (this._thoughtQueue.length > 0) {
      this.currentThought = this._thoughtQueue.shift()!
      this.thoughtTimer = THOUGHT_DURATION
      return
    }

    // No queued phrases — pick a new automatic thought
    const activity =
      state.kind === 'active/performing' ? state.activity : 'sleep'
    const category = selectPhraseCategory(this.needs, activity)
    this.currentThought = pickPhrase(category, this.thoughtSeed++)
    this.thoughtTimer = THOUGHT_DURATION
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Returns the current in-game hour (0–24, fractional).
   * Used by the renderer for day/night lighting.
   */
  get hour(): number {
    return this.clock.hour
  }

  /**
   * Returns the current thought bubble text, or null if none is showing.
   * Returns null while the character is walking or climbing stairs.
   */
  getCurrentThought(): string | null {
    return this.currentThought
  }

  /**
   * Queues a visitor message to appear in the thought bubble.
   * Displayed immediately if the character is stationary; otherwise waits
   * until the next time they stop moving.  Clears any pending phrase queue
   * so a new message doesn't get followed by stale trigger phrases.
   */
  injectThought(text: string): void {
    this._injectedThought = text
    this._thoughtQueue = []
  }

  /**
   * Returns a serializable snapshot of the character's current state.
   * Suitable for sending to the backend for persistence.
   */
  getState(): CharacterState {
    return {
      name: this.name,
      currentRoom: this.currentRoom,
      currentActivity: this.currentActivity,
      needs: { ...this.needs },
      clock: { ...this.clock },
      position: {
        x: this.mesh.group.position.x,
        y: this.mesh.group.position.y,
        z: this.mesh.group.position.z,
      },
      accessories: [...this._accessories],
      plantHealth: this._plantHealth,
    }
  }

  /**
   * Wakes the character from sleep. Partially resets the sleep need so the
   * scheduler doesn't immediately choose to sleep again, then starts a brief
   * idle in the bedroom before the next scheduled activity.
   * No-op if the character is not currently sleeping.
   */
  wakeUp(responsePhrases: string[]): void {
    if (!this.fsm.isSleeping) return

    this._injectedThought = responsePhrases[0] ?? null
    this._thoughtQueue = responsePhrases.slice(1)

    // Partially satisfy sleep need so the critical-need check and schedule
    // don't force an immediate return to sleep.
    this.needs = { ...this.needs, sleep: Math.min(this.needs.sleep, 0.2) }

    // Stand the character up and idle for 2 game hours before the scheduler runs.
    const room = this.roomMap[this.currentRoom]
    this.mesh.group.position.copy(room.center)
    this.mesh.group.rotation.x = 0
    this._startPerforming('idle', 2)
  }

  /**
   * Interrupts the current activity and sends the character to a specific room
   * to perform the given activity.  The first response phrase is shown on
   * arrival; any additional phrases are queued and shown with short gaps
   * between them.
   */
  goToRoom(
    room: RoomId,
    activity: ActivityType,
    durationHours: number,
    responsePhrases: string[],
    deterministic?: boolean,
  ): void {
    this._injectedThought = responsePhrases[0] ?? null
    this._thoughtQueue = responsePhrases.slice(1)

    const effectiveRoom = this._getEffectiveCurrentRoom()
    this.currentRoom = effectiveRoom

    if (effectiveRoom === room) {
      this._moveFromPosition = null
      this._startPerforming(activity, durationHours)
    } else {
      this._capturePosition(effectiveRoom)
      const seed = deterministic
        ? undefined
        : `${this.name}:chat:${this.clock.day}:${Math.floor(this.clock.hour)}`
      const path = findPath(
        effectiveRoom,
        room,
        seed,
        this.roomMap,
      )
      this._queued = { activity, durationHours }
      this.fsm.transitionToMoving(path)
      this.animationState = createAnimationState('walk')
    }
  }

  /**
   * Rings the doorbell: the character reacts with surprise, walks to the
   * entrance hall, idles briefly, then resumes their normal schedule.
   * Uses drowsier reaction phrases when the character is sleeping.
   */
  ringDoorbell(): void {
    const isSleeping = this.fsm.state.kind === 'sleeping'
    const reactionCategory = isSleeping ? 'doorbell_sleeping' : 'doorbell_reaction'
    const reactionPhrase = pickPhrase(reactionCategory, this.thoughtSeed++)
    const entrancePhrase = pickPhrase('doorbell_entrance', this.thoughtSeed++)

    this._injectedThought = reactionPhrase
    this._thoughtQueue = [entrancePhrase]

    const effectiveRoom = this._getEffectiveCurrentRoom()
    this.currentRoom = effectiveRoom

    if (effectiveRoom === 'entrance') {
      this._moveFromPosition = null
      this._startPerforming('idle', 1)
    } else {
      this._capturePosition(effectiveRoom)
      const path = findPath(
        effectiveRoom,
        'entrance',
        `${this.name}:doorbell:${this.clock.day}:${Math.floor(this.clock.hour)}`,
        this.roomMap,
      )
      this._queued = { activity: 'idle', durationHours: 1 }
      this.fsm.transitionToMoving(path)
      this.animationState = createAnimationState('walk')
    }
  }

  /**
   * Walks the character to the bedroom wardrobe and puts on the given item.
   * The item is applied visually when the 'dress' activity completes.
   * No-op if the character is already wearing the item.
   */
  putOnClothes(item: ClothingItem): void {
    if (this._accessories.includes(item)) return
    this._clothingQueue = item

    const effectiveRoom = this._getEffectiveCurrentRoom()
    this.currentRoom = effectiveRoom

    if (effectiveRoom === 'bedroom') {
      this._moveFromPosition = null
      this._startPerforming('dress', 0.15)
    } else {
      this._capturePosition(effectiveRoom)
      const path = findPath(
        effectiveRoom,
        'bedroom',
        `${this.name}:dress:${this.clock.day}:${Math.floor(this.clock.hour)}`,
        this.roomMap,
      )
      this._queued = { activity: 'dress', durationHours: 0.15 }
      this.fsm.transitionToMoving(path)
      this.animationState = createAnimationState('walk')
    }
  }

  private _applyClothing(item: ClothingItem): void {
    if (this._accessories.includes(item)) return
    this._accessories.push(item)
    attachClothing(item, this.mesh.parts.head)
  }

  /**
   * Returns the current plant health [0–1].
   */
  get plantHealth(): number {
    return this._plantHealth
  }

  /**
   * Sends the character to the living room to water the plant.
   */
  waterPlant(responsePhrases: string[]): void {
    this._injectedThought = responsePhrases[0] ?? null
    this._thoughtQueue = responsePhrases.slice(1)

    const effectiveRoom = this._getEffectiveCurrentRoom()
    this.currentRoom = effectiveRoom

    if (effectiveRoom === 'living_room') {
      this._moveFromPosition = null
      this._startPerforming('water_plant', 0.5)
    } else {
      this._capturePosition(effectiveRoom)
      const path = findPath(
        effectiveRoom,
        'living_room',
        `${this.name}:water:${this.clock.day}:${Math.floor(this.clock.hour)}`,
        this.roomMap,
      )
      this._queued = { activity: 'water_plant', durationHours: 0.5 }
      this.fsm.transitionToMoving(path)
      this.animationState = createAnimationState('walk')
    }
  }

  /**
   * Returns a human-readable description of the character's current activity.
   */
  getActivityDescription(): string {
    return describeActivity(this.currentActivity)
  }

  /**
   * Returns the character's name.
   */
  getName(): string {
    return this.name
  }

  /**
   * Returns the Three.js group so the renderer can adjust camera/position.
   */
  getMeshGroup(): THREE.Group {
    return this.mesh.group
  }

  /**
   * Replaces the room map and staircase X positions after a layout swap.
   * If the character's current room moved, instantly repositions the mesh
   * to the new room center.
   */
  updateRoomMap(
    newRoomMap: Readonly<Record<RoomId, Room>>,
    newStairXPerFloor: StairXPerFloor,
  ): void {
    this.roomMap = newRoomMap
    this.stairXPerFloor = newStairXPerFloor

    // If mid-movement, cancel and snap to current room center
    const state = this.fsm.state
    if (state.kind === 'active/moving' || state.kind === 'transitioning') {
      const room = this.roomMap[this.currentRoom]
      if (room) {
        this.mesh.group.position.copy(room.center)
        this._startPerforming('idle', 0.25)
      }
    } else {
      // Snap to new center if the room moved
      const room = this.roomMap[this.currentRoom]
      if (room) {
        this.mesh.group.position.copy(room.center)
      }
    }
  }

  /**
   * Removes the character mesh from the scene and disposes all geometries
   * and materials to free GPU memory.
   */
  dispose(): void {
    this.scene.remove(this.mesh.group)

    this.mesh.group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose()
        if (Array.isArray(object.material)) {
          object.material.forEach((m) => m.dispose())
        } else {
          object.material.dispose()
        }
      }
    })
  }
}
