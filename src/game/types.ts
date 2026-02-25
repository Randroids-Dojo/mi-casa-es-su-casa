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
}
