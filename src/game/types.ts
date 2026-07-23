export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface VoxelSpec {
  position: Vec3
  color: number
  size?: Vec3
}

export type RoomId =
  | 'living_room'
  | 'kitchen'
  | 'entrance_hall'
  | 'bedroom'
  | 'study'
  | 'bathroom'
  | 'hobby_room'
  | 'storage'
  | 'staircase'
  | 'landing'

export interface Room {
  id: RoomId
  floor: 1 | 2 | 3
  /** Voxel bounds in world space */
  bounds: {
    min: Vec3
    max: Vec3
  }
}

import type { CharacterState as SchemaCharacterState } from '@/lib/characterSchema'
import type { LayoutRoomId } from '@/lib/layout'
import type { WardrobeChange } from '@/game/character/wardrobe'

export interface GameInstance {
  dispose(): void
  /** Returns the current thought bubble text, or null if none is showing. */
  getCurrentThought(): string | null
  /**
   * Returns the character's head position as percentage coordinates [0–100]
   * relative to the canvas element, or null if unavailable (e.g. WebGL failed).
   */
  getCharacterHeadScreenPos(): { x: number; y: number } | null
  /**
   * Pan the camera by the given screen-pixel delta.
   * Uses "content follows finger" convention: positive dx pans view left.
   */
  applyPanDeltaPixels(dx: number, dy: number): void
  /**
   * Zoom by the given scale factor.
   * factor < 1 zooms in (smaller world view), factor > 1 zooms out.
   */
  applyZoomScale(factor: number): void
  /**
   * Queues a visitor message to be shown in the character's thought bubble.
   * If the character is stationary, it appears immediately; otherwise it waits
   * until the next time the character stops moving.
   */
  injectThought(text: string): void
  /**
   * Rings the doorbell: plays a ding-dong sound and sends the character to
   * the entrance hall to investigate. No-op if audio is unavailable.
   */
  ringDoorbell(): void
  /**
   * Walks the character to the wardrobe and puts on the given clothing item.
   * The item persists in the character's saved state.
   */
  putOnClothes(item: string): void
  /**
   * Walks the character to the bedroom wardrobe to apply clothing changes
   * (accessories, shirt/pants colors). Shows a response thought on arrival.
   * The changes persist in the character's saved state.
   */
  changeClothes(changes: WardrobeChange[], responsePhrases: string[]): void
  /**
   * Interrupts the current activity and sends the character to a specific room
   * to perform the given activity, showing a response thought on arrival.
   */
  goToRoom(room: string, activity: string, durationHours: number, responsePhrases: string[]): void
  /**
   * Wakes the character from sleep. Resets sleep need and starts a brief idle.
   * No-op if the character is not sleeping.
   */
  wakeUp(responsePhrases: string[]): void
  /**
   * Returns the current character state snapshot for persistence.
   */
  getCharacterState(): SchemaCharacterState | null
  /**
   * Sends the character to the living room to water the fern plant.
   * The plant restores to full health during the watering activity.
   */
  waterPlant(responsePhrases: string[]): void
  /**
   * Returns the current plant health [0–1]. 1 = healthy green, 0 = dead brown.
   */
  getPlantHealth(): number
  /**
   * Toggles the lamp in the given room on or off.
   */
  toggleRoomLight(roomId: string, on: boolean): void
  /**
   * Returns a record of roomId → boolean for every room that has a lamp.
   * True = light is on.
   */
  getLightStates(): Record<string, boolean>
  /**
   * Starts a room-by-room light toggle sequence. The character walks to each
   * room with a lamp, idles briefly, and the lamp is toggled. `turnOn` true
   * turns all lights on; false turns them all off.
   */
  startLightSequence(turnOn: boolean): void
  /**
   * Returns true if a light toggle sequence is currently in progress.
   */
  isLightSequenceActive(): boolean
  /**
   * Unlock audio playback. Must be called from a user gesture handler
   * (touchstart, mousedown, click) to satisfy browser AudioContext policy.
   * Idempotent — safe to call repeatedly.
   */
  unlockAudio(): void

  // --- Item swap (double-tap) ---
  /** Handle a double-tap at screen coordinates to select/swap furniture items. */
  onDoubleTap(screenX: number, screenY: number): void
  /** Returns true when an item is currently selected for swap. */
  isItemSelected(): boolean
  /** Deselect the currently selected item (if any). */
  clearItemSelection(): void

  // --- Layout editor ---
  /** Begin a layout edit gesture at screen coordinates. */
  onLayoutPointerDown(screenX: number, screenY: number): void
  /** Update the drag position during a layout edit gesture. */
  onLayoutPointerMove(screenX: number, screenY: number): void
  /** End the layout edit gesture. */
  onLayoutPointerUp(): void
  /** Returns true when the layout editor has captured input (suppress panning). */
  isLayoutEditActive(): boolean
  /** Called by the persistence hook when a swap completes. */
  onLayoutSwap: ((roomOrder: LayoutRoomId[], staircaseIndex: Record<1 | 2, number>) => void) | null
  /** Called when a wall drag ends (for persistence). [floor1walls, floor2walls, floor3walls] */
  onWallSave: ((wallPositions: [number[], number[], number[]]) => void) | null
  /** Replace the current layout externally (e.g. after conflict resolution). */
  applyExternalLayout(roomOrder: LayoutRoomId[], staircaseIndex: Record<1 | 2, number>): void
}
