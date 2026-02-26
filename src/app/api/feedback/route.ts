import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const token = process.env.GITHUB_PAT_MI_CASA
  if (!token) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const { title, body } = (await req.json()) as { title?: string; body?: string }
  if (!body || !title) {
    return NextResponse.json({ error: 'Missing title or body' }, { status: 400 })
  }

  const ghRes = await fetch(
    'https://api.github.com/repos/Randroids-Dojo/mi-casa-es-su-casa/issues',
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title, body, labels: ['feedback'] }),
    }
  )

  if (!ghRes.ok) {
    const err = await ghRes.text()
    return NextResponse.json({ error: 'GitHub API error', detail: err }, { status: ghRes.status })
  }

  const issue = (await ghRes.json()) as { number: number }
  return NextResponse.json({ number: issue.number }, { status: 201 })
}
