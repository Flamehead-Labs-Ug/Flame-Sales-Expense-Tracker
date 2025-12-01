import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/database'
import { getSessionUser } from '@/lib/api-auth'

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request)
    if (sessionUser?.role !== 'admin') {
      return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 })
    }

    const { team_id, user_id, role } = await request.json()
    if (!team_id || !user_id) {
      return NextResponse.json({ status: 'error', message: 'Team ID and User ID are required' }, { status: 400 })
    }

    // Verify that the team and user belong to the admin's organization
    const teamResult = await db.query('SELECT organization_id FROM teams WHERE id = $1', [team_id])
    const userResult = await db.query('SELECT organization_id FROM users WHERE id = $1', [user_id])

    if (teamResult.rows.length === 0 || userResult.rows.length === 0) {
      return NextResponse.json({ status: 'error', message: 'Team or User not found' }, { status: 404 })
    }

    if (teamResult.rows[0].organization_id !== sessionUser.organizationId || userResult.rows[0].organization_id !== sessionUser.organizationId) {
      return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 })
    }

    await db.query(
      'INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, $3)',
      [team_id, user_id, role || 'member']
    )

    return NextResponse.json({ status: 'success', message: 'User added to team' }, { status: 201 })
  } catch (error) {
    console.error('Database error:', error)
    return NextResponse.json({ status: 'error', message: 'Failed to add user to team' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request)
    if (sessionUser?.role !== 'admin') {
      return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 })
    }

    const { team_id, user_id } = await request.json()
    if (!team_id || !user_id) {
      return NextResponse.json({ status: 'error', message: 'Team ID and User ID are required' }, { status: 400 })
    }

    // Verify that the team and user belong to the admin's organization
    const teamResult = await db.query('SELECT organization_id FROM teams WHERE id = $1', [team_id])
    if (teamResult.rows.length === 0 || teamResult.rows[0].organization_id !== sessionUser.organizationId) {
        return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 })
    }

    await db.query('DELETE FROM team_members WHERE team_id = $1 AND user_id = $2', [team_id, user_id])

    return NextResponse.json({ status: 'success', message: 'User removed from team' })
  } catch (error) {
    console.error('Database error:', error)
    return NextResponse.json({ status: 'error', message: 'Failed to remove user from team' }, { status: 500 })
  }
}
