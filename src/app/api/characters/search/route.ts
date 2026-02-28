import { NextRequest, NextResponse } from 'next/server'
import { searchCharacterNames } from '@/lib/kv'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (q.length < 2) {
    return NextResponse.json({ names: [] }, { status: 200 })
  }

  try {
    const names = await searchCharacterNames(q, 10)
    return NextResponse.json({ names }, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }
}
