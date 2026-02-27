interface LogEntry {
  level: 'warn' | 'error' | 'uncaught'
  message: string
  timestamp: string
}

const MAX_ENTRIES = 50
const entries: LogEntry[] = []
let initialized = false

function pushEntry(level: LogEntry['level'], args: unknown[]): void {
  const message = args
    .map((a) => {
      try {
        return typeof a === 'string' ? a : JSON.stringify(a)
      } catch {
        return String(a)
      }
    })
    .join(' ')

  entries.push({ level, message, timestamp: new Date().toISOString() })
  if (entries.length > MAX_ENTRIES) entries.shift()
}

export function initConsoleCapture(): void {
  if (initialized || typeof window === 'undefined') return
  initialized = true

  const origError = console.error
  const origWarn = console.warn

  console.error = (...args: unknown[]) => {
    pushEntry('error', args)
    origError.apply(console, args)
  }

  console.warn = (...args: unknown[]) => {
    pushEntry('warn', args)
    origWarn.apply(console, args)
  }

  window.addEventListener('error', (e) => {
    pushEntry('uncaught', [e.message, e.filename, e.lineno])
  })

  window.addEventListener('unhandledrejection', (e) => {
    pushEntry('uncaught', ['Unhandled rejection:', e.reason])
  })
}

export function getCapturedLogs(): LogEntry[] {
  return [...entries]
}
