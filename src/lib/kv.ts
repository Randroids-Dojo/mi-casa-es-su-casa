import { kv } from '@vercel/kv'
import { CharacterState, CharacterStateSchema } from './characterSchema'
import { VisitorLog, VisitorLogSchema, VisitorMessage } from './visitorSchema'

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

export async function appendVisitorMessage(name: string, text: string, sender?: string): Promise<VisitorLog> {
  const existing = (await getVisitorLog(name)) ?? createEmptyVisitorLog(name)
  const newMessage: VisitorMessage = {
    text,
    ...(sender ? { sender } : {}),
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
// Character search helpers
// ---------------------------------------------------------------------------

/**
 * Scan KV for character keys matching a query string.
 * Returns up to `limit` matching character names (lowercased).
 */
export async function searchCharacterNames(query: string, limit = 10): Promise<string[]> {
  const pattern = `${KEY_PREFIX}*${query.toLowerCase()}*`
  const names: string[] = []
  let cursor = '0'
  do {
    const result: [string, string[]] = await kv.scan(cursor, { match: pattern, count: 50 })
    cursor = result[0]
    const keys = result[1]
    for (const key of keys) {
      const name = key.slice(KEY_PREFIX.length)
      names.push(name)
      if (names.length >= limit) return names
    }
  } while (cursor !== '0')
  return names
}

// ---------------------------------------------------------------------------
// Character helpers
// ---------------------------------------------------------------------------

export function createDefaultCharacter(name: string): CharacterState {
  return {
    name,
    createdAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
    currentRoom: 'living_room',
    currentActivity: 'idle',
    needs: { hunger: 0.2, sleep: 0.1, hygiene: 0.1, entertainment: 0.2 },
    clock: { hour: 9, day: 0 },
    position: { x: 4, y: 1, z: 4 },
  }
}
