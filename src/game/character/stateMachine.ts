// ---------------------------------------------------------------------------
// Character state machine — sleeping / active / transitioning
// ---------------------------------------------------------------------------
//
// Hierarchical FSM:
//
//   [TOP LEVEL]
//     ├── Sleeping      — character is in bed, sleep need decreasing
//     ├── Active
//     │     ├── Moving  — navigating to a destination room
//     │     └── Performing — executing an activity in the current room
//     └── Transitioning — moving between floors via the staircase

import type { RoomId, ActivityType } from '../rooms'

// ---------------------------------------------------------------------------
// State types
// ---------------------------------------------------------------------------

/** Top-level character states */
export type TopLevelState = 'sleeping' | 'active' | 'transitioning'

/** Sub-states within the 'active' top-level state */
export type ActiveSubState = 'moving' | 'performing'

// ---------------------------------------------------------------------------
// State data interfaces
// ---------------------------------------------------------------------------

export interface SleepingState {
  kind: 'sleeping'
  /** How many game hours have been spent sleeping in this stretch */
  hoursSlept: number
}

export interface MovingState {
  kind: 'active/moving'
  /** Ordered list of rooms to pass through, including destination */
  path: RoomId[]
  /** Index into path of the current leg destination */
  pathIndex: number
  /** Progress of movement from 0 to 1 along the current leg */
  legProgress: number
}

export interface PerformingState {
  kind: 'active/performing'
  activity: ActivityType
  /** Duration of this activity in game hours */
  durationHours: number
  /** How many game hours have elapsed for this activity */
  elapsedHours: number
}

export interface TransitioningState {
  kind: 'transitioning'
  /** Origin floor */
  fromFloor: 1 | 2 | 3
  /** Destination floor */
  toFloor: 1 | 2 | 3
  /** Progress from 0 to 1 along the staircase */
  progress: number
  /** Destination room after staircase traversal completes */
  destinationRoom: RoomId
}

export type CharacterStateData =
  | SleepingState
  | MovingState
  | PerformingState
  | TransitioningState

// ---------------------------------------------------------------------------
// State machine class
// ---------------------------------------------------------------------------

export class CharacterStateMachine {
  private _state: CharacterStateData

  constructor(initialState?: CharacterStateData) {
    this._state = initialState ?? {
      kind: 'active/performing',
      activity: 'idle',
      durationHours: 0.5,
      elapsedHours: 0,
    }
  }

  // -------------------------------------------------------------------------
  // Accessors
  // -------------------------------------------------------------------------

  get state(): Readonly<CharacterStateData> {
    return this._state
  }

  get topLevel(): TopLevelState {
    switch (this._state.kind) {
      case 'sleeping':
        return 'sleeping'
      case 'transitioning':
        return 'transitioning'
      case 'active/moving':
      case 'active/performing':
        return 'active'
    }
  }

  get isSleeping(): boolean {
    return this._state.kind === 'sleeping'
  }

  get isMoving(): boolean {
    return this._state.kind === 'active/moving'
  }

  get isPerforming(): boolean {
    return this._state.kind === 'active/performing'
  }

  get isTransitioning(): boolean {
    return this._state.kind === 'transitioning'
  }

  // -------------------------------------------------------------------------
  // Typed state accessors (safe casts)
  // -------------------------------------------------------------------------

  get sleepingState(): SleepingState | null {
    return this._state.kind === 'sleeping' ? this._state : null
  }

  get movingState(): MovingState | null {
    return this._state.kind === 'active/moving' ? this._state : null
  }

  get performingState(): PerformingState | null {
    return this._state.kind === 'active/performing' ? this._state : null
  }

  get transitioningState(): TransitioningState | null {
    return this._state.kind === 'transitioning' ? this._state : null
  }

  // -------------------------------------------------------------------------
  // Transitions
  // -------------------------------------------------------------------------

  /** Transition into sleeping state */
  transitionToSleeping(): void {
    this._state = {
      kind: 'sleeping',
      hoursSlept: 0,
    }
  }

  /** Transition into the moving state, starting a path */
  transitionToMoving(path: RoomId[]): void {
    if (path.length < 2) {
      throw new Error(
        `Path must have at least 2 rooms (start + destination), got ${path.length}`,
      )
    }
    this._state = {
      kind: 'active/moving',
      path,
      pathIndex: 1, // index 0 is current room; start moving toward index 1
      legProgress: 0,
    }
  }

  /** Transition into performing an activity */
  transitionToPerforming(activity: ActivityType, durationHours: number): void {
    this._state = {
      kind: 'active/performing',
      activity,
      durationHours,
      elapsedHours: 0,
    }
  }

  /** Transition into staircase traversal */
  transitionToStaircase(
    fromFloor: 1 | 2 | 3,
    toFloor: 1 | 2 | 3,
    destinationRoom: RoomId,
  ): void {
    this._state = {
      kind: 'transitioning',
      fromFloor,
      toFloor,
      progress: 0,
      destinationRoom,
    }
  }

  // -------------------------------------------------------------------------
  // Progress updates (called each tick from the update loop)
  // -------------------------------------------------------------------------

  /**
   * Advances sleeping state by deltaHours.
   * Returns true if the character should wake up (handled externally by schedule).
   */
  advanceSleep(deltaHours: number): boolean {
    if (this._state.kind !== 'sleeping') return false
    this._state = {
      ...this._state,
      hoursSlept: this._state.hoursSlept + deltaHours,
    }
    return false // waking decision is left to the schedule/needs system
  }

  /**
   * Advances the current activity by deltaHours.
   * Returns true when the activity duration is complete.
   */
  advanceActivity(deltaHours: number): boolean {
    if (this._state.kind !== 'active/performing') return false
    const next = {
      ...this._state,
      elapsedHours: this._state.elapsedHours + deltaHours,
    }
    this._state = next
    return next.elapsedHours >= next.durationHours
  }

  /**
   * Advances movement along the current path leg.
   * Returns true when the character has arrived at the final destination.
   *
   * @param deltaProgress Amount of progress [0, 1] to add this tick
   */
  advanceMovement(deltaProgress: number): boolean {
    if (this._state.kind !== 'active/moving') return false

    let { legProgress, pathIndex, path } = this._state
    legProgress += deltaProgress

    if (legProgress >= 1) {
      // Arrived at the current leg's destination
      legProgress = 0
      pathIndex += 1

      if (pathIndex >= path.length) {
        // Arrived at final destination
        this._state = {
          kind: 'active/moving',
          path,
          pathIndex: path.length - 1,
          legProgress: 1,
        }
        return true
      }
    }

    this._state = {
      kind: 'active/moving',
      path,
      pathIndex,
      legProgress,
    }
    return false
  }

  /**
   * Advances staircase traversal.
   * Returns true when the character has reached the destination floor.
   *
   * @param deltaProgress Amount of progress [0, 1] to add this tick
   */
  advanceStaircase(deltaProgress: number): boolean {
    if (this._state.kind !== 'transitioning') return false

    const newProgress = Math.min(1, this._state.progress + deltaProgress)
    this._state = {
      ...this._state,
      progress: newProgress,
    }
    return newProgress >= 1
  }

  // -------------------------------------------------------------------------
  // Serialization
  // -------------------------------------------------------------------------

  serialize(): CharacterStateData {
    return { ...this._state }
  }

  static deserialize(data: CharacterStateData): CharacterStateMachine {
    return new CharacterStateMachine(data)
  }
}
