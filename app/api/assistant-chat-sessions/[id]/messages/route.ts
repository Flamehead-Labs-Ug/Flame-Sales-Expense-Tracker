import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/database'
import { getApiOrSessionUser } from '@/lib/api-auth-keys'

export const dynamic = 'force-dynamic'

function parseLimit(value: string | null, fallback: number) {
  const n = value ? Number.parseInt(value, 10) : Number.NaN
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.min(Math.max(n, 1), 500)
}

function parseOffset(value: string | null) {
  const n = value ? Number.parseInt(value, 10) : Number.NaN
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}

const ALLOWED_ROLES = new Set(['user', 'assistant', 'system', 'tool'])

async function assertSessionOwner(sessionId: number, userId: number) {
  const sessionResult = await db.query(
    'SELECT id, user_id FROM assistant_chat_sessions WHERE id = $1 AND user_id = $2 LIMIT 1',
    [sessionId, userId],
  )
  return sessionResult.rows[0] ?? null
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiOrSessionUser(request)
    if (!user) {
      return NextResponse.json({ status: 'error', message: 'API key required' }, { status: 401 })
    }

    const params = await context.params
    const sessionId = Number.parseInt(params.id, 10)
    if (!Number.isFinite(sessionId)) {
      return NextResponse.json({ status: 'error', message: 'Invalid session id' }, { status: 400 })
    }

    const session = await assertSessionOwner(sessionId, user.id)
    if (!session) {
      return NextResponse.json({ status: 'error', message: 'Not found' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const limit = parseLimit(searchParams.get('limit'), 200)
    const offset = parseOffset(searchParams.get('offset'))

    const result = await db.query(
      `SELECT id,
              session_id,
              role,
              content,
              created_at,
              metadata
         FROM assistant_chat_messages
        WHERE session_id = $1
        ORDER BY created_at ASC
        LIMIT $2 OFFSET $3`,
      [sessionId, limit, offset],
    )

    return NextResponse.json({
      status: 'success',
      messages: result.rows,
      chatMessages: result.rows,
    })
  } catch (error) {
    console.error('Assistant chat messages GET error:', error)
    return NextResponse.json({ status: 'error', message: 'Failed to fetch assistant chat messages' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiOrSessionUser(request)
    if (!user) {
      return NextResponse.json({ status: 'error', message: 'API key required' }, { status: 401 })
    }

    const params = await context.params
    const sessionId = Number.parseInt(params.id, 10)
    if (!Number.isFinite(sessionId)) {
      return NextResponse.json({ status: 'error', message: 'Invalid session id' }, { status: 400 })
    }

    const session = await assertSessionOwner(sessionId, user.id)
    if (!session) {
      return NextResponse.json({ status: 'error', message: 'Not found' }, { status: 404 })
    }

    const body = await request.json().catch(() => ({}))

    const role = typeof body?.role === 'string' ? body.role : null
    if (!role || !ALLOWED_ROLES.has(role)) {
      return NextResponse.json({ status: 'error', message: 'Invalid role' }, { status: 400 })
    }

    const contentRaw = typeof body?.content === 'string' ? body.content : ''
    const content = contentRaw.trim()
    if (!content) {
      return NextResponse.json({ status: 'error', message: 'Content required' }, { status: 400 })
    }

    const metadata = body?.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata) ? body.metadata : null

    const result = await db.query(
      `INSERT INTO assistant_chat_messages (session_id, role, content, metadata)
       VALUES ($1, $2, $3, $4)
       RETURNING id, session_id, role, content, created_at, metadata`,
      [sessionId, role, content, metadata],
    )

    await db.query(
      'UPDATE assistant_chat_sessions SET updated_at = NOW(), last_message_at = NOW() WHERE id = $1',
      [sessionId],
    )

    const message = result.rows[0] ?? null

    return NextResponse.json({
      status: 'success',
      message,
      chatMessage: message,
    })
  } catch (error) {
    console.error('Assistant chat messages POST error:', error)
    return NextResponse.json({ status: 'error', message: 'Failed to create assistant chat message' }, { status: 500 })
  }
}
