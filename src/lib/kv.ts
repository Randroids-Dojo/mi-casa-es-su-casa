import { kv } from '@vercel/kv'
import { CharacterState, CharacterStateSchema } from './characterSchema'

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

export function createDefaultCharacter(name: string): CharacterState {
  return {
    name,
    createdAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    currentRoom: 'living_room',
    currentActivity: 'idle',
    needs: { hunger: 0.2, sleep: 0.1, hygiene: 0.1, entertainment: 0.2 },
    clock: { hour: 9, day: 0 },
    position: { x: 4, y: 1, z: 4 },
  }
}
