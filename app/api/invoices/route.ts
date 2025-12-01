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
    const projectId = searchParams.get('project_id');
    const cycleId = searchParams.get('cycle_id');
    const customerId = searchParams.get('customer_id');

    const params: any[] = [organizationId];
    let idx = 2;

    // Always scope by organization
    let where = 'i.organization_id = $1';

    // When filtering by project/cycle, also include invoices that are not linked to any sales
    // (invoice-first flow), so they still show up regardless of project/cycle selection.
    if (projectId) {
      params.push(parseInt(projectId, 10));
      where += ` AND (s.project_id = $${idx} OR s.id IS NULL)`;
      idx += 1;
    }

    if (cycleId) {
      params.push(parseInt(cycleId, 10));
      where += ` AND (s.cycle_id = $${idx} OR s.id IS NULL)`;
      idx += 1;
    }

    if (customerId) {
      params.push(parseInt(customerId, 10));
      where += ` AND i.customer_id = $${idx}`;
      idx += 1;
    }

    const result = await db.query(
      `SELECT
         i.id,
         i.invoice_number,
         i.invoice_date,
         i.due_date,
         i.currency,
         i.net_amount,
         i.vat_amount,
         i.gross_amount,
         i.status,
         i.pdf_url,
         i.customer_id,
         c.name AS customer_name
       FROM invoices i
       LEFT JOIN customers c ON c.id = i.customer_id
       LEFT JOIN invoice_sales inv_s ON inv_s.invoice_id = i.id
       LEFT JOIN sales s ON s.id = inv_s.sale_id
       WHERE ${where}
       GROUP BY i.id, c.name
       ORDER BY i.invoice_date DESC NULLS LAST, i.id DESC
       LIMIT 200`,
      params
    );

    return NextResponse.json({ status: 'success', invoices: result.rows });
  } catch (error) {
    console.error('Failed to fetch invoices:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch invoices';
    return NextResponse.json(
      { status: 'error', message },
      { status: 500 }
    );
  }
}
