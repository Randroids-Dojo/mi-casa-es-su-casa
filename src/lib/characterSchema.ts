import { z } from 'zod'

export const ClothingItemSchema = z.enum(['COWBOY_HAT'])
export type ClothingItem = z.infer<typeof ClothingItemSchema>

export const NeedsSchema = z.object({
  hunger: z.number().min(0).max(1),
  sleep: z.number().min(0).max(1),
  hygiene: z.number().min(0).max(1),
  entertainment: z.number().min(0).max(1),
})

export const GameClockSchema = z.object({
  hour: z.number().min(0).max(24),
  day: z.number().int().min(0),
})

export const CharacterStateSchema = z.object({
  name: z.string().min(2).max(20),
  createdAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
  currentRoom: z.enum([
    'living_room',
    'kitchen',
    'entrance',
    'bedroom',
    'study',
    'bathroom',
    'hobby_room',
    'storage',
  ]),
  currentActivity: z.enum([
    'relax',
    'watch_tv',
    'read',
    'cook',
    'eat',
    'sleep',
    'dress',
    'work',
    'type',
    'bathe',
    'groom',
    'paint',
    'play_instrument',
    'tinker',
    'rummage',
    'use_bathroom',
    'water_plant',
    'idle',
  ]),
  needs: NeedsSchema,
  clock: GameClockSchema,
  position: z.object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
  }),
  accessories: z.array(ClothingItemSchema).optional(),
  lastActiveAt: z.string().datetime().optional(),
  plantHealth: z.number().min(0).max(1).optional(),
})

export type CharacterState = z.infer<typeof CharacterStateSchema>
export type Needs = z.infer<typeof NeedsSchema>
export type GameClock = z.infer<typeof GameClockSchema>
