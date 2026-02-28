import { NextRequest, NextResponse } from 'next/server'
import { validateNameFormat, normalizeName } from '@/lib/nameValidation'
import { getVisitorLog, appendVisitorMessage, createEmptyVisitorLog } from '@/lib/kv'
import { z } from 'zod'

type RouteParams = { params: Promise<{ name: string }> }

const PostBodySchema = z.object({
  text: z.string().min(1).max(100),
  sender: z.string().min(1).max(50).optional(),
})

export async function GET(
  _req: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { name: rawName } = await params
  const name = normalizeName(rawName)

  const validation = validateNameFormat(name)
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  try {
    const log = (await getVisitorLog(name)) ?? createEmptyVisitorLog(name)
    return NextResponse.json(log, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
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
      { error: 'Invalid message', details: parsed.error.issues },
      { status: 400 },
    )
  }

  try {
    const log = await appendVisitorMessage(name, parsed.data.text, parsed.data.sender)
    return NextResponse.json(log, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }
}
