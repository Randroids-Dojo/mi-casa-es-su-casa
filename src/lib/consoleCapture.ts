interface LogEntry {
  level: 'warn' | 'error' | 'uncaught'
  message: string
  timestamp: string
}

const MAX_ENTRIES = 50
const entries: LogEntry[] = []
let initialized = false

const MAX_MESSAGE_LENGTH = 1000

function pushEntry(level: LogEntry['level'], args: unknown[]): void {
  let message = args
    .map((a) => {
      try {
        return typeof a === 'string' ? a : JSON.stringify(a)
      } catch {
        return String(a)
      }
    })
    .join(' ')

  if (message.length > MAX_MESSAGE_LENGTH) {
    message = message.slice(0, MAX_MESSAGE_LENGTH) + '…'
  }

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
    pushEntry('uncaught', [e.message, e.filename, e.lineno].filter(Boolean))
  })

  window.addEventListener('unhandledrejection', (e) => {
    pushEntry('uncaught', ['Unhandled rejection:', e.reason])
  })
}

export function getCapturedLogs(): LogEntry[] {
  return [...entries]
}
