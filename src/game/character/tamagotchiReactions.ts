// ---------------------------------------------------------------------------
// Tamagotchi reactions — visitor-triggered interactions (Feed, Play, Clean)
// ---------------------------------------------------------------------------

import type { RoomId, ActivityType } from '../rooms'
import type { HobbyType } from './seeder'
import { seededRngFromKey } from './seeder'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TamagotchiActionId = 'feed' | 'play' | 'clean' | 'sleep' | 'wake'

export interface TamagotchiAction {
  id: TamagotchiActionId
  label: string
  room: RoomId
  activity: ActivityType
  durationHours: number
  cooldownMs: number
  responsePhrases: readonly string[]
}

// ---------------------------------------------------------------------------
// Hobby → activity mapping
// ---------------------------------------------------------------------------

const HOBBY_ACTIVITY_MAP: Record<HobbyType, ActivityType> = {
  music: 'play_instrument',
  painting: 'paint',
  tinkering: 'tinker',
  reading: 'read',
}

export function getPlayActivity(hobbyType: HobbyType): ActivityType {
  return HOBBY_ACTIVITY_MAP[hobbyType]
}

// ---------------------------------------------------------------------------
// Action definitions
// ---------------------------------------------------------------------------

const FEED_ACTION: TamagotchiAction = {
  id: 'feed',
  label: 'FEED',
  room: 'kitchen',
  activity: 'eat',
  durationHours: 0.5,
  cooldownMs: 60_000,
  responsePhrases: [
    'Ooh, snack time! Thanks!',
    'A visitor brought food!',
    'My tummy thanks you!',
    'Nom nom nom!',
    "You read my mind... I'm starving!",
    "Don't mind if I do!",
    'Food? For ME? You shouldn\'t have!',
    'Kitchen time, let\'s go!',
  ],
}

const PLAY_BASE: Omit<TamagotchiAction, 'activity'> = {
  id: 'play',
  label: 'PLAY',
  room: 'hobby_room',
  durationHours: 1.0,
  cooldownMs: 60_000,
  responsePhrases: [
    'Playtime! Woohoo!',
    'Someone wants to hang out!',
    'Fun time!',
    'Best. Visitor. Ever.',
    "You don't have to ask me twice!",
    'Time to have some fun!',
    'Let me show you what I can do!',
    'This is gonna be great!',
  ],
}

const CLEAN_ACTION: TamagotchiAction = {
  id: 'clean',
  label: 'CLEAN',
  room: 'bathroom',
  activity: 'bathe',
  durationHours: 0.5,
  cooldownMs: 60_000,
  responsePhrases: [
    'Good call, I could use a wash.',
    'Squeaky clean time!',
    'Spa day!',
    'Bubble bath, here I come!',
    'Fine... I guess I AM a little stinky.',
    'Rubber ducky, you\'re the one!',
    'Time to freshen up!',
    'Nothing like a hot bath!',
  ],
}

const SLEEP_ACTION: TamagotchiAction = {
  id: 'sleep',
  label: 'SLEEP',
  room: 'bedroom',
  activity: 'sleep',
  durationHours: 6,
  cooldownMs: 120_000,
  responsePhrases: [
    'Ahh, naptime. Finally.',
    'I was literally about to fall asleep standing up.',
    'Sweet dreams incoming...',
    'Don\'t disturb me, I\'m busy snoring.',
    'Zzzz... already.',
    'You had me at sleep.',
    'Goodnight, world.',
    'My bed is calling my name.',
  ],
}

export const WAKE_ACTION: TamagotchiAction = {
  id: 'wake',
  label: 'WAKE',
  room: 'bedroom',
  activity: 'idle',
  durationHours: 0,
  cooldownMs: 30_000,
  responsePhrases: [
    'Okay okay, I\'m up!',
    'Five more minutes... fine.',
    'Ugh, already?',
    'Rise and shine, I guess.',
    'Who dares wake me?!',
    'I was having such a good dream...',
    'Morning. Coffee first.',
    'Stretching... yawning... okay.',
  ],
}

/** Returns the four Tamagotchi actions, with PLAY's activity set from the character's hobby. */
export function getTamagotchiActions(hobbyType: HobbyType): readonly TamagotchiAction[] {
  return [
    FEED_ACTION,
    { ...PLAY_BASE, activity: getPlayActivity(hobbyType) },
    CLEAN_ACTION,
    SLEEP_ACTION,
  ]
}

/**
 * Pick 1–3 unique response phrases from an action's phrase list.
 * Same seeded pattern as chatTriggers.pickResponsePhrases().
 */
export function pickTamagotchiPhrases(action: TamagotchiAction, seed: number): string[] {
  const rng = seededRngFromKey(`tamagotchi:${action.id}:${seed}`)
  const count = 1 + rng.nextInt(3) // 1, 2, or 3
  const available = [...action.responsePhrases]
  const phrases: string[] = []
  for (let i = 0; i < count && available.length > 0; i++) {
    const idx = rng.nextInt(available.length)
    phrases.push(available[idx])
    available.splice(idx, 1)
  }
  return phrases
}
