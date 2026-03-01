import { NextRequest, NextResponse } from 'next/server'
import { validateNameFormat, normalizeName } from '@/lib/nameValidation'
import { getCustomLayout, saveCustomLayout } from '@/lib/kv'
import { generateLayout, roomOrderFromLayout } from '@/lib/layout'
import type { LayoutRoomId } from '@/lib/layout'
import { ALL_ROOMS } from '@/lib/layout'
import { z } from 'zod'

type RouteParams = { params: Promise<{ name: string }> }

export async function GET(_req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { name: rawName } = await params
  const name = normalizeName(rawName)

  const validation = validateNameFormat(name)
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  try {
    const custom = await getCustomLayout(name)
    if (custom) {
      const response: Record<string, unknown> = { roomOrder: custom.roomOrder, version: custom.version }
      if (custom.staircaseX) response.staircaseX = custom.staircaseX
      return NextResponse.json(response, { status: 200 })
    }

    // No custom layout — return the deterministic default with version 0
    const defaultLayout = generateLayout(name)
    const roomOrder = roomOrderFromLayout(defaultLayout)
    return NextResponse.json({ roomOrder, version: 0 }, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }
}

const PostBodySchema = z.object({
  roomOrder: z.array(z.string()).length(8),
  expectedVersion: z.number().int().min(0),
  staircaseX: z.tuple([z.number().int(), z.number().int(), z.number().int()]).optional(),
})

export async function POST(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { name: rawName } = await params
  const name = normalizeName(rawName)

  const validation = validateNameFormat(name)
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = PostBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', details: parsed.error.issues },
      { status: 400 },
    )
  }

  const { roomOrder, expectedVersion, staircaseX } = parsed.data

  // Validate all 8 rooms are present exactly once
  const sorted = [...roomOrder].sort()
  const expected = [...ALL_ROOMS].sort()
  if (JSON.stringify(sorted) !== JSON.stringify(expected)) {
    return NextResponse.json(
      { error: 'roomOrder must contain all 8 rooms exactly once' },
      { status: 400 },
    )
  }

  // Validate entrance is the leftmost room on its floor
  // (indices 0–2 = floor 1, 3–5 = floor 2, 6–7 = floor 3; leftmost = first index)
  // The camera renders x-inverted, so leftmost slot (x=1) appears on the right of screen.
  const floorFirstIndices = [0, 3, 6]
  if (!floorFirstIndices.some((i) => roomOrder[i] === 'entrance')) {
    return NextResponse.json(
      { error: 'entrance must be the leftmost room on its floor' },
      { status: 400 },
    )
  }

  try {
    const result = await saveCustomLayout(
      name,
      roomOrder as LayoutRoomId[],
      expectedVersion,
      staircaseX,
    )

    if (result.ok) {
      const response: Record<string, unknown> = {
        roomOrder: result.layout.roomOrder,
        version: result.layout.version,
      }
      if (result.layout.staircaseX) response.staircaseX = result.layout.staircaseX
      return NextResponse.json(response, { status: 200 })
    }

    // Conflict — return 409 with the current server-side layout
    const conflictResponse: Record<string, unknown> = {
      roomOrder: result.current.roomOrder,
      version: result.current.version,
    }
    if (result.current.staircaseX) conflictResponse.staircaseX = result.current.staircaseX
    return NextResponse.json(
      { error: 'Version conflict', current: conflictResponse },
      { status: 409 },
    )
  } catch {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }
}
