import { NextRequest, NextResponse } from 'next/server'
import { validateNameFormat, normalizeName } from '@/lib/nameValidation'
import { getCharacter, saveCharacter, createDefaultCharacter } from '@/lib/kv'
import { CharacterStateSchema } from '@/lib/characterSchema'

type RouteParams = { params: Promise<{ name: string }> }

export async function GET(_req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { name: rawName } = await params
  const name = normalizeName(rawName)

  const validation = validateNameFormat(name)
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  try {
    const existing = await getCharacter(name)

    if (!existing) {
      const character = createDefaultCharacter(name)
      await saveCharacter(character)
      return NextResponse.json(character, { status: 201 })
    }

    const updated = { ...existing, lastSeenAt: new Date().toISOString() }
    await saveCharacter(updated)
    return NextResponse.json(updated, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }
}

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

  const parsed = CharacterStateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid character state', details: parsed.error.issues },
      { status: 400 },
    )
  }

  const state = parsed.data
  if (normalizeName(state.name) !== name) {
    return NextResponse.json(
      { error: 'Name in body does not match URL parameter' },
      { status: 400 },
    )
  }

  try {
    await saveCharacter(state)
    return NextResponse.json(state, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }
}
