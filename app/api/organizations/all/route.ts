import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { getSessionUser } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request);
    if (!sessionUser?.id) {
      // No authenticated user, or user record not found
      return NextResponse.json({
        status: 'success',
        organizations: []
      });
    }

    const result = await db.query(`
      SELECT id, name, created_at, country_code, currency_code, currency_symbol
      FROM organizations
      WHERE created_by = $1
      ORDER BY name
    `, [sessionUser.id]);

    return NextResponse.json({
      status: 'success',
      organizations: result.rows
    });
  } catch (error) {
    console.error('Error fetching organizations:', error);
    return NextResponse.json({ status: 'error', message: 'Failed to fetch organizations' }, { status: 500 });
  }
}