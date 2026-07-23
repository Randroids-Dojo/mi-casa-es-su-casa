// ---------------------------------------------------------------------------
// Wardrobe — keyword-driven clothing changes from visitor messages
// ---------------------------------------------------------------------------
//
// When a visitor asks the character to change clothes ("I want a green
// shirt", "put on a top hat and sunglasses"), the character walks to the
// bedroom wardrobe, performs the 'dress' activity, and the requested
// changes are applied when dressing completes.
//
// Server-safe — no Three.js dependency. Geometry for each accessory lives
// in accessories.ts; this module owns the vocabulary and parsing.

import { seededRngFromKey } from './seeder'
import { pickUniquePhrases } from './phrases'
import type { ClothingItem, OutfitColor } from '@/lib/characterSchema'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WardrobeChange =
  | { kind: 'shirt'; color: OutfitColor }
  | { kind: 'pants'; color: OutfitColor }
  | { kind: 'accessory'; item: ClothingItem }

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

/** Canonical outfit colors and the hex used to tint the character mesh */
export const OUTFIT_COLOR_HEX: Readonly<Record<OutfitColor, number>> = {
  red: 0xd0453e,
  orange: 0xe08a3c,
  yellow: 0xe8c84a,
  green: 0x4a9b4f,
  teal: 0x3aa8a0,
  blue: 0x3f6fd1,
  purple: 0x8455c9,
  pink: 0xe07aa8,
  brown: 0x8b5e3c,
  white: 0xf0f0f0,
  black: 0x2a2a35,
  gray: 0x9a9aa5,
}

const ALL_COLORS = Object.keys(OUTFIT_COLOR_HEX) as OutfitColor[]

/** Color words visitors might use, mapped to a canonical color */
const COLOR_WORDS: Readonly<Record<string, OutfitColor>> = {
  red: 'red', crimson: 'red', scarlet: 'red', maroon: 'red',
  orange: 'orange',
  yellow: 'yellow', gold: 'yellow', golden: 'yellow',
  green: 'green', lime: 'green', emerald: 'green', olive: 'green', forest: 'green',
  teal: 'teal', turquoise: 'teal', cyan: 'teal', aqua: 'teal',
  blue: 'blue', navy: 'blue', azure: 'blue', indigo: 'blue',
  purple: 'purple', violet: 'purple', lavender: 'purple',
  pink: 'pink', magenta: 'pink', rose: 'pink',
  brown: 'brown', tan: 'brown', khaki: 'brown',
  white: 'white',
  black: 'black',
  gray: 'gray', grey: 'gray', silver: 'gray',
}

// ---------------------------------------------------------------------------
// Accessory slots — one item per slot; a new item replaces the old one
// ---------------------------------------------------------------------------

export type AccessorySlot = 'hat' | 'eyes' | 'neck' | 'ears' | 'face'

export const ACCESSORY_SLOT: Readonly<Record<ClothingItem, AccessorySlot>> = {
  COWBOY_HAT: 'hat',
  TOP_HAT: 'hat',
  CAP: 'hat',
  BEANIE: 'hat',
  CROWN: 'hat',
  PARTY_HAT: 'hat',
  SUNGLASSES: 'eyes',
  GLASSES: 'eyes',
  BOW_TIE: 'neck',
  SCARF: 'neck',
  NECKLACE: 'neck',
  HEADPHONES: 'ears',
  MUSTACHE: 'face',
}

/**
 * Enforces the one-item-per-slot invariant on a worn-accessories list:
 * for each slot the last-listed item wins. Used to normalize saved state
 * on load so e.g. two hats from an old save can't both render.
 */
export function resolveSlotConflicts(items: readonly ClothingItem[]): ClothingItem[] {
  const bySlot = new Map<AccessorySlot, ClothingItem>()
  for (const item of items) bySlot.set(ACCESSORY_SLOT[item], item)
  return [...bySlot.values()]
}

// ---------------------------------------------------------------------------
// Keyword vocabulary
// ---------------------------------------------------------------------------
//
// Phrases are matched longest-first over word tokens, so "cowboy hat" wins
// over the bare "hat" fallback. A color word seen before a garment applies
// to that garment ("green shirt and blue pants").

type KeywordEntry =
  | { type: 'accessory'; item: ClothingItem }
  | { type: 'garment'; kind: 'shirt' | 'pants'; defaultColor?: OutfitColor }
  | { type: 'outfit' }

const KEYWORDS: Readonly<Record<string, KeywordEntry>> = {
  // --- Accessories: hats ---
  'cowboy hat': { type: 'accessory', item: 'COWBOY_HAT' },
  sombrero: { type: 'accessory', item: 'COWBOY_HAT' },
  stetson: { type: 'accessory', item: 'COWBOY_HAT' },
  'top hat': { type: 'accessory', item: 'TOP_HAT' },
  tophat: { type: 'accessory', item: 'TOP_HAT' },
  'party hat': { type: 'accessory', item: 'PARTY_HAT' },
  'baseball cap': { type: 'accessory', item: 'CAP' },
  cap: { type: 'accessory', item: 'CAP' },
  hat: { type: 'accessory', item: 'CAP' },
  beanie: { type: 'accessory', item: 'BEANIE' },
  crown: { type: 'accessory', item: 'CROWN' },
  tiara: { type: 'accessory', item: 'CROWN' },
  // --- Accessories: eyes ---
  sunglasses: { type: 'accessory', item: 'SUNGLASSES' },
  shades: { type: 'accessory', item: 'SUNGLASSES' },
  glasses: { type: 'accessory', item: 'GLASSES' },
  spectacles: { type: 'accessory', item: 'GLASSES' },
  specs: { type: 'accessory', item: 'GLASSES' },
  // --- Accessories: neck ---
  'bow tie': { type: 'accessory', item: 'BOW_TIE' },
  bowtie: { type: 'accessory', item: 'BOW_TIE' },
  scarf: { type: 'accessory', item: 'SCARF' },
  necklace: { type: 'accessory', item: 'NECKLACE' },
  // --- Accessories: ears & face ---
  headphones: { type: 'accessory', item: 'HEADPHONES' },
  mustache: { type: 'accessory', item: 'MUSTACHE' },
  moustache: { type: 'accessory', item: 'MUSTACHE' },
  // --- Garments: shirt (recolors torso + arms) ---
  shirt: { type: 'garment', kind: 'shirt' },
  sweater: { type: 'garment', kind: 'shirt' },
  hoodie: { type: 'garment', kind: 'shirt' },
  jacket: { type: 'garment', kind: 'shirt' },
  blouse: { type: 'garment', kind: 'shirt' },
  jersey: { type: 'garment', kind: 'shirt' },
  'tank top': { type: 'garment', kind: 'shirt' },
  // --- Garments: pants (recolors legs) ---
  pants: { type: 'garment', kind: 'pants' },
  trousers: { type: 'garment', kind: 'pants' },
  jeans: { type: 'garment', kind: 'pants', defaultColor: 'blue' },
  shorts: { type: 'garment', kind: 'pants' },
  leggings: { type: 'garment', kind: 'pants' },
  slacks: { type: 'garment', kind: 'pants' },
  skirt: { type: 'garment', kind: 'pants' },
  // --- Whole-outfit change (new shirt + pants colors) ---
  clothes: { type: 'outfit' },
  outfit: { type: 'outfit' },
  wardrobe: { type: 'outfit' },
  makeover: { type: 'outfit' },
  'dress up': { type: 'outfit' },
  'get dressed': { type: 'outfit' },
  'new look': { type: 'outfit' },
}

/** Longest keyword phrase, in words (derived so new phrases can't outgrow it) */
const MAX_PHRASE_WORDS = Math.max(
  ...Object.keys(KEYWORDS).map((k) => k.split(' ').length),
)

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/**
 * Scan a visitor message for clothing-change requests.
 *
 * Recognizes accessories ("top hat", "sunglasses"), colored garments
 * ("green shirt", "blue pants"), and whole-outfit changes ("change
 * clothes", "new outfit"). A color word before a garment applies to it;
 * a garment without a color gets a seeded-random color (except items with
 * a natural default, e.g. jeans → blue). Returns the requested changes,
 * at most one per slot (the last mention wins, so "change clothes, and
 * make the shirt green" ends up with a green shirt), or null if the
 * message contains no clothing keywords.
 *
 * `seed` keeps the random color picks deterministic per call site.
 */
export function matchWardrobeRequest(text: string, seed = 0): WardrobeChange[] | null {
  if (!text) return null

  const words = text.toLowerCase().match(/[a-z]+/g) ?? []
  if (words.length === 0) return null

  const rng = seededRngFromKey(`wardrobe:${seed}:${words.join(' ')}`)
  const randomColor = (): OutfitColor => rng.pick(ALL_COLORS)

  const changes: WardrobeChange[] = []
  let pendingColor: OutfitColor | null = null
  const consumed = new Set<number>()

  /** True if a keyword phrase starts at word index j */
  const keywordStartsAt = (j: number): boolean => {
    for (let len = Math.min(MAX_PHRASE_WORDS, words.length - j); len >= 1; len--) {
      if (KEYWORDS[words.slice(j, j + len).join(' ')]) return true
    }
    return false
  }

  /**
   * Handles trailing colors ("make the shirt green"): scan up to 3 words
   * after a garment for a color word, unless it belongs to a following
   * garment ("shirt and blue pants" must not steal blue).
   */
  const takeTrailingColor = (start: number): OutfitColor | null => {
    for (let j = start; j < Math.min(start + 3, words.length); j++) {
      if (keywordStartsAt(j)) return null
      const color = COLOR_WORDS[words[j]]
      if (color) {
        if (j + 1 < words.length && keywordStartsAt(j + 1)) return null
        consumed.add(j)
        return color
      }
    }
    return null
  }

  let i = 0
  while (i < words.length) {
    if (consumed.has(i)) {
      i++
      continue
    }
    // Try longest phrase first so "cowboy hat" beats the bare "hat"
    let entry: KeywordEntry | undefined
    let phrase = ''
    let len = Math.min(MAX_PHRASE_WORDS, words.length - i)
    for (; len >= 1; len--) {
      phrase = words.slice(i, i + len).join(' ')
      entry = KEYWORDS[phrase]
      if (entry) break
    }

    if (entry) {
      switch (entry.type) {
        case 'accessory':
          changes.push({ kind: 'accessory', item: entry.item })
          break
        case 'garment': {
          const color =
            pendingColor ?? takeTrailingColor(i + len) ?? entry.defaultColor ?? randomColor()
          changes.push({ kind: entry.kind, color })
          break
        }
        case 'outfit': {
          // "green clothes" / "make the outfit green" → all one color;
          // otherwise fresh random colors for shirt and pants
          const color = pendingColor ?? takeTrailingColor(i + len)
          changes.push(
            { kind: 'shirt', color: color ?? randomColor() },
            { kind: 'pants', color: color ?? randomColor() },
          )
          break
        }
      }
      pendingColor = null
      i += len
    } else {
      const color = COLOR_WORDS[words[i]]
      if (color) pendingColor = color
      i++
    }
  }

  if (changes.length === 0) return null

  // Collapse to one change per slot — forward Map.set gives last-wins
  const bySlot = new Map<string, WardrobeChange>()
  for (const change of changes) {
    const slot =
      change.kind === 'accessory' ? `acc:${ACCESSORY_SLOT[change.item]}` : change.kind
    bySlot.set(slot, change)
  }
  return [...bySlot.values()]
}

// ---------------------------------------------------------------------------
// Response phrases
// ---------------------------------------------------------------------------

const WARDROBE_PHRASES: readonly string[] = [
  'Time for a wardrobe change!',
  'Ooh, dress-up time!',
  'How do I look?',
  'Fresh new look, coming right up!',
  'Fashion is my passion!',
  'To the wardrobe!',
  'A little makeover never hurt anyone.',
  'Do these colors match? Who cares!',
  'Strike a pose!',
  "Lookin' sharp!",
  'My stylist has spoken!',
  'New clothes, new me.',
]

/**
 * Pick 1–3 unique wardrobe response phrases. The first is shown on arrival
 * at the wardrobe; the rest are queued with short gaps between them.
 */
export function pickWardrobePhrases(seed: number): string[] {
  return pickUniquePhrases(WARDROBE_PHRASES, `wardrobe-response:${seed}`)
}
