import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';

export async function GET(_request: NextRequest) {
  try {
    const result = await db.query(
      'SELECT code, name FROM currencies ORDER BY code',
    );

    return NextResponse.json({
      status: 'success',
      currencies: result.rows,
    });
  } catch (error) {
    console.error('Error fetching currencies:', error);
    return NextResponse.json({ status: 'error', message: 'Failed to fetch currencies' }, { status: 500 });
  }
}
