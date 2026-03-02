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
   * Unlock audio playback. Must be called from a user gesture handler
   * (touchstart, mousedown, click) to satisfy browser AudioContext policy.
   * Idempotent — safe to call repeatedly.
   */
  unlockAudio(): void

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
