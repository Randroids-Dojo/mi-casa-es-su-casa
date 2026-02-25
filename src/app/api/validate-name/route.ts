import { NextRequest, NextResponse } from 'next/server'
import { validateNameFormat, normalizeName } from '@/lib/nameValidation'

// Minimal hardcoded default blocklist — clearly inappropriate or reserved names.
const DEFAULT_BLOCKLIST: string[] = [
  'admin',
  'root',
  'system',
  'fuck',
  'shit',
  'cunt',
  'nigger',
  'faggot',
  'bitch',
  'asshole',
]

/**
 * Returns the effective blocklist: env var (comma-separated) or the default.
 */
function getBlocklist(): string[] {
  const envList = process.env.NAME_BLOCKLIST
  if (envList && envList.trim().length > 0) {
    return envList
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  }
  return DEFAULT_BLOCKLIST
}

/**
 * Check whether a normalized name is blocked.
 * Strategy:
 *   - Exact match against any blocklist entry
 *   - Substring match (the name contains a blocklist entry) for entries that
 *     are particularly egregious (all entries in our minimal list qualify)
 */
function isBlocked(normalizedName: string): boolean {
  const blocklist = getBlocklist()
  for (const entry of blocklist) {
    // Exact match
    if (normalizedName === entry) return true
    // Substring match — the name contains the blocked string
    if (normalizedName.includes(entry)) return true
  }
  return false
}

// POST /api/validate-name
// Body: { name: string }
// Response: { valid: boolean, normalizedName?: string, error?: string }
export async function POST(req: NextRequest) {
  let body: unknown

  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { valid: false, error: 'INVALID REQUEST BODY' },
      { status: 400 }
    )
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    !('name' in body) ||
    typeof (body as Record<string, unknown>).name !== 'string'
  ) {
    return NextResponse.json(
      { valid: false, error: 'MISSING OR INVALID NAME FIELD' },
      { status: 400 }
    )
  }

  const rawName = (body as Record<string, string>).name

  // Format validation (redundant safety layer — client runs this too)
  const formatResult = validateNameFormat(rawName)
  if (!formatResult.valid) {
    return NextResponse.json({ valid: false, error: formatResult.error })
  }

  const normalizedName = normalizeName(rawName)

  // Blocklist check
  if (isBlocked(normalizedName)) {
    return NextResponse.json({
      valid: false,
      error: 'NAME NOT PERMITTED',
    })
  }

  return NextResponse.json({ valid: true, normalizedName })
}
