import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { getSessionUser } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request);
    if (!sessionUser?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'Authentication required' }, { status: 401 });
    }

    const { organizationId } = sessionUser;
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const cycleId = searchParams.get('cycleId');

    const params: (number | string | null)[] = [organizationId, projectId, cycleId];

    const query = `
      WITH project_revenue AS (
        SELECT
          project_id,
          SUM(amount) AS total_revenue
        FROM sales
        WHERE organization_id = $1
          AND ($2::int IS NULL OR project_id = $2::int)
          AND ($3::int IS NULL OR cycle_id = $3::int)
        GROUP BY project_id
      ),
      project_expenses AS (
        SELECT
          project_id,
          SUM(amount) AS total_expenses
        FROM expenses
        WHERE organization_id = $1
          AND ($2::int IS NULL OR project_id = $2::int)
          AND ($3::int IS NULL OR cycle_id = $3::int)
        GROUP BY project_id
      )
      SELECT
        p.id AS project_id,
        p.project_name,
        COALESCE(r.total_revenue, 0) AS total_revenue,
        COALESCE(e.total_expenses, 0) AS total_expenses
      FROM projects p
      LEFT JOIN project_revenue r ON r.project_id = p.id
      LEFT JOIN project_expenses e ON e.project_id = p.id
      WHERE p.organization_id = $1
        AND ($2::int IS NULL OR p.id = $2::int)
      ORDER BY p.project_name;
    `;

    const result = await db.query(query, params);

    const data = result.rows.map(row => {
      const totalRevenue = parseFloat(row.total_revenue) || 0;
      const totalExpenses = parseFloat(row.total_expenses) || 0;
      return {
        projectId: row.project_id,
        projectName: row.project_name,
        totalRevenue,
        totalExpenses,
        netProfit: totalRevenue - totalExpenses,
      };
    });

    return NextResponse.json({ status: 'success', data });
  } catch (error) {
    console.error('Failed to fetch P&L by project:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ status: 'error', message }, { status: 500 });
  }
}
