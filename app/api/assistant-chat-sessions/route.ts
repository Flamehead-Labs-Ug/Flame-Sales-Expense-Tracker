import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/database'
import { getApiOrSessionUser } from '@/lib/api-auth-keys'

export const dynamic = 'force-dynamic'

function parseLimit(value: string | null, fallback: number) {
  const n = value ? Number.parseInt(value, 10) : Number.NaN
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.min(Math.max(n, 1), 200)
}

function parseOffset(value: string | null) {
  const n = value ? Number.parseInt(value, 10) : Number.NaN
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}

export async function GET(request: NextRequest) {
  try {
    const user = await getApiOrSessionUser(request)
    if (!user) {
      return NextResponse.json({ status: 'error', message: 'API key required' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const limit = parseLimit(searchParams.get('limit'), 50)
    const offset = parseOffset(searchParams.get('offset'))

    const result = await db.query(
      `SELECT id,
              user_id,
              organization_id,
              title,
              context,
              created_at,
              updated_at,
              last_message_at
         FROM assistant_chat_sessions
        WHERE user_id = $1
        ORDER BY COALESCE(last_message_at, updated_at, created_at) DESC
        LIMIT $2 OFFSET $3`,
      [user.id, limit, offset],
    )

    return NextResponse.json({
      status: 'success',
      sessions: result.rows,
      chatSessions: result.rows,
    })
  } catch (error) {
    console.error('Assistant chat sessions GET error:', error)
    return NextResponse.json({ status: 'error', message: 'Failed to fetch assistant chat sessions' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getApiOrSessionUser(request)
    if (!user) {
      return NextResponse.json({ status: 'error', message: 'API key required' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))

    const titleRaw = typeof body?.title === 'string' ? body.title.trim() : ''
    const title = titleRaw.length > 0 ? titleRaw : null

    const context = body?.context && typeof body.context === 'object' && !Array.isArray(body.context) ? body.context : null

    const requestedOrgId = body?.organization_id ?? body?.organizationId
    const orgId = requestedOrgId != null ? Number.parseInt(String(requestedOrgId), 10) : user.organizationId

    if (requestedOrgId != null) {
      if (String(user.organizationId ?? '') !== String(orgId ?? '')) {
        if (user.role !== 'admin') {
          return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 })
        }

        const orgCheck = await db.query('SELECT id FROM organizations WHERE id = $1 AND created_by = $2', [orgId, user.id])
        if (!orgCheck.rows.length) {
          return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 })
        }
      }
    }

    const result = await db.query(
      `INSERT INTO assistant_chat_sessions (user_id, organization_id, title, context)
       VALUES ($1, $2, $3, $4)
       RETURNING id, user_id, organization_id, title, context, created_at, updated_at, last_message_at`,
      [user.id, orgId ?? null, title, context],
    )

    const session = result.rows[0] ?? null

    return NextResponse.json({
      status: 'success',
      session,
      chatSession: session,
    })
  } catch (error) {
    console.error('Assistant chat sessions POST error:', error)
    return NextResponse.json({ status: 'error', message: 'Failed to create assistant chat session' }, { status: 500 })
  }
}
