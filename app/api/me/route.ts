import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/api-auth'

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request);
    if (!sessionUser) {
      return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json({ status: 'success', user: sessionUser });
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json({ status: 'error', message: 'Database error' }, { status: 500 });
  }
}
