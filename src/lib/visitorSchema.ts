import { z } from 'zod'

export const VisitorMessageSchema = z.object({
  text: z.string().min(1).max(100),
  sender: z.string().min(1).max(50).optional(),
  postedAt: z.string().datetime(),
})

export const VisitorLogSchema = z.object({
  name: z.string(),
  messages: z.array(VisitorMessageSchema).max(20),
  totalCount: z.number().int().min(0),
})

export type VisitorMessage = z.infer<typeof VisitorMessageSchema>
export type VisitorLog = z.infer<typeof VisitorLogSchema>
