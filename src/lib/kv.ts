import { kv } from '@vercel/kv'
import { CharacterState, CharacterStateSchema } from './characterSchema'
import { VisitorLog, VisitorLogSchema, VisitorMessage } from './visitorSchema'
import { generateLayout } from './layout'
import { buildLayoutRoomData } from './roomDataBuilder'

const KEY_PREFIX = 'character:'

export function characterKey(name: string): string {
  return `${KEY_PREFIX}${name.toLowerCase()}`
}

export async function getCharacter(name: string): Promise<CharacterState | null> {
  const raw = await kv.get(characterKey(name))
  if (!raw) return null
  const parsed = CharacterStateSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

export async function saveCharacter(state: CharacterState): Promise<void> {
  await kv.set(characterKey(state.name), state)
}

// ---------------------------------------------------------------------------
// Visitor log helpers
// ---------------------------------------------------------------------------

const VISITORS_KEY_PREFIX = 'visitors:'

export function visitorsKey(name: string): string {
  return `${VISITORS_KEY_PREFIX}${name.toLowerCase()}`
}

export async function getVisitorLog(name: string): Promise<VisitorLog | null> {
  const raw = await kv.get(visitorsKey(name))
  if (!raw) return null
  const parsed = VisitorLogSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

export function createEmptyVisitorLog(name: string): VisitorLog {
  return { name: name.toLowerCase(), messages: [], totalCount: 0 }
}

export async function appendVisitorMessage(name: string, text: string): Promise<VisitorLog> {
  const existing = (await getVisitorLog(name)) ?? createEmptyVisitorLog(name)
  const newMessage: VisitorMessage = {
    text,
    postedAt: new Date().toISOString(),
  }
  const updated: VisitorLog = {
    name: existing.name,
    messages: [...existing.messages, newMessage].slice(-20),
    totalCount: existing.totalCount + 1,
  }
  await kv.set(visitorsKey(name), updated)
  return updated
}

// ---------------------------------------------------------------------------
// Character helpers
// ---------------------------------------------------------------------------

export function createDefaultCharacter(name: string): CharacterState {
  // Use the character's layout to place them at their living room center
  const layout = generateLayout(name)
  const roomData = buildLayoutRoomData(layout)
  const livingRoomCenter = roomData.centers.living_room

  return {
    name,
    createdAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
    currentRoom: 'living_room',
    currentActivity: 'idle',
    needs: { hunger: 0.2, sleep: 0.1, hygiene: 0.1, entertainment: 0.2 },
    clock: { hour: 9, day: 0 },
    position: { x: livingRoomCenter.x, y: livingRoomCenter.y, z: livingRoomCenter.z },
  }
}
