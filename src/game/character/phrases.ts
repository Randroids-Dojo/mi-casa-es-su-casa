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
  | 'bathroom_break'
  | 'doorbell_reaction'
  | 'doorbell_entrance'
  | 'doorbell_sleeping'
  | 'tips'

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
    "zzzzz",
    "zzzZZZzzz...",
    "1 sheep... 2 sheep...",
    "3 sheep... 4 sheep...",
    "99 sheep... 100 sh—zzz",
    "***snoring***",
    "*mumble mumble*",
    "*dreaming*",
    "...five more minutes...",
    "zzz...zzz...zzz...",
    "*snore* ...huh? *snore*",
    "...so many sheep...",
  ],
  hobby: [
    "I love this.",
    "Getting better.",
    "Just one more hour.",
    "In the zone.",
    "This is my happy place.",
  ],
  bathroom_break: [
    "💩",
    "🚽 Occupied!",
    "Do NOT come in.",
    "...nature calls.",
    "💩💩💩",
    "Ahh, much better.",
    "🧻",
    "This might take a while...",
    "La la la... 🎵",
    "Nobody look.",
  ],
  doorbell_reaction: [
    "Oh! The doorbell!",
    "Someone's at the door!",
    "I wonder who that could be...",
    "A visitor?",
    "Coming, coming!",
    "Who could that be?",
    "Ooh, company!",
  ],
  doorbell_entrance: [
    "Hello? Anyone?",
    "Hmm, nobody here.",
    "Must be the wind.",
    "I could've sworn...",
    "Was someone there?",
    "Huh.",
    "...nobody.",
    "Must be kids.",
  ],
  doorbell_sleeping: [
    "Zzz... huh? The door?",
    "*yawn* ...who rings a bell at this hour?",
    "Five more... wait, was that the doorbell?",
    "Wha...? Someone at the door?",
    "...mmmf. Coming...",
  ],
  tips: [
    'Tip: Double-tap any furniture to select it, then double-tap another of the same type to swap them!',
    'Tip: Double-tap a selected item again to deselect it.',
    'Tip: Long-press and drag a room to swap it with another room.',
    'Tip: Drag the walls between rooms to resize them.',
    'Tip: Long-press the staircase to move it to a different position.',
    'Tip: Try saying "giddy up" in visitor messages for a surprise!',
    'Tip: You can swap bookshelves, sofas, rugs, and more between rooms!',
    'Tip: Pan by dragging, zoom with scroll or pinch.',
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
let _phraseCategorySeed = 0
const TIP_PROBABILITY = 0.15

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
  if (activity === 'use_bathroom') return 'bathroom_break'
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

  // Neutral / positive — vary between happy, content, and tips
  // ~15% chance to show a tip instead of a mood phrase
  const rng = seededRngFromKey(`tip-check:${_phraseCategorySeed++}`)
  if (rng.next() < TIP_PROBABILITY) return 'tips'
  if (needs.hunger < 0.2 && needs.sleep < 0.2) return 'happy'
  return 'content'
}
