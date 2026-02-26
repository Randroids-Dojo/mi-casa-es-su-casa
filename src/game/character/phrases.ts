// ---------------------------------------------------------------------------
// Phrase library — thought bubble content organized by need state / activity
// ---------------------------------------------------------------------------

import type { Needs } from './needs'
import { seededRngFromKey } from './seeder'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PhraseCategory =
  | 'hungry'
  | 'very_hungry'
  | 'tired'
  | 'very_tired'
  | 'bored'
  | 'working'
  | 'happy'
  | 'content'
  | 'cooking'
  | 'eating'
  | 'bathing'
  | 'sleeping'
  | 'hobby'

// ---------------------------------------------------------------------------
// Phrase lists
// ---------------------------------------------------------------------------

export const PHRASES: Readonly<Record<PhraseCategory, readonly string[]>> = {
  hungry: [
    "I could eat...",
    "Something smells good.",
    "Mmmm, pizza.",
    "Is it lunch time yet?",
    "My stomach is talking.",
  ],
  very_hungry: [
    "I'm starving.",
    "Must. Eat. Now.",
    "Everything looks like food.",
    "...*stomach growls*...",
  ],
  tired: [
    "Yawn...",
    "Just five more minutes.",
    "So tired.",
    "Maybe a quick nap...",
    "Eyelids getting heavy.",
  ],
  very_tired: [
    "Can't keep eyes open.",
    "Zzz...",
    "Bed sounds amazing right now.",
    "...what was I doing?",
  ],
  bored: [
    "What to do...",
    "Maybe I'll read.",
    "...",
    "Hmm.",
    "I should do something.",
    "Ceiling is interesting.",
  ],
  working: [
    "Almost done.",
    "Hmm.",
    "[typing sounds]",
    "Just one more thing...",
    "Focused.",
    "Where was I?",
  ],
  happy: [
    "This is nice.",
    "Cozy.",
    ":)",
    "Life is good.",
    "Ahh.",
  ],
  content: [
    "Not bad.",
    "Pretty good day.",
    "...",
    "Mm.",
  ],
  cooking: [
    "Let's see...",
    "Almost ready.",
    "Smells good!",
    "I hope this works.",
    "Chef's kiss.",
  ],
  eating: [
    "Mmm.",
    "So good.",
    "Needed this.",
    "Delicious.",
    "Nom nom.",
  ],
  bathing: [
    "Ahhh.",
    "Much better.",
    "So refreshing.",
    "Clean at last.",
  ],
  sleeping: [
    "Zzz...",
    "...",
    "*dreaming*",
    "Zzz...",
  ],
  hobby: [
    "I love this.",
    "Getting better.",
    "Just one more hour.",
    "In the zone.",
    "This is my happy place.",
  ],
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Pick a pseudo-random phrase from a category, seeded by index so it's stable.
 * The seed is typically a counter that increments each time a new thought is shown.
 */
export function pickPhrase(category: PhraseCategory, seed: number): string {
  const list = PHRASES[category]
  // Use a seeded RNG so consecutive seeds produce varied (non-sequential) picks
  const rng = seededRngFromKey(`phrase:${category}:${seed}`)
  return rng.pick(list)
}

/**
 * Map current character context to a phrase category.
 *
 * Priority:
 *   1. Critical needs (>0.8 threshold) — check sleep first, then hunger
 *   2. High needs (>0.5) — moderate urgency
 *   3. Current activity
 *   4. Default to content/happy
 */
export function selectPhraseCategory(
  needs: { hunger: number; sleep: number; hygiene: number; entertainment: number },
  activity: string,
): PhraseCategory {
  const VERY_HIGH = 0.8
  const HIGH = 0.5

  // Critical / very high needs — override everything
  if (needs.sleep >= VERY_HIGH) return 'very_tired'
  if (needs.hunger >= VERY_HIGH) return 'very_hungry'

  // Activity-specific phrases while performing the activity
  if (activity === 'cook') return 'cooking'
  if (activity === 'eat') return 'eating'
  if (activity === 'bathe' || activity === 'groom') return 'bathing'
  if (activity === 'sleep') return 'sleeping'
  if (activity === 'work' || activity === 'type') return 'working'
  if (
    activity === 'paint' ||
    activity === 'play_instrument' ||
    activity === 'tinker'
  )
    return 'hobby'

  // Moderate needs
  if (needs.sleep >= HIGH) return 'tired'
  if (needs.hunger >= HIGH) return 'hungry'
  if (needs.entertainment >= HIGH) return 'bored'

  // Neutral / positive — vary between happy and content
  if (needs.hunger < 0.2 && needs.sleep < 0.2) return 'happy'
  return 'content'
}
