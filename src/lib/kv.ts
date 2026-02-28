import { kv } from '@vercel/kv'
import { CharacterState, CharacterStateSchema } from './characterSchema'
import { VisitorLog, VisitorLogSchema, VisitorMessage } from './visitorSchema'
import { generateLayout, layoutFromOrder } from './layout'
import type { LayoutRoomId } from './layout'
import { buildLayoutRoomData } from './roomDataBuilder'
import { CustomLayoutSchema } from './layoutSchema'
import type { CustomLayout } from './layoutSchema'

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
    messages: [...existing.messages, newMessage].slice(-69),
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

// ---------------------------------------------------------------------------
// Layout persistence helpers
// ---------------------------------------------------------------------------

const LAYOUT_KEY_PREFIX = 'layout:'

export function layoutKey(name: string): string {
  return `${LAYOUT_KEY_PREFIX}${name.toLowerCase()}`
}

export async function getCustomLayout(name: string): Promise<CustomLayout | null> {
  const raw = await kv.get(layoutKey(name))
  if (!raw) return null
  const parsed = CustomLayoutSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

/**
 * Saves a custom room ordering with optimistic concurrency.
 * Pass expectedVersion=0 for first save (no existing layout).
 * Returns { ok: true, layout } on success, { ok: false, current } on conflict.
 */
export async function saveCustomLayout(
  name: string,
  roomOrder: LayoutRoomId[],
  expectedVersion: number,
): Promise<{ ok: true; layout: CustomLayout } | { ok: false; current: CustomLayout }> {
  const existing = await getCustomLayout(name)
  const currentVersion = existing?.version ?? 0

  if (currentVersion !== expectedVersion) {
    // Conflict: another client saved a newer version
    if (existing) {
      return { ok: false, current: existing }
    }
    // expectedVersion was non-zero but no layout exists — treat as conflict
    // by returning a version-0 representation
    return {
      ok: false,
      current: {
        roomOrder: roomOrder, // return what was sent so caller can reconcile
        version: 0,
        updatedAt: new Date().toISOString(),
      },
    }
  }

  const newLayout: CustomLayout = {
    roomOrder,
    version: currentVersion + 1,
    updatedAt: new Date().toISOString(),
  }

  await kv.set(layoutKey(name), newLayout)
  return { ok: true, layout: newLayout }
}

/**
 * Resolves the HouseLayout for a character — custom if one exists,
 * otherwise the deterministic default from the character's name.
 */
export async function resolveLayout(name: string) {
  const custom = await getCustomLayout(name)
  if (custom) {
    return { layout: layoutFromOrder(custom.roomOrder), version: custom.version }
  }
  return { layout: generateLayout(name), version: 0 }
}
