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
      'SELECT id, email, employee_name, user_role, phone_number, created_at, organization_id FROM users WHERE organization_id = $1 ORDER BY created_at DESC',
      [sessionUser.organizationId]
    )

    return NextResponse.json({ status: 'success', users: result.rows })
  } catch (error) {
    console.error('Database error:', error)
    return NextResponse.json({ status: 'error', message: 'Database connection failed' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request)
    if (!sessionUser?.id) {
      return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 401 })
    }

    await db.query('DELETE FROM users WHERE id = $1', [sessionUser.id])

    return NextResponse.json({ status: 'success', message: 'Account deleted' })
  } catch (error) {
    console.error('Error deleting user account:', error)
    return NextResponse.json(
      { status: 'error', message: 'Failed to delete account' },
      { status: 500 },
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request)
    if (!sessionUser?.id) {
      return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 401 })
    }

    const { employee_name, phone_number } = await request.json()

    await db.query(
      'UPDATE users SET employee_name = COALESCE($1, employee_name), phone_number = COALESCE($2, phone_number) WHERE id = $3',
      [employee_name ?? null, phone_number ?? null, sessionUser.id],
    )

    return NextResponse.json({ status: 'success', message: 'Profile updated' })
  } catch (error) {
    console.error('Error updating user profile:', error)
    return NextResponse.json(
      { status: 'error', message: 'Failed to update profile' },
      { status: 500 },
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request)
    if (sessionUser?.role !== 'admin') {
      return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 })
    }

    const { userId, role } = await request.json()
    if (!userId || !role) {
      return NextResponse.json({ status: 'error', message: 'Missing userId or role' }, { status: 400 })
    }

    // Ensure the target user is in the same organization as the admin.
    const targetUserResult = await db.query('SELECT organization_id FROM users WHERE id = $1', [userId])
    if (targetUserResult.rows.length === 0) {
      return NextResponse.json({ status: 'error', message: 'Target user not found' }, { status: 404 })
    }

    if (targetUserResult.rows[0].organization_id !== sessionUser.organizationId) {
      return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 })
    }

    await db.query('UPDATE users SET user_role = $1 WHERE id = $2', [role, userId])
    return NextResponse.json({ status: 'success', message: 'User role updated' })
  } catch (error) {
    console.error('Database error:', error)
    return NextResponse.json({ status: 'error', message: 'Failed to update user role' }, { status: 500 })
  }
}