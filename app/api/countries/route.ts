import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';

export async function GET(_request: NextRequest) {
  try {
    const result = await db.query(
      'SELECT code, name, currency_code FROM countries ORDER BY name',
    );

    return NextResponse.json({
      status: 'success',
      countries: result.rows,
    });
  } catch (error) {
    console.error('Error fetching countries:', error);
    return NextResponse.json(
      { status: 'error', message: 'Failed to fetch countries' },
      { status: 500 },
    );
  }
}
