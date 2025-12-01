import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/database'
import { getSessionUser } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request);
    if (!sessionUser?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const expenseId = searchParams.get('expense_id');

    let query = 'SELECT * FROM mileage_logs WHERE organization_id = $1';
    let params: any[] = [sessionUser.organizationId];

    if (expenseId) {
      query += ' AND expense_id = $2';
      params.push(expenseId);
    }

    query += ' ORDER BY date DESC LIMIT 100';

    const result = await db.query(query, params);
    return NextResponse.json({
      status: 'success',
      mileage_logs: result.rows,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to fetch mileage logs',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request);
    if (!sessionUser?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 401 });
    }

    const { expense_id, vehicle, starting_location, ending_location, distance, distance_unit, purpose, date } = await request.json();

    const result = await db.query(
      'INSERT INTO mileage_logs (distance, start_location, end_location, purpose, date, created_by, organization_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [distance, starting_location, ending_location, purpose, date, sessionUser.id, sessionUser.organizationId]
    );

    return NextResponse.json({
      status: 'success',
      mileage_log: result.rows[0],
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to create mileage log',
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request);
    if (!sessionUser?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 401 });
    }

    const { id, distance, start_location, end_location, purpose, date } = await request.json();

    const result = await db.query(
      'UPDATE mileage_logs SET distance = $1, start_location = $2, end_location = $3, purpose = $4, date = $5 WHERE id = $6 AND organization_id = $7 RETURNING *',
      [distance, start_location, end_location, purpose, date, id, sessionUser.organizationId]
    );

    return NextResponse.json({
      status: 'success',
      mileage_log: result.rows[0],
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to update mileage log',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request);
    if (!sessionUser?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    await db.query('DELETE FROM mileage_logs WHERE id = $1 AND organization_id = $2', [id, sessionUser.organizationId]);

    return NextResponse.json({
      status: 'success',
      message: 'Mileage log deleted successfully',
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to delete mileage log',
      },
      { status: 500 }
    );
  }
}