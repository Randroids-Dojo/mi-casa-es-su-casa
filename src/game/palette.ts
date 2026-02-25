export const PALETTE = {
  // Structure
  WALL_EXTERIOR: 0xd4c5a9, // warm beige
  WALL_INTERIOR: 0xf5f0e8, // cream
  FLOOR_WOOD: 0x8b6914, // medium brown
  CEILING: 0xe8e0d0, // off-white

  // Furniture
  SOFA: 0x6b8e9f, // muted blue
  BED: 0x9b8bb4, // soft purple
  DESK: 0x7a5c3a, // dark wood
  TABLE: 0x7a5c3a, // dark wood
  BOOKSHELF: 0x5c4a2a, // darker wood
  WARDROBE: 0x6b5a3e, // medium wood

  // Kitchen
  COUNTER: 0xd4d4d4, // light grey
  STOVE: 0x888888, // grey
  FRIDGE: 0xf0f0f0, // white

  // Accents
  TV_SCREEN: 0x222244, // dark blue-black
  DOOR: 0x8b6914, // wood
  STAIRCASE: 0xa08060, // lighter wood

  // Character placeholder (used by character system)
  CHARACTER_SKIN: 0xffd5b0,
  CHARACTER_OUTFIT: 0x4a7ab5,
} as const

export type PaletteKey = keyof typeof PALETTE
export type PaletteColor = (typeof PALETTE)[PaletteKey]
