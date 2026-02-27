// ---------------------------------------------------------------------------
// Chat triggers — keyword-driven character behaviors from visitor messages
// ---------------------------------------------------------------------------
//
// When a visitor posts a message containing certain keywords, the character
// reacts by navigating to the relevant room, performing an activity, and
// showing a fun response thought bubble on arrival.

import { seededRngFromKey } from './seeder'
import type { RoomId, ActivityType } from '../rooms'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatTrigger {
  room: RoomId
  activity: ActivityType
  durationHours: number
  keywords: readonly string[]
  responsePhrases: readonly string[]
}

export interface ChatTriggerMatch {
  trigger: ChatTrigger
  matchedKeyword: string
}

// ---------------------------------------------------------------------------
// Trigger definitions — one per room
// ---------------------------------------------------------------------------

export const CHAT_TRIGGERS: readonly ChatTrigger[] = [
  {
    room: 'kitchen',
    activity: 'eat',
    durationHours: 6,
    keywords: [
      'eat', 'eating', 'food', 'apple', 'hungry', 'snack', 'cook', 'cooking',
      'meal', 'dinner', 'lunch', 'breakfast', 'pizza', 'sandwich', 'recipe',
      'chef', 'fridge', 'starving', 'thirsty', 'drink', 'drinking', 'water',
      'juice', 'coffee', 'tea',
    ],
    responsePhrases: [
      'Ooh good idea, I AM hungry!',
      'You read my mind... snack time!',
      'Kitchen bound!',
      "Let's see what's in the fridge...",
      'A visitor who gets me. Food it is!',
      'My stomach thanks you!',
      'Chef mode: ACTIVATED',
      'Time for a little culinary adventure!',
    ],
  },
  {
    room: 'bathroom',
    activity: 'use_bathroom',
    durationHours: 4,
    keywords: [
      'poop', 'pee', 'bathroom', 'potty', 'wash', 'washing', 'shower',
      'showering', 'bath', 'bathing', 'brush teeth', 'toilet', 'hygiene',
      'soap', 'stinky', 'smell',
    ],
    responsePhrases: [
      '...excuse me for a moment.',
      "Nature calls! Don't look!",
      "You're not wrong... I should freshen up.",
      'BRB. Important business.',
      'Privacy please!',
      'Fine, you caught me. I needed to go.',
      'Emergency bathroom trip!',
      "Don't follow me!",
    ],
  },
  {
    room: 'bedroom',
    activity: 'sleep',
    durationHours: 8,
    keywords: [
      'sleep', 'sleeping', 'nap', 'napping', 'tired', 'rest', 'resting',
      'bed', 'dream', 'dreaming', 'pajamas', 'pillow', 'blanket', 'yawn',
      'exhausted', 'goodnight',
    ],
    responsePhrases: [
      "Yawwwn... you're right, a nap sounds perfect.",
      'Goodnight!',
      'Just a quick power nap...',
      "You don't have to tell me twice!",
      'Sweet dreams incoming...',
      'The bed is calling my name!',
      'Five more minutes... or maybe fifty.',
      'Pillow, here I come.',
    ],
  },
  {
    room: 'living_room',
    activity: 'watch_tv',
    durationHours: 6,
    keywords: [
      'tv', 'movie', 'relax', 'relaxing', 'couch', 'chill', 'chilling',
      'watch', 'watching', 'netflix', 'show', 'lounge', 'sofa', 'unwind',
    ],
    responsePhrases: [
      'Couch potato mode: ON',
      'Great idea, time to veg out.',
      'Netflix and... exist.',
      'Finally, some quality lounge time.',
      "Don't mind if I do!",
      'The couch was made for moments like this.',
      'Time to become one with the sofa.',
      'Remote? Check. Snacks? Maybe later.',
    ],
  },
  {
    room: 'study',
    activity: 'work',
    durationHours: 6,
    keywords: [
      'work', 'working', 'study', 'studying', 'write', 'writing', 'email',
      'computer', 'laptop', 'desk', 'focus', 'homework', 'learn', 'learning',
      'type', 'typing', 'research',
    ],
    responsePhrases: [
      'Back to the grind!',
      'Focus mode: activated.',
      "You're right, I should be productive.",
      "Time to pretend I know what I'm doing.",
      '*puts on reading glasses*',
      'The desk awaits!',
      'Knowledge is power... or so they say.',
      'Let me just finish this one thing...',
    ],
  },
  {
    room: 'hobby_room',
    activity: 'paint',
    durationHours: 6,
    keywords: [
      'paint', 'painting', 'music', 'guitar', 'piano', 'art', 'craft',
      'hobby', 'tinker', 'tinkering', 'create', 'draw', 'drawing', 'sing',
      'singing', 'instrument', 'jam', 'build', 'building',
    ],
    responsePhrases: [
      'Creative juices flowing!',
      'Inspiration strikes!',
      'Time to make something beautiful.',
      'My happy place!',
      'Art time is the best time.',
      'Let the creativity begin!',
      'The muse has spoken!',
      "Stand back, I'm creating!",
    ],
  },
  {
    room: 'storage',
    activity: 'rummage',
    durationHours: 5,
    keywords: [
      'stuff', 'box', 'find', 'search', 'searching', 'organize', 'storage',
      'attic', 'lost', 'junk', 'rummage',
    ],
    responsePhrases: [
      "I wonder what's in these boxes...",
      'Time for a treasure hunt!',
      'Organizing? More like nostalgia trip.',
      "There's definitely something cool in here.",
      "One person's junk is my... also junk.",
      'Let me dig around a bit...',
      "Maybe I'll find that thing I lost...",
    ],
  },
  {
    room: 'entrance',
    activity: 'idle',
    durationHours: 3,
    keywords: [
      'door', 'outside', 'leave', 'walk', 'fresh air', 'hello', 'hi',
      'come in', 'welcome', 'enter', 'visit', 'arrive',
    ],
    responsePhrases: [
      'Welcome to my home!',
      'Oh, a visitor! Come in, come in!',
      'Hello there! Make yourself at home.',
      'Let me get the door!',
      'Mi casa es su casa!',
      'Fresh air sounds nice!',
      'Company! How exciting!',
      'Hey! Glad you stopped by!',
    ],
  },
]

// ---------------------------------------------------------------------------
// Multi-word keywords (pre-computed for matching)
// ---------------------------------------------------------------------------

interface MultiWordEntry {
  pattern: RegExp
  phrase: string
  trigger: ChatTrigger
}

const MULTI_WORD_KEYWORDS: MultiWordEntry[] = []
for (const trigger of CHAT_TRIGGERS) {
  for (const kw of trigger.keywords) {
    if (kw.includes(' ')) {
      // Escape regex special chars, then wrap in word boundaries so
      // "come in" doesn't match inside "become intelligent".
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      MULTI_WORD_KEYWORDS.push({
        pattern: new RegExp(`\\b${escaped}\\b`),
        phrase: kw,
        trigger,
      })
    }
  }
}

// ---------------------------------------------------------------------------
// Single-word keyword lookup (pre-computed for O(1) matching)
// ---------------------------------------------------------------------------

const SINGLE_WORD_MAP: ReadonlyMap<string, ChatTrigger> = (() => {
  const map = new Map<string, ChatTrigger>()
  for (const trigger of CHAT_TRIGGERS) {
    for (const kw of trigger.keywords) {
      if (!kw.includes(' ') && !map.has(kw)) {
        map.set(kw, trigger)
      }
    }
  }
  return map
})()

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/**
 * Scan a visitor message for the earliest keyword match.
 *
 * Multi-word keywords (e.g. "fresh air", "brush teeth") are checked with
 * word-boundary regex first. Single-word keywords are then matched against
 * individual words (punctuation stripped). The match at the earliest
 * character position in the text wins.
 */
export function matchChatTrigger(text: string): ChatTriggerMatch | null {
  if (!text) return null

  const lower = text.toLowerCase()
  let bestPos = Infinity
  let bestMatch: ChatTriggerMatch | null = null

  // Pass 1: multi-word keywords (word-boundary regex search)
  for (const entry of MULTI_WORD_KEYWORDS) {
    const m = entry.pattern.exec(lower)
    if (m && m.index < bestPos) {
      bestPos = m.index
      bestMatch = { trigger: entry.trigger, matchedKeyword: entry.phrase }
    }
  }

  // Pass 2: single-word keywords (tokenized, punctuation stripped)
  // We walk the string character by character to get word positions
  const wordRegex = /[a-z]+/g
  let match: RegExpExecArray | null
  while ((match = wordRegex.exec(lower)) !== null) {
    const word = match[0]
    const pos = match.index

    // Skip if we already have a better match
    if (pos >= bestPos) break

    const trigger = SINGLE_WORD_MAP.get(word)
    if (trigger) {
      bestPos = pos
      bestMatch = { trigger, matchedKeyword: word }
      break // No earlier single-word match possible
    }
  }

  return bestMatch
}

// ---------------------------------------------------------------------------
// Response phrase selection
// ---------------------------------------------------------------------------

/**
 * Pick 1–3 unique response phrases from a trigger's response list.
 * Uses seeded RNG so consecutive seeds produce varied, non-repeating picks.
 * The first phrase is shown on arrival; the rest are queued with short gaps.
 */
export function pickResponsePhrases(trigger: ChatTrigger, seed: number): string[] {
  const rng = seededRngFromKey(`chat-response:${trigger.room}:${seed}`)
  const count = 1 + rng.nextInt(3) // 1, 2, or 3
  const available = [...trigger.responsePhrases]
  const phrases: string[] = []
  for (let i = 0; i < count && available.length > 0; i++) {
    const idx = rng.nextInt(available.length)
    phrases.push(available[idx])
    available.splice(idx, 1)
  }
  return phrases
}
