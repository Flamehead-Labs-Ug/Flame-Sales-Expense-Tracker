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
    const projectId = searchParams.get('project_id');
    const cycleId = searchParams.get('cycle_id');
    const search = searchParams.get('search');

    let query = `
      SELECT r.id, r.expense_id, r.file_path, r.upload_date, r.organization_id, r.raw_text, r.structured_data
      FROM receipts r
      LEFT JOIN expenses e ON e.id = r.expense_id AND e.organization_id = r.organization_id
      WHERE r.organization_id = $1
    `;
    const params: any[] = [organizationId];
    let paramIndex = 1;

    if (projectId) {
      paramIndex += 1;
      query += ` AND e.project_id = $${paramIndex}`;
      params.push(projectId);
    }

    if (cycleId) {
      paramIndex += 1;
      query += ` AND e.cycle_id = $${paramIndex}`;
      params.push(cycleId);
    }

    if (search) {
      paramIndex += 1;
      query += ` AND (r.raw_text ILIKE $${paramIndex} OR CAST(r.structured_data AS TEXT) ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
    }

    query += ' ORDER BY r.upload_date DESC';

    const result = await db.query(query, params);

    return NextResponse.json({
      status: 'success',
      receipts: result.rows,
    });
  } catch (error) {
    console.error('Error fetching receipts:', error);
    return NextResponse.json({ status: 'error', message: 'Failed to fetch receipts' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request);
    if (!sessionUser?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'Authentication required' }, { status: 401 });
    }
    const { organizationId } = sessionUser;

    // DB schema now includes raw_text and structured_data
    const { expense_id, file_path, raw_text, structured_data } = await request.json();

    if (!file_path) {
      return NextResponse.json({ status: 'error', message: 'file_path is required' }, { status: 400 });
    }

    const result = await db.query(
      'INSERT INTO receipts (expense_id, file_path, raw_text, structured_data, organization_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [expense_id || null, file_path, raw_text || null, structured_data || null, organizationId]
    );

    return NextResponse.json({
      status: 'success',
      receipt: result.rows[0],
    });
  } catch (error) {
    console.error('Error creating receipt:', error);
    return NextResponse.json({ status: 'error', message: 'Failed to create receipt' }, { status: 500 });
  }
}