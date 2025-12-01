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

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    const params: (number | string | null)[] = [sessionUser.organizationId, projectId];

    const query = `
      SELECT
        c.id AS cycle_id,
        c.cycle_name,
        COALESCE(c.budget_allotment, 0) AS budget,
        COALESCE(expenses.total_expenses, 0) AS actual_expenses,
        COALESCE(sales.total_revenue, 0) AS actual_revenue
      FROM cycles c
      LEFT JOIN (
        SELECT
          cycle_id,
          SUM(amount) AS total_expenses
        FROM expenses
        WHERE organization_id = $1
        GROUP BY cycle_id
      ) expenses ON expenses.cycle_id = c.id
      LEFT JOIN (
        SELECT
          cycle_id,
          SUM(amount) AS total_revenue
        FROM sales
        WHERE organization_id = $1
        GROUP BY cycle_id
      ) sales ON sales.cycle_id = c.id
      WHERE c.organization_id = $1
        AND ($2::int IS NULL OR c.project_id = $2::int)
      ORDER BY c.start_date NULLS FIRST, c.id;
    `;

    const result = await db.query(query, params);

    const data = result.rows.map(row => {
      const budget = parseFloat(row.budget) || 0;
      const actualExpenses = parseFloat(row.actual_expenses) || 0;
      const actualRevenue = parseFloat(row.actual_revenue) || 0;
      return {
        cycleId: row.cycle_id,
        cycleName: row.cycle_name,
        budget,
        actualExpenses,
        actualRevenue,
        variance: budget - actualExpenses,
      };
    });

    return NextResponse.json({ status: 'success', data });
  } catch (error) {
    console.error('Failed to fetch budget vs actual by cycle:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ status: 'error', message }, { status: 500 });
  }
}
