import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/database'
import { getApiOrSessionUser } from '@/lib/api-auth-keys'

export const dynamic = 'force-dynamic'

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
        WHERE id = $1
          AND user_id = $2
        LIMIT 1`,
      [sessionId, user.id],
    )

    const session = result.rows[0] ?? null
    if (!session) {
      return NextResponse.json({ status: 'error', message: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({ status: 'success', session, chatSession: session })
  } catch (error) {
    console.error('Assistant chat session GET error:', error)
    return NextResponse.json({ status: 'error', message: 'Failed to fetch assistant chat session' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
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

    const body = await request.json().catch(() => ({}))

    const titleRaw = typeof body?.title === 'string' ? body.title.trim() : null
    const title = titleRaw && titleRaw.length > 0 ? titleRaw : null

    const contextValue =
      body?.context && typeof body.context === 'object' && !Array.isArray(body.context) ? body.context : null

    const result = await db.query(
      `UPDATE assistant_chat_sessions
          SET title = $1,
              context = $2,
              updated_at = NOW()
        WHERE id = $3
          AND user_id = $4
        RETURNING id, user_id, organization_id, title, context, created_at, updated_at, last_message_at`,
      [title, contextValue, sessionId, user.id],
    )

    const session = result.rows[0] ?? null
    if (!session) {
      return NextResponse.json({ status: 'error', message: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({ status: 'success', session, chatSession: session })
  } catch (error) {
    console.error('Assistant chat session PATCH error:', error)
    return NextResponse.json({ status: 'error', message: 'Failed to update assistant chat session' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
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

    const result = await db.query('DELETE FROM assistant_chat_sessions WHERE id = $1 AND user_id = $2 RETURNING id', [
      sessionId,
      user.id,
    ])

    if (!result.rows.length) {
      return NextResponse.json({ status: 'error', message: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({ status: 'success' })
  } catch (error) {
    console.error('Assistant chat session DELETE error:', error)
    return NextResponse.json({ status: 'error', message: 'Failed to delete assistant chat session' }, { status: 500 })
  }
}
