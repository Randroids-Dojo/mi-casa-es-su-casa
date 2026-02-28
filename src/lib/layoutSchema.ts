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
  version: z.number().int().min(1),
  updatedAt: z.string().datetime(),
})

export type CustomLayout = z.infer<typeof CustomLayoutSchema>
