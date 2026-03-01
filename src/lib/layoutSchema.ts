import { z } from 'zod'

const LayoutRoomIdSchema = z.enum([
  'living_room',
  'kitchen',
  'entrance',
  'bedroom',
  'study',
  'bathroom',
  'hobby_room',
  'storage',
  'landing',
])

export const CustomLayoutSchema = z.object({
  roomOrder: z.array(LayoutRoomIdSchema).length(9),
  /** Staircase index (0-based position in combined sequence) per floor [floor1, floor2] */
  staircaseIndex: z.tuple([z.number().int().min(0), z.number().int().min(0)]).optional(),
  /**
   * Interior wall x-positions per floor [floor1walls, floor2walls, floor3walls].
   * Floors 1 & 2 each have 2 walls (3 rooms); floor 3 has 2 walls (3 rooms).
   * Only applies when staircase is at last position on the floor (floors 1 & 2).
   */
  wallPositions: z.tuple([
    z.array(z.number()),
    z.array(z.number()),
    z.array(z.number()),
  ]).optional(),
  version: z.number().int().min(1),
  updatedAt: z.string().datetime(),
})

export type CustomLayout = z.infer<typeof CustomLayoutSchema>
