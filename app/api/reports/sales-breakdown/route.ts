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
    const rawDimension = searchParams.get('dimension');
    const dimension = rawDimension === 'product' ? 'product' : 'customer';
    const projectId = searchParams.get('projectId');
    const cycleId = searchParams.get('cycleId');

    const params: (number | string | null)[] = [sessionUser.organizationId, projectId, cycleId];

    let query = '';

    if (dimension === 'product') {
      query = `
        SELECT
          p.product_name AS label,
          SUM(s.amount) AS total_sales
        FROM sales s
        JOIN products p ON s.product_id = p.id
        WHERE s.organization_id = $1
          AND ($2::int IS NULL OR s.project_id = $2::int)
          AND ($3::int IS NULL OR s.cycle_id = $3::int)
        GROUP BY p.product_name
        ORDER BY total_sales DESC
      `;
    } else {
      query = `
        SELECT
          COALESCE(s.customer_name, 'Unknown') AS label,
          SUM(s.amount) AS total_sales
        FROM sales s
        WHERE s.organization_id = $1
          AND ($2::int IS NULL OR s.project_id = $2::int)
          AND ($3::int IS NULL OR s.cycle_id = $3::int)
        GROUP BY COALESCE(s.customer_name, 'Unknown')
        ORDER BY total_sales DESC
      `;
    }

    const result = await db.query(query, params);

    const data = result.rows.map(row => ({
      label: row.label,
      totalSales: parseFloat(row.total_sales) || 0,
    }));

    return NextResponse.json({
      status: 'success',
      dimension,
      data,
    });
  } catch (error) {
    console.error('Failed to fetch sales breakdown:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ status: 'error', message }, { status: 500 });
  }
}
