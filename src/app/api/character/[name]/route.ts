import { NextRequest, NextResponse } from 'next/server'
import { validateNameFormat, normalizeName } from '@/lib/nameValidation'
import { getCharacter, saveCharacter, createDefaultCharacter, resolveLayout } from '@/lib/kv'
import { CharacterStateSchema } from '@/lib/characterSchema'
import { simulateOffline, SIMULATION_THRESHOLD_SECONDS } from '@/lib/simulateOffline'
import { PERSISTENCE_VERSION } from '@/lib/persistenceVersion'

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

    // Resolve the character's house layout (custom or deterministic default)
    const { layout } = await resolveLayout(name)

    // Simulate offline activity if enough time has passed since last active client
    let simulated = existing
    if (existing.lastActiveAt) {
      const elapsedSeconds = (Date.now() - Date.parse(existing.lastActiveAt)) / 1000
      if (elapsedSeconds > SIMULATION_THRESHOLD_SECONDS) {
        simulated = simulateOffline(existing, elapsedSeconds, layout)
      }
    }

    const now = new Date().toISOString()
    // Update lastActiveAt after simulation so subsequent GETs don't
    // re-simulate from the same old base (compounding simulation time).
    const updated = { ...simulated, lastSeenAt: now, lastActiveAt: now }
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

  // Reject writes from stale client versions to prevent old browser tabs
  // from overwriting state after a new deployment.
  const clientVersion = req.nextUrl.searchParams.get('v')
  if (clientVersion !== String(PERSISTENCE_VERSION)) {
    return NextResponse.json(
      { error: 'Client version outdated', current: PERSISTENCE_VERSION },
      { status: 409 },
    )
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
    const withTimestamp = { ...state, lastActiveAt: new Date().toISOString() }
    await saveCharacter(withTimestamp)
    return NextResponse.json(withTimestamp, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }
}
