export { initGame } from './renderer'
export { buildHouse, getRooms } from './house'
export { PALETTE } from './palette'
export type { GameInstance, Room, Vec3, VoxelSpec, RoomId } from './types'

// Character system
export * from './character'

// Room definitions (new canonical source)
export {
  ROOMS,
  ROOM_MAP,
  getRoom,
  getRoomFloor,
  getRoomActivities,
  getFloorCenterY,
} from './rooms'
export type { ActivityType, Room as CharacterRoom } from './rooms'
