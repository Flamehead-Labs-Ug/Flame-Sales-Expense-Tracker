import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/database'
import { getSessionUser } from '@/lib/api-auth'

export async function GET(request: NextRequest, { params }: { params: { teamId: string } }) {
  try {
    const sessionUser = await getSessionUser(request)
    if (!sessionUser?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 401 })
    }

    const teamId = parseInt(params.teamId, 10)

    // Verify that the team belongs to the user's organization
    const teamResult = await db.query('SELECT organization_id FROM teams WHERE id = $1', [teamId])
    if (teamResult.rows.length === 0 || teamResult.rows[0].organization_id !== sessionUser.organizationId) {
      return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 })
    }

    const result = await db.query(
      'SELECT * FROM team_members WHERE team_id = $1',
      [teamId]
    )

    return NextResponse.json({ status: 'success', members: result.rows })
  } catch (error) {
    console.error('Database error:', error)
    return NextResponse.json({ status: 'error', message: 'Failed to fetch team members' }, { status: 500 })
  }
}
