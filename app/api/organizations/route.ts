import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { getSessionUser } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request);
    if (!sessionUser?.organizationId) {
      return NextResponse.json({ status: 'success', organizations: [] });
    }

    const userOrgId = sessionUser.organizationId;

    const result = await db.query(
      'SELECT id, name, created_at, country_code, currency_code, currency_symbol FROM organizations WHERE id = $1',
      [userOrgId]
    );

    return NextResponse.json({
      status: 'success',
      organizations: result.rows
    });
  } catch (error) {
    console.error('Error fetching organizations:', error);
    return NextResponse.json({ status: 'error', message: 'Failed to fetch organizations' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request);
    if (!sessionUser?.id) {
      return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 401 });
    }

    const { name, countryCode, currencyCode, currencySymbol } = await request.json();
    if (!name) {
      return NextResponse.json({ status: 'error', message: 'Organization name is required' }, { status: 400 });
    }

    // Create the organization and record who created it
    const result = await db.query(
      'INSERT INTO organizations (name, country_code, currency_code, currency_symbol, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, created_at, country_code, currency_code, currency_symbol, created_by',
      [name, countryCode || null, currencyCode || null, currencySymbol || null, sessionUser.id]
    );

    const newOrgId = result.rows[0].id;

    // Update the current user to belong to this organization and set as admin
    await db.query(
      'UPDATE users SET organization_id = $1, user_role = $2 WHERE id = $3',
      [newOrgId, 'admin', sessionUser.id]
    );

    return NextResponse.json({
      status: 'success',
      organization: {
        ...result.rows[0],
        organization_name: result.rows[0].name,
      },
    });
  } catch (error) {
    console.error('Error creating organization:', error);
    return NextResponse.json({ status: 'error', message: 'Failed to create organization' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request);
    if (sessionUser?.role !== 'admin') {
      return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 401 });
    }

    const { id, name, countryCode, currencyCode, currencySymbol } = await request.json();
    if (!id || !name) {
      return NextResponse.json({ status: 'error', message: 'Organization ID and name are required' }, { status: 400 });
    }

    // Ensure the admin is updating their own organization
    if (id !== sessionUser.organizationId) {
        return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 });
    }

    const result = await db.query(
      'UPDATE organizations SET name = $1, country_code = COALESCE($2, country_code), currency_code = COALESCE($3, currency_code), currency_symbol = COALESCE($4, currency_symbol), updated_at = NOW() WHERE id = $5 RETURNING id, name, created_at, updated_at, country_code, currency_code, currency_symbol',
      [name, countryCode || null, currencyCode || null, currencySymbol || null, id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ status: 'error', message: 'Organization not found' }, { status: 404 });
    }

    return NextResponse.json({
      status: 'success',
      organization: result.rows[0],
    });
  } catch (error) {
    console.error('Error updating organization:', error);
    return NextResponse.json({ status: 'error', message: 'Failed to update organization' }, { status: 500 });
  }
}