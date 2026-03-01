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
])

export const CustomLayoutSchema = z.object({
  roomOrder: z.array(LayoutRoomIdSchema).length(8),
  /** Staircase left-edge x per floor [floor1, floor2, floor3] */
  staircaseX: z.tuple([z.number().int(), z.number().int(), z.number().int()]).optional(),
  /**
   * Interior wall x-positions per floor [floor1walls, floor2walls, floor3walls].
   * Floors 1 & 2 each have 2 walls (3 rooms); floor 3 has 1 wall (2 rooms).
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
