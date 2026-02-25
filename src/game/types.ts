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

export interface Room {
  id: RoomId
  floor: 1 | 2 | 3
  /** Voxel bounds in world space */
  bounds: {
    min: Vec3
    max: Vec3
  }
}

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
}
