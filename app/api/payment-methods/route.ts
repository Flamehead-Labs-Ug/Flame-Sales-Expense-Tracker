import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/database'
import { getSessionUser } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request);
    if (!sessionUser?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 401 });
    }

    const result = await db.query(
      'SELECT id, method_name AS payment_method, description, organization_id FROM payment_methods WHERE organization_id = $1 ORDER BY method_name',
      [sessionUser.organizationId]
    );
    return NextResponse.json({
      status: 'success',
      payment_methods: result.rows,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to fetch payment methods',
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

    const { method_name, description } = await request.json();

    const result = await db.query(
      'INSERT INTO payment_methods (method_name, description, organization_id) VALUES ($1, $2, $3) RETURNING id, method_name AS payment_method, description, organization_id',
      [method_name, description, sessionUser.organizationId]
    );

    return NextResponse.json({
      status: 'success',
      payment_method: result.rows[0],
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to create payment method',
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

    const { id, method_name, description } = await request.json();

    const result = await db.query(
      'UPDATE payment_methods SET method_name = $1, description = $2 WHERE id = $3 AND organization_id = $4 RETURNING id, method_name AS payment_method, description, organization_id',
      [method_name, description, id, sessionUser.organizationId]
    );

    return NextResponse.json({
      status: 'success',
      payment_method: result.rows[0],
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to update payment method',
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

    await db.query('DELETE FROM payment_methods WHERE id = $1 AND organization_id = $2', [id, sessionUser.organizationId]);

    return NextResponse.json({
      status: 'success',
      message: 'Payment method deleted successfully',
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to delete payment method',
      },
      { status: 500 }
    );
  }
}