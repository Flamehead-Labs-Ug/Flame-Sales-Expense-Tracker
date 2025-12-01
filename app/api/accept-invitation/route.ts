import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { getSessionUser } from '@/lib/api-auth';

// GET handler to validate a token and get user info
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');

  if (!token) {
    return NextResponse.json({ status: 'error', message: 'Invitation token is missing.' }, { status: 400 });
  }

  try {
    const result = await db.query(`
      SELECT u.email, u.employee_name as username, o.name as organizationName
      FROM users u
      JOIN organizations o ON u.organization_id = o.id
      WHERE u.invitation_token = $1 AND u.invitation_expires_at > NOW() AND u.status = 'pending'
    `, [token]);

    if (result.rows.length === 0) {
      return NextResponse.json({ status: 'error', message: 'Invitation is invalid or has expired.' }, { status: 404 });
    }

    return NextResponse.json({ status: 'success', user: result.rows[0] });
  } catch (error) {
    console.error('Error validating invitation token:', error);
    return NextResponse.json({ status: 'error', message: 'An unexpected error occurred.' }, { status: 500 });
  }
}

// POST handler to activate an account
export async function POST(request: NextRequest) {
  const client = await db.connect();
  try {
    const sessionUser = await getSessionUser(request);
    if (!sessionUser?.id || !sessionUser.email) {
      return NextResponse.json({ status: 'error', message: 'Authentication required.' }, { status: 401 });
    }

    const { token } = await request.json();
    if (!token) {
      return NextResponse.json({ status: 'error', message: 'Invitation token is missing.' }, { status: 400 });
    }

    await client.query('BEGIN');

    const result = await client.query(
      'SELECT id, email FROM users WHERE invitation_token = $1 AND invitation_expires_at > NOW() AND status = $2',
      [token, 'pending']
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ status: 'error', message: 'Invitation is invalid or has expired.' }, { status: 404 });
    }

    const pendingUser = result.rows[0];

    // Ensure the authenticated user's email matches the invited email
    if (pendingUser.email !== sessionUser.email) {
        await client.query('ROLLBACK');
        return NextResponse.json({ status: 'error', message: 'Authenticated user does not match the invited user.' }, { status: 403 });
    }

    // Activate the user
    await client.query(`
      UPDATE users
      SET status = 'active',
          invitation_token = NULL,
          invitation_expires_at = NULL,
          oauth_sub = (SELECT oauth_sub FROM users WHERE id = $1), -- Copy oauth_sub from the authenticated session user record
          oauth_provider = (SELECT oauth_provider FROM users WHERE id = $1)
      WHERE id = $2;
    `, [sessionUser.id, pendingUser.id]);
    
    // The sessionUser record might be a separate, temporary record created by NextAuth on first login.
    // If the invited user ID is different from the session user ID, we can consider merging or deleting the temporary one.
    if (pendingUser.id !== sessionUser.id) {
        await client.query('DELETE FROM users WHERE id = $1', [sessionUser.id]);
    }

    await client.query('COMMIT');

    return NextResponse.json({ status: 'success', message: 'Account activated successfully.' });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error activating account:', error);
    return NextResponse.json({ status: 'error', message: 'Failed to activate account.' }, { status: 500 });
  } finally {
    client.release();
  }
}
