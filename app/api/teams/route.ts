import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/database'
import { getSessionUser } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request)
    if (!sessionUser?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 401 })
    }

    const result = await db.query(
      'SELECT * FROM teams WHERE organization_id = $1 ORDER BY name',
      [sessionUser.organizationId]
    )

    return NextResponse.json({ status: 'success', teams: result.rows })
  } catch (error) {
    console.error('Database error:', error)
    return NextResponse.json({ status: 'error', message: 'Failed to fetch teams' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request)
    if (sessionUser?.role !== 'admin') {
      return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 })
    }

    const { name, team_lead_id } = await request.json()
    if (!name) {
      return NextResponse.json({ status: 'error', message: 'Team name is required' }, { status: 400 })
    }

    const result = await db.query(
      'INSERT INTO teams (name, organization_id, team_lead_id) VALUES ($1, $2, $3) RETURNING *',
      [name, sessionUser.organizationId, team_lead_id || null]
    )

    return NextResponse.json({ status: 'success', team: result.rows[0] }, { status: 201 })
  } catch (error) {
    console.error('Database error:', error)
    return NextResponse.json({ status: 'error', message: 'Failed to create team' }, { status: 500 })
  }
}
