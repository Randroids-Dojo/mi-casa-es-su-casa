export interface ValidationResult {
  valid: boolean
  error?: string
}

/**
 * Normalize a name: lowercase and trim whitespace.
 */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}

/**
 * Validate name format rules (client-safe, no blocklist check).
 *
 * Rules:
 * - Length 2–20 characters (after trimming)
 * - Allowed chars: A-Z a-z 0-9 - _
 * - Cannot start or end with - or _
 */
export function validateNameFormat(name: string): ValidationResult {
  const trimmed = name.trim()

  if (trimmed.length === 0) {
    return { valid: false, error: 'NAME REQUIRED' }
  }

  if (trimmed.length < 2) {
    return { valid: false, error: 'NAME TOO SHORT (MIN 2 CHARACTERS)' }
  }

  if (trimmed.length > 20) {
    return { valid: false, error: 'NAME TOO LONG (MAX 20 CHARACTERS)' }
  }

  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) {
    return {
      valid: false,
      error: 'INVALID CHARACTERS (USE A-Z, 0-9, - OR _)',
    }
  }

  if (/^[-_]/.test(trimmed)) {
    return { valid: false, error: 'NAME CANNOT START WITH - OR _' }
  }

  if (/[-_]$/.test(trimmed)) {
    return { valid: false, error: 'NAME CANNOT END WITH - OR _' }
  }

  return { valid: true }
}
