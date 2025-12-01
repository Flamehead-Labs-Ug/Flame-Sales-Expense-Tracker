import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { getSessionUser } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request);
    if (!sessionUser?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const cycleId = searchParams.get('cycleId');

    const params: (number | string | null)[] = [sessionUser.organizationId, projectId, cycleId];

    const result = await db.query(
      `
      SELECT 
        ec.category_name,
        SUM(e.amount) as total_amount
      FROM expenses e
      JOIN expense_category ec ON e.category_id = ec.id
      WHERE e.organization_id = $1
        AND ($2::int IS NULL OR e.project_id = $2::int)
        AND ($3::int IS NULL OR e.cycle_id = $3::int)
      GROUP BY ec.category_name
      ORDER BY total_amount DESC
    `,
      params
    );

    const data = result.rows.map(row => ({
      ...row,
      total_amount: parseFloat(row.total_amount),
    }));

    return NextResponse.json({
      status: 'success',
      data,
    });
  } catch (error) {
    console.error('Error fetching expenses by category:', error);
    return NextResponse.json({ status: 'error', message: 'Failed to fetch expenses by category' }, { status: 500 });
  }
}
