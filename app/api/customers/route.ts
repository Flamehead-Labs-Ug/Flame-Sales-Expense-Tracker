import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { getSessionUser } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request);
    if (!sessionUser?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'Authentication required' }, { status: 401 });
    }
    const { organizationId } = sessionUser;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');

    const params: any[] = [organizationId];
    let where = 'organization_id = $1';

    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      where += ` AND (name ILIKE $2 OR email ILIKE $2 OR phone ILIKE $2 OR phone_number ILIKE $2)`;
    }

    const result = await db.query(
      `SELECT id, name, email, phone, phone_number
       FROM customers
       WHERE ${where}
       ORDER BY name ASC
       LIMIT 200`,
      params
    );

    return NextResponse.json({ status: 'success', customers: result.rows });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', message: 'Failed to fetch customers' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request);
    if (!sessionUser?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'Authentication required' }, { status: 401 });
    }
    const { organizationId } = sessionUser;

    const { name, email, phone, phone_number } = await request.json();

    if (!name || !name.trim()) {
      return NextResponse.json({ status: 'error', message: 'Name is required' }, { status: 400 });
    }

    const result = await db.query(
      `INSERT INTO customers (name, email, phone, phone_number, organization_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, phone, phone_number`,
      [name.trim(), email || null, phone || null, phone_number || null, organizationId]
    );

    return NextResponse.json({ status: 'success', customer: result.rows[0] });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', message: 'Failed to create customer' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request);
    if (!sessionUser?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'Authentication required' }, { status: 401 });
    }
    const { organizationId } = sessionUser;

    const { id, name, email, phone, phone_number } = await request.json();

    if (!id) {
      return NextResponse.json({ status: 'error', message: 'Customer id is required' }, { status: 400 });
    }

    const result = await db.query(
      `UPDATE customers
       SET name = $1, email = $2, phone = $3, phone_number = $4
       WHERE id = $5 AND organization_id = $6
       RETURNING id, name, email, phone, phone_number`,
      [name?.trim() || '', email || null, phone || null, phone_number || null, id, organizationId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ status: 'error', message: 'Customer not found' }, { status: 404 });
    }

    return NextResponse.json({ status: 'success', customer: result.rows[0] });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', message: 'Failed to update customer' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request);
    if (!sessionUser?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'Authentication required' }, { status: 401 });
    }
    const { organizationId } = sessionUser;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ status: 'error', message: 'Customer id is required' }, { status: 400 });
    }

    await db.query('DELETE FROM customers WHERE id = $1 AND organization_id = $2', [id, organizationId]);

    return NextResponse.json({ status: 'success', message: 'Customer deleted' });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', message: 'Failed to delete customer' },
      { status: 500 }
    );
  }
}
