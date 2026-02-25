# Game Design Document: Mi Casa Es Su Casa

**Version**: 0.1 (Pre-Production)
**Last Updated**: 2026-02-24

---

## Table of Contents

1. [Overview](#1-overview)
2. [Core Concept](#2-core-concept)
3. [Game Flow](#3-game-flow)
4. [Visual Style](#4-visual-style)
5. [House Layout](#5-house-layout)
6. [Character System](#6-character-system)
7. [Thought Bubbles](#7-thought-bubbles)
8. [Backend & Persistence](#8-backend--persistence)
9. [Multiplayer Model](#9-multiplayer-model)
10. [Name System](#10-name-system)
11. [Future Roadmap](#11-future-roadmap)

---

## 1. Overview

**Elevator Pitch**: A browser-based life simulation where persistent little people live in dollhouse homes. Visit anyone's character by name — their house, their life, their story. Your house is always open.

**Inspiration**: The 1985 Commodore 64 game *Little Computer People* by Activision. In that game, a single virtual person lived in a cross-section dollhouse visible on screen, going about their daily life autonomously. The player could interact indirectly — ringing the doorbell, sending letters, calling on the phone. The character had their own personality seeded from the player's disk.

**Platform**: Web (desktop-first), HTML5 native game rendered with Three.js.

**Engine / Stack**:
- Renderer: Three.js (voxel-style 3D)
- Frontend: HTML5 / JavaScript (no heavy framework in the game layer)
- Backend: Next.js API routes, deployed on Vercel
- Persistence: Vercel KV (Redis-compatible key-value store)

---

## 2. Core Concept

### The Core Loop

A character is identified solely by their name. Anyone who knows the name can visit that character's house and watch them live their life. The character exists persistently — their state (room location, activity, mood, items) is saved to the backend and resumes from where it left off.

### "New To You" Framing

There is no ownership. No accounts. No passwords. If you type in a name and a character exists there, you are visiting *their* home. If no character exists at that name yet, you are creating one. The house is always open. *Mi casa es su casa.*

### Player Agency

**The player has NO direct control over the character.** The character is fully autonomous. The player is a passive observer — a visitor looking in through the dollhouse window. Future indirect interactions (gifts, phone calls, notes) are scoped to the roadmap, not MVP.

### Identity & Discovery

Characters are discovered by word of mouth. There is no directory or leaderboard. The URL itself is shareable — visiting `/[name]` shows that character's house. This creates an organic social layer without any explicit social features.

---

## 3. Game Flow

### 3.1 Boot Screen

When the page first loads, the player sees a **CRT boot sequence** — a retro terminal aesthetic that mimics an old computer booting up. This is a deliberate tonal choice evoking the original C64 experience.

Boot sequence text (approximate):

```
MI CASA ES SU CASA
INITIALIZING...

LOADING HOUSE SUBSYSTEM... OK
LOADING CHARACTER ENGINE... OK
LOADING THOUGHT PROCESSOR... OK

READY.

ENTER CHARACTER NAME: _
```

The cursor blinks. The player types a character name.

### 3.2 Name Entry

- A single text input appears (styled as a CRT terminal prompt).
- The player types a name and presses Enter (or clicks a button).
- The name is validated client-side (basic character checks) and then server-side (blocklist check, format validation).
- If valid:
  - If character exists → load their persisted state and transition to House View.
  - If character does not exist → create new character, generate appearance/personality from name seed, transition to House View.
- If invalid → display an error inline (CRT-style), allow re-entry.

### 3.3 House View

The main game screen. A cross-section dollhouse view showing all 3 floors simultaneously. The character moves autonomously through the house, performing activities in each room. The player watches.

The URL updates to `/[name]` (or `/?c=[name]`) so the session is shareable.

---

## 4. Visual Style

### 4.1 Overall Aesthetic

**Voxel dollhouse** rendered in Three.js. Blocky, chunky geometry. Warm, slightly desaturated color palette. The aesthetic sits between *Minecraft* cozy builds and retro pixel art — but rendered in 3D.

The camera is fixed in a **dollhouse / cross-section** perspective: slightly isometric, looking at the front face of the house with each floor visible. Think a cutaway architectural drawing, but voxelized.

### 4.2 CRT Boot Sequence

The boot screen uses a monospace font (e.g., `Courier New` or a custom bitmap font), green-on-black or amber-on-black color scheme, with:
- Scanline overlay effect (CSS or canvas)
- Subtle screen curvature (CSS border-radius / transform)
- Typing animation for boot text
- Blinking cursor

### 4.3 Color Palette

The house itself uses a warm, muted palette:

| Element          | Color Role          |
|------------------|---------------------|
| Exterior walls   | Warm grey / beige   |
| Interior walls   | Cream / off-white   |
| Floors           | Medium brown wood   |
| Character skin   | Seeded from name    |
| Character outfit | Seeded from name    |
| Furniture        | Saturated accents   |
| Thought bubble   | White, rounded      |

### 4.4 Camera

Fixed orthographic-ish perspective. The house is centered. No pan/zoom in MVP. The dollhouse fills most of the viewport.

---

## 5. House Layout

### Overview

The house is **3 floors tall**, shown in cross-section (front wall removed). Each floor has a distinct set of rooms. The layout is fixed — all characters live in the same house structure.

### Floor 1 — Ground Floor

| Room         | Description                                              |
|--------------|----------------------------------------------------------|
| Living Room  | Sofa, TV, bookshelf. Character relaxes, watches TV, reads. |
| Kitchen      | Counter, stove, fridge, table. Character cooks, eats.    |
| Entrance Hall | Front door, coat rack. Character enters/exits occasionally. |

### Floor 2 — Middle Floor

| Room         | Description                                              |
|--------------|----------------------------------------------------------|
| Bedroom      | Bed, nightstand, wardrobe. Character sleeps, dresses.    |
| Study / Office | Desk, computer, shelves. Character works, reads, types. |
| Bathroom     | Bathtub/shower, sink, toilet. Character bathes, grooms.  |

### Floor 3 — Top Floor / Attic

| Room         | Description                                              |
|--------------|----------------------------------------------------------|
| Hobby Room   | Easel, instruments, workbench (varies by character seed). Character pursues hobbies. |
| Storage      | Boxes, old furniture. Character occasionally rummages.   |

### Movement Between Floors

A **staircase** connects all floors on one side of the house. The character navigates up/down stairs as part of normal movement. Stairs are visible in the cross-section view.

### Room Dimensions (Voxel Grid)

- Each floor: approx. 16 voxels wide × 5 voxels tall × 8 voxels deep
- Walls: 1 voxel thick
- Character height: ~3 voxels

---

## 6. Character System

### 6.1 Fully Autonomous Behavior

The character operates entirely without player input. They follow an internal daily schedule driven by:

- **Time of day** (simulated game clock, not wall-clock time)
- **Needs** (hunger, sleep, hygiene, entertainment, social)
- **Current activity state** (idle, walking, performing action)

There are no commands, buttons, or controls exposed to the player. The player's role is purely observational.

### 6.2 Daily Schedule (Approximate)

| Time Slot        | Likely Activity                  |
|------------------|----------------------------------|
| Morning          | Wake up, shower, eat breakfast   |
| Late Morning     | Work at desk / hobby             |
| Afternoon        | Lunch, relax in living room      |
| Late Afternoon   | Hobby room / reading / TV        |
| Evening          | Dinner, wind down                |
| Night            | Sleep                            |

Variance is introduced via randomness seeded from the character name + current in-game day, so behavior is semi-deterministic and repeatable but not perfectly predictable to the observer.

### 6.3 Appearance Seeding

**Character appearance is fully determined by the character's name (the seed).** There are no customization options. Seeding covers:

| Attribute         | Examples                                  |
|-------------------|-------------------------------------------|
| Skin tone         | Range of realistic tones                  |
| Hair color        | Brown, black, blonde, red, grey, etc.     |
| Hair style        | Short, long, curly, bald, etc.            |
| Outfit color      | Primary and secondary colors              |
| Outfit style      | Casual, formal, sporty, quirky            |
| Hobby type        | Music, painting, tinkering, reading, etc. |
| Personality bias  | Introverted, extroverted, lazy, energetic |

The seeding algorithm uses a deterministic hash of the lowercased name string to derive all values. The same name always produces the same appearance.

### 6.4 Animations

Characters have a small set of looping and one-shot animations:

- Walk cycle (left/right)
- Climb stairs
- Sit down / stand up
- Sleep (lying in bed)
- Eat (at table)
- Type at keyboard
- Watch TV
- Paint / play instrument (hobby-specific)
- Think (idle with thought bubble)

Animations are voxel-character animations — simple keyframe transforms on voxel geometry.

### 6.5 State Machine

Each character runs a simple hierarchical state machine:

```
[TOP LEVEL]
  ├── Sleeping
  ├── Active
  │     ├── Moving (navigating to destination)
  │     └── Performing (executing an activity in a room)
  └── Transitioning (between floors via stairs)
```

Destination and activity selection is driven by needs + schedule + weighted randomness.

---

## 7. Thought Bubbles

### 7.1 Display

Thought bubbles appear above the character's head during idle moments and some activities. They are rendered as white rounded rectangles with a small tail, containing short text phrases or simple icons.

### 7.2 MVP Content

In MVP, thought bubbles are drawn from a **pre-written list of generic phrases**, randomly selected weighted by current activity/need state:

- Hunger: *"I could eat…"*, *"Something smells good."*, *"Mmmm, pizza."*
- Tired: *"Yawn…"*, *"Just five more minutes."*, *"So tired."*
- Bored: *"What to do…"*, *"Maybe I'll read."*, *"…"*
- Happy: *"This is nice."*, *"Cozy."*, *":)"*
- Working: *"Almost done."*, *"Hmm."*, *"[typing sounds]"*
- Hobby: *"I love this."*, *"Getting better."*, *"Just one more hour."*

### 7.3 Future: Name-Seeded Customization

Post-MVP, thought bubble content can be partially seeded from the character name — drawing from themed phrase lists based on personality traits derived from the seed. This gives each character a slightly distinct inner voice.

---

## 8. Backend & Persistence

### 8.1 Architecture

```
Browser (Three.js game)
    │
    ├── GET  /api/character/[name]     → Load character state
    └── POST /api/character/[name]     → Save character state
```

API routes are Next.js serverless functions deployed on Vercel.

### 8.2 Vercel KV Schema

**Key format**: `character:[lowercased_name]`

**Value** (JSON):

```json
{
  "name": "alice",
  "createdAt": "2026-02-24T00:00:00Z",
  "lastSeenAt": "2026-02-24T12:00:00Z",
  "currentRoom": "living_room",
  "currentActivity": "watching_tv",
  "needs": {
    "hunger": 0.4,
    "sleep": 0.8,
    "hygiene": 0.9,
    "entertainment": 0.6
  },
  "gameClockHour": 14.5,
  "gameDayCount": 3
}
```

### 8.3 State Save Frequency

State is saved to KV:
- On character name lookup (initial load, reads existing state)
- Periodically while the house is being viewed (e.g., every 30 seconds via POST)
- On page unload (best-effort `navigator.sendBeacon`)

### 8.4 Cold Start

If no state exists for a name, the server creates a fresh character record with default needs and a game clock starting at morning. The character appearance is derived purely from the name on the client side — **appearance is never stored on the server**, it is always re-derived from the name.

---

## 9. Multiplayer Model

### 9.1 Vision: Eventual Consistency

The long-term vision is that multiple people can visit the same character simultaneously and see roughly the same thing — the character in the same room, doing the same activity. This is achieved by making the character simulation **deterministic given the same seed + timestamp**, so independent clients converge to the same state.

### 9.2 MVP Stub Behavior

In MVP, **there is no real-time synchronization**. Each client:

1. Loads the last-persisted state from the server on page load.
2. Runs the character simulation locally, independently, from that state.
3. Periodically saves state back to the server.

Two clients visiting the same character simultaneously may see slightly different positions/activities due to independent simulation drift. This is acceptable for MVP and will be refined in a future iteration.

### 9.3 Conflict Resolution (Future)

Future state sync options (post-MVP):

- **Server-authoritative tick**: A server-side cron job (Vercel Cron) advances the character simulation on a schedule and saves canonical state. Clients load and render this canonical state.
- **WebSocket presence**: Real-time position broadcasting for visitors viewing the same house simultaneously.

---

## 10. Name System

### 10.1 Validation Rules

**Client-side** (immediate feedback):

- Length: 2–20 characters
- Allowed characters: `A-Z`, `a-z`, `0-9`, `-`, `_`
- No spaces
- Cannot start or end with `-` or `_`

**Server-side** (on API call):

- Same rules re-validated
- Normalized to lowercase for storage/lookup
- Checked against offensive word blocklist

### 10.2 Blocklist

A server-side blocklist of offensive, reserved, or inappropriate words. The check is:
- Exact match against the normalized name
- Substring match for particularly egregious strings

The blocklist is maintained as a plain text file or environment-variable-injected list, editable without code changes.

### 10.3 Uniqueness Model

**There is no uniqueness enforcement.** A name maps to exactly one character. If two people use the same name, they share the same character — they are visiting the same house. This is a feature, not a bug. It enables the "visit your friend's character" social mechanic without accounts or invitations.

### 10.4 Display

Names are displayed in the UI as entered (original casing), but internally stored and matched as lowercase. The URL uses the normalized lowercase name.

---

## 11. Future Roadmap

These features are explicitly **out of scope for MVP** but are part of the design vision:

### 11.1 Indirect Interactions (LCP-Style)

Inspired by the original *Little Computer People* indirect interaction model:

| Interaction      | Description                                                  |
|------------------|--------------------------------------------------------------|
| Doorbell         | Ring the doorbell; character goes to answer the door        |
| Phone call       | Call the character; they answer and "talk" (text bubbles)    |
| Send a gift      | Drop an item at the door; character finds it and reacts      |
| Send a letter    | Write a short note; character reads it and responds          |
| Leave food       | Place food in the kitchen; character eats it                 |

These interactions would be throttled (once per real-time period) to prevent abuse.

### 11.2 Generated House Variants

Currently all characters share the same house layout. Future: house layout (number of rooms, furniture style, wallpaper/flooring) is seeded from the character name, giving each character a unique home.

### 11.3 Synced State / Presence

Real-time sync so multiple visitors see the same character behavior simultaneously. See Section 9.3.

### 11.4 Character Relationships

Characters could "know about" other characters via interactions. A character who has received gifts from another might reference them in thought bubbles. Cross-character state is complex and deferred.

### 11.5 Mobile Support

MVP is desktop-first. Mobile layout requires rethinking the dollhouse viewport for portrait screens.

### 11.6 Accessibility

- Keyboard navigation for name entry
- Screen reader descriptions of character activity
- High-contrast mode option

---

*End of Document*
