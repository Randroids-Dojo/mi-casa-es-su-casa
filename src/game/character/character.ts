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
import type { RoomId, ActivityType } from '../rooms'
import { getRoom } from '../rooms'
import { pickPhrase, selectPhraseCategory } from './phrases'

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
const MOVEMENT_SPEED = 0.4

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

// ---------------------------------------------------------------------------
// Main Character class
// ---------------------------------------------------------------------------

export class Character {
  private readonly name: string
  private readonly scene: THREE.Scene
  private readonly mesh: CharacterMesh
  private readonly fsm: CharacterStateMachine
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
  /** Clothing items currently worn by this character */
  private _accessories: ClothingItem[] = []
  /** Clothing item queued to be applied after the next 'dress' activity completes */
  private _clothingQueue: ClothingItem | null = null

  constructor(name: string, scene: THREE.Scene, initialState?: CharacterState) {
    this.name = name
    this.scene = scene

    // Build appearance from name seed
    const appearance = seedFromName(name)

    // Initialize accessories from saved state (before building mesh so hat appears immediately)
    if (initialState) {
      this._accessories = [...(initialState.accessories ?? [])]
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
      const initial = getInitialActivity(name)
      this.currentRoom = initial.room
      this.currentActivity = initial.activity
      // Place character at room center
      const room = getRoom(this.currentRoom)
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

    // --- 4. Apply animation ---
    this.animationState = advanceAnimation(this.animationState, deltaTime)
    applyAnimation(this.mesh.parts, this.animationState)

    // Rotate character to face movement direction if moving
    if (state.kind === 'active/moving' || state.kind === 'transitioning') {
      this.mesh.group.rotation.y = this._getFacingAngleToRoom(this.currentRoom)
    }

    // --- 5. Update thought bubble ---
    this._updateThoughtBubble(deltaTime)
  }

  // -------------------------------------------------------------------------
  // Private update helpers
  // -------------------------------------------------------------------------

  private _updateSleeping(deltaGameHours: number): void {
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
    const movingState = this.fsm.movingState
    if (!movingState) return

    const arrived = this.fsm.advanceMovement(deltaTime * MOVEMENT_SPEED)

    // Update mesh position
    const pos = getPositionAlongPath(
      movingState.path,
      movingState.pathIndex,
      movingState.legProgress,
    )
    this.mesh.group.position.copy(pos)

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
      // Arrived at destination room
      const destRoom = movingState.path[movingState.path.length - 1]
      this.currentRoom = destRoom
      this.mesh.group.position.copy(getRoom(destRoom).center)

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
        this.mesh.group.position.copy(getRoom(this.currentRoom).center)
        const { activity, durationHours } = this._getQueuedActivity()
        this._startPerforming(activity, durationHours)
      }
    }
  }

  // -------------------------------------------------------------------------
  // Activity selection and navigation
  // -------------------------------------------------------------------------

  private _queued: { activity: ActivityType; durationHours: number } | null = null

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
    const room = getRoom(roomId)
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
      // Clear any showing thought while moving
      if (this.currentThought !== null) {
        this.currentThought = null
        this.thoughtTimer = 0
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
        // Thought expired — enter the quiet cooldown period
        this.currentThought = null
        this.thoughtCooldown =
          THOUGHT_COOLDOWN_MIN +
          Math.random() * (THOUGHT_COOLDOWN_MAX - THOUGHT_COOLDOWN_MIN)
      }
      return
    }

    // No thought showing — tick the cooldown
    if (this.thoughtCooldown > 0) {
      this.thoughtCooldown -= deltaTime
      return
    }

    // Cooldown expired — pick a new thought
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
   * Returns the current thought bubble text, or null if none is showing.
   * Returns null while the character is walking or climbing stairs.
   */
  getCurrentThought(): string | null {
    return this.currentThought
  }

  /**
   * Queues a visitor message to appear in the thought bubble.
   * Displayed immediately if the character is stationary; otherwise waits
   * until the next time they stop moving.
   */
  injectThought(text: string): void {
    this._injectedThought = text
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

    if (this.currentRoom === 'bedroom') {
      this._startPerforming('dress', 0.15)
    } else {
      const path = findPath(
        this.currentRoom,
        'bedroom',
        `${this.name}:dress:${this.clock.day}:${Math.floor(this.clock.hour)}`,
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
