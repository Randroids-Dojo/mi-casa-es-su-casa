import { NextRequest, NextResponse } from 'next/server'
import { getCharacter } from '@/lib/kv'

interface LogEntry {
  level: string
  message: string
  timestamp: string
}

interface FeedbackContext {
  urlPath?: string
  userAgent?: string
  viewport?: string
  timestamp?: string
  screenshot?: string | null
  consoleLogs?: LogEntry[] | null
}

function extractCharacterName(urlPath: string | undefined): string | null {
  if (!urlPath) return null
  const match = urlPath.match(/^\/([^/]+)$/)
  if (!match) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}

function formatConsoleLogs(logs: LogEntry[]): string {
  return logs
    .map((l) => {
      const time = l.timestamp.replace(/^.*T/, '').replace(/\.\d+Z$/, '')
      return `[${l.level.toUpperCase()}] ${time} — ${l.message}`
    })
    .join('\n')
}

function buildIssueBody(
  userMessage: string,
  context: FeedbackContext | undefined,
  characterJson: string | null,
): string {
  const parts: string[] = [userMessage]

  if (!context) return userMessage

  // --- Context section ---
  const meta: string[] = []
  if (context.urlPath) meta.push(`**URL:** \`${context.urlPath}\``)
  if (context.timestamp) meta.push(`**Submitted:** ${context.timestamp}`)
  if (context.userAgent) meta.push(`**User Agent:** ${context.userAgent}`)
  if (context.viewport) meta.push(`**Viewport:** ${context.viewport}`)

  if (meta.length > 0) {
    parts.push(
      `<details>\n<summary>Context</summary>\n\n${meta.join('\n')}\n\n</details>`,
    )
  }

  // --- Character state section ---
  if (characterJson) {
    parts.push(
      `<details>\n<summary>Character State (KV Store)</summary>\n\n\`\`\`json\n${characterJson}\n\`\`\`\n\n</details>`,
    )
  }

  // --- Console logs section ---
  if (context.consoleLogs && context.consoleLogs.length > 0) {
    const formatted = formatConsoleLogs(context.consoleLogs)
    parts.push(
      `<details>\n<summary>Console Logs (${context.consoleLogs.length})</summary>\n\n\`\`\`\n${formatted}\n\`\`\`\n\n</details>`,
    )
  }

  // --- Screenshot section ---
  if (context.screenshot) {
    parts.push(
      `<details>\n<summary>Screenshot (base64 JPEG)</summary>\n\nPaste the string below into a browser address bar or base64 decoder to view.\n\n\`\`\`\n${context.screenshot}\n\`\`\`\n\n</details>`,
    )
  }

  let result = parts.join('\n\n')

  // GitHub issue body limit is 65536 chars. Drop the screenshot section if
  // the body is too large — everything else is more useful for debugging.
  const GH_BODY_LIMIT = 65_536
  if (result.length > GH_BODY_LIMIT && context.screenshot) {
    const screenshotIdx = parts.findIndex((p) => p.includes('Screenshot (base64'))
    if (screenshotIdx !== -1) {
      parts.splice(screenshotIdx, 1)
      parts.push('> _Screenshot omitted — body size exceeded GitHub limit._')
      result = parts.join('\n\n')
    }
  }

  return result
}

export async function POST(req: NextRequest) {
  const token = process.env.GITHUB_PAT_MI_CASA
  if (!token) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const { title, body, context } = (await req.json()) as {
    title?: string
    body?: string
    context?: FeedbackContext
  }
  if (!body || !title) {
    return NextResponse.json({ error: 'Missing title or body' }, { status: 400 })
  }

  // Fetch character state from KV if we can identify the character from the URL
  let characterJson: string | null = null
  const characterName = extractCharacterName(context?.urlPath)
  if (characterName) {
    try {
      const state = await getCharacter(characterName)
      if (state) {
        characterJson = JSON.stringify(state, null, 2)
      }
    } catch {
      // KV unavailable — skip silently
    }
  }

  const enrichedBody = buildIssueBody(body, context, characterJson)

  const ghRes = await fetch(
    'https://api.github.com/repos/Randroids-Dojo/mi-casa-es-su-casa/issues',
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title, body: enrichedBody, labels: ['feedback'] }),
    }
  )

  if (!ghRes.ok) {
    const err = await ghRes.text()
    return NextResponse.json({ error: 'GitHub API error', detail: err }, { status: ghRes.status })
  }

  const issue = (await ghRes.json()) as { number: number }
  return NextResponse.json({ number: issue.number }, { status: 201 })
}
