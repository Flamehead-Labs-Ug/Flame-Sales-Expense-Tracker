import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { getSessionUser } from '@/lib/api-auth';
import { convertAmount } from '@/lib/currency-api';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request);
    if (!sessionUser?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'Authentication required' }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const orgIdParam = searchParams.get('orgId');
    const projectId = searchParams.get('projectId');
    const cycleId = searchParams.get('cycleId');

    let organizationId = sessionUser.organizationId;
    let orgCurrencyCode: string | null = null;

    if (orgIdParam) {
      const orgCheck = await db.query(
        'SELECT id, currency_code FROM organizations WHERE id = $1 AND created_by = $2',
        [orgIdParam, sessionUser.id]
      );

      if (orgCheck.rowCount === 0) {
        return NextResponse.json(
          { status: 'error', message: 'Forbidden' },
          { status: 403 },
        );
      }

      organizationId = parseInt(orgIdParam, 10);
      orgCurrencyCode = orgCheck.rows[0]?.currency_code ?? null;
    }

    if (!orgCurrencyCode) {
      const orgRes = await db.query(
        'SELECT currency_code FROM organizations WHERE id = $1',
        [organizationId]
      );
      orgCurrencyCode = orgRes.rows[0]?.currency_code ?? null;
    }

    const isOrgLevelView = !projectId;

    let totalRevenue = 0;
    let totalExpenses = 0;
    let totalBudgetAllotment = 0;

    if (!isOrgLevelView || !orgCurrencyCode) {
      // Project-level view or no org currency configured: fall back to simple aggregation in stored units.
      let totalSalesQuery = `SELECT COALESCE(SUM(amount), 0) as total_revenue FROM sales WHERE organization_id = $1`;
      let totalExpensesQuery = `SELECT COALESCE(SUM(amount), 0) as total_expenses FROM expenses WHERE organization_id = $1`;
      let totalBudgetQuery = `SELECT COALESCE(SUM(budget_allotment), 0) as total_budget FROM cycles WHERE organization_id = $1`;

      const summaryParams: (string | number)[] = [organizationId];

      if (projectId) {
        summaryParams.push(projectId);
        const idx = summaryParams.length;
        totalSalesQuery += ` AND project_id = $${idx}`;
        totalExpensesQuery += ` AND project_id = $${idx}`;
        totalBudgetQuery += ` AND project_id = $${idx}`;
      }

      if (cycleId) {
        summaryParams.push(cycleId);
        const idx = summaryParams.length;
        totalSalesQuery += ` AND cycle_id = $${idx}`;
        totalExpensesQuery += ` AND cycle_id = $${idx}`;
        totalBudgetQuery += ` AND id = $${idx}`;
      }

      const [salesResult, expensesResult, budgetResult] = await Promise.all([
        db.query(totalSalesQuery, summaryParams),
        db.query(totalExpensesQuery, summaryParams),
        db.query(totalBudgetQuery, summaryParams),
      ]);

      totalRevenue = parseFloat(salesResult.rows[0]?.total_revenue ?? 0) || 0;
      totalExpenses = parseFloat(expensesResult.rows[0]?.total_expenses ?? 0) || 0;
      totalBudgetAllotment = parseFloat(budgetResult.rows[0]?.total_budget ?? 0) || 0;
    } else {
      // Org-level view with a configured base currency: aggregate by source currency and convert to org currency.
      const salesParams: (string | number)[] = [organizationId];
      let salesBucketsQuery = `
        SELECT
          COALESCE(p.currency_code, org.currency_code) AS currency_code,
          COALESCE(SUM(s.amount), 0) AS total
        FROM sales s
        JOIN organizations org ON s.organization_id = org.id
        LEFT JOIN projects p ON s.project_id = p.id
        WHERE s.organization_id = $1
      `;
      if (cycleId) {
        salesParams.push(cycleId);
        salesBucketsQuery += ` AND s.cycle_id = $${salesParams.length}`;
      }
      salesBucketsQuery += ' GROUP BY COALESCE(p.currency_code, org.currency_code)';

      const expensesParams: (string | number)[] = [organizationId];
      let expensesBucketsQuery = `
        SELECT
          COALESCE(p.currency_code, org.currency_code) AS currency_code,
          COALESCE(SUM(e.amount), 0) AS total
        FROM expenses e
        JOIN organizations org ON e.organization_id = org.id
        LEFT JOIN projects p ON e.project_id = p.id
        WHERE e.organization_id = $1
      `;
      if (cycleId) {
        expensesParams.push(cycleId);
        expensesBucketsQuery += ` AND e.cycle_id = $${expensesParams.length}`;
      }
      expensesBucketsQuery += ' GROUP BY COALESCE(p.currency_code, org.currency_code)';

      const budgetParams: (string | number)[] = [organizationId];
      let budgetBucketsQuery = `
        SELECT
          COALESCE(p.currency_code, org.currency_code) AS currency_code,
          COALESCE(SUM(c.budget_allotment), 0) AS total
        FROM cycles c
        JOIN organizations org ON c.organization_id = org.id
        LEFT JOIN projects p ON c.project_id = p.id
        WHERE c.organization_id = $1
      `;
      if (cycleId) {
        budgetParams.push(cycleId);
        budgetBucketsQuery += ` AND c.id = $${budgetParams.length}`;
      }
      budgetBucketsQuery += ' GROUP BY COALESCE(p.currency_code, org.currency_code)';

      const [salesBucketsResult, expensesBucketsResult, budgetBucketsResult] = await Promise.all([
        db.query(salesBucketsQuery, salesParams),
        db.query(expensesBucketsQuery, expensesParams),
        db.query(budgetBucketsQuery, budgetParams),
      ]);

      const targetCurrency = orgCurrencyCode!;

      for (const row of salesBucketsResult.rows) {
        const bucketAmount = parseFloat(row.total ?? 0) || 0;
        if (!bucketAmount) continue;
        const fromCurrency = (row.currency_code || targetCurrency) as string;
        totalRevenue += await convertAmount(bucketAmount, fromCurrency, targetCurrency);
      }

      for (const row of expensesBucketsResult.rows) {
        const bucketAmount = parseFloat(row.total ?? 0) || 0;
        if (!bucketAmount) continue;
        const fromCurrency = (row.currency_code || targetCurrency) as string;
        totalExpenses += await convertAmount(bucketAmount, fromCurrency, targetCurrency);
      }

      for (const row of budgetBucketsResult.rows) {
        const bucketAmount = parseFloat(row.total ?? 0) || 0;
        if (!bucketAmount) continue;
        const fromCurrency = (row.currency_code || targetCurrency) as string;
        totalBudgetAllotment += await convertAmount(bucketAmount, fromCurrency, targetCurrency);
      }
    }

    // Monthly trends: project-level views (or orgs without a base currency)
    // use the original simple aggregation in stored units.
    // Org-level views with a configured org currency aggregate per currency
    // and convert each month's amounts into the org currency.

    let monthlyTrendsRows: { month: string; totalRevenue: number; totalExpenses: number }[] = [];

    if (!isOrgLevelView || !orgCurrencyCode) {
      const monthlyTrendsQuery = `
        WITH months AS (
          SELECT DATE_TRUNC('month', GENERATE_SERIES(NOW() - INTERVAL '11 months', NOW(), '1 month')) AS month
        ),
        monthly_sales AS (
          SELECT
            DATE_TRUNC('month', sale_date) AS month,
            SUM(amount) as totalRevenue
          FROM sales
          WHERE organization_id = $1
            AND sale_date >= (NOW() - INTERVAL '11 months')
            AND ($2::int IS NULL OR project_id = $2::int)
            AND ($3::int IS NULL OR cycle_id = $3::int)
          GROUP BY 1
        ),
        monthly_expenses AS (
          SELECT
            DATE_TRUNC('month', date_time_created) AS month,
            SUM(amount) as totalExpenses
          FROM expenses
          WHERE organization_id = $1
            AND date_time_created >= (NOW() - INTERVAL '11 months')
            AND ($2::int IS NULL OR project_id = $2::int)
            AND ($3::int IS NULL OR cycle_id = $3::int)
          GROUP BY 1
        )
        SELECT
          TO_CHAR(m.month, 'YYYY-MM') AS month,
          COALESCE(ms.totalRevenue, 0) AS "totalRevenue",
          COALESCE(me.totalExpenses, 0) AS "totalExpenses"
        FROM months m
        LEFT JOIN monthly_sales ms ON m.month = ms.month
        LEFT JOIN monthly_expenses me ON m.month = me.month
        ORDER BY m.month;
      `;

      const trendsParams: (string | number | null)[] = [organizationId, null, null]; // org, project, cycle
      if (projectId) {
        trendsParams[1] = projectId;
      }
      if (cycleId) {
        trendsParams[2] = cycleId;
      }

      const monthlyTrendsResult = await db.query(monthlyTrendsQuery, trendsParams);
      monthlyTrendsRows = monthlyTrendsResult.rows.map(row => ({
        month: row.month,
        totalRevenue: parseFloat(row.totalRevenue),
        totalExpenses: parseFloat(row.totalExpenses),
      }));
    } else {
      const targetCurrency = orgCurrencyCode!;

      // Build the last 12 month keys in YYYY-MM format
      const months: string[] = [];
      const start = new Date();
      start.setDate(1);
      start.setMonth(start.getMonth() - 11);
      for (let i = 0; i < 12; i++) {
        const d = new Date(start);
        d.setMonth(start.getMonth() + i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        months.push(key);
      }

      const monthTotals = new Map<string, { totalRevenue: number; totalExpenses: number }>();
      for (const m of months) {
        monthTotals.set(m, { totalRevenue: 0, totalExpenses: 0 });
      }

      // Sales buckets per month and currency
      const salesMonthlyParams: (string | number)[] = [organizationId];
      let salesMonthlyQuery = `
        SELECT
          TO_CHAR(DATE_TRUNC('month', s.sale_date), 'YYYY-MM') AS month,
          COALESCE(p.currency_code, org.currency_code) AS currency_code,
          COALESCE(SUM(s.amount), 0) AS total
        FROM sales s
        JOIN organizations org ON s.organization_id = org.id
        LEFT JOIN projects p ON s.project_id = p.id
        WHERE s.organization_id = $1
          AND s.sale_date >= (NOW() - INTERVAL '11 months')
      `;
      if (cycleId) {
        salesMonthlyParams.push(cycleId);
        salesMonthlyQuery += ` AND s.cycle_id = $${salesMonthlyParams.length}`;
      }
      salesMonthlyQuery += ' GROUP BY 1, 2 ORDER BY 1';

      // Expenses buckets per month and currency
      const expensesMonthlyParams: (string | number)[] = [organizationId];
      let expensesMonthlyQuery = `
        SELECT
          TO_CHAR(DATE_TRUNC('month', e.date_time_created), 'YYYY-MM') AS month,
          COALESCE(p.currency_code, org.currency_code) AS currency_code,
          COALESCE(SUM(e.amount), 0) AS total
        FROM expenses e
        JOIN organizations org ON e.organization_id = org.id
        LEFT JOIN projects p ON e.project_id = p.id
        WHERE e.organization_id = $1
          AND e.date_time_created >= (NOW() - INTERVAL '11 months')
      `;
      if (cycleId) {
        expensesMonthlyParams.push(cycleId);
        expensesMonthlyQuery += ` AND e.cycle_id = $${expensesMonthlyParams.length}`;
      }
      expensesMonthlyQuery += ' GROUP BY 1, 2 ORDER BY 1';

      const [salesMonthlyResult, expensesMonthlyResult] = await Promise.all([
        db.query(salesMonthlyQuery, salesMonthlyParams),
        db.query(expensesMonthlyQuery, expensesMonthlyParams),
      ]);

      for (const row of salesMonthlyResult.rows) {
        const monthKey = row.month as string;
        if (!monthTotals.has(monthKey)) continue;
        const bucketAmount = parseFloat(row.total ?? 0) || 0;
        if (!bucketAmount) continue;
        const fromCurrency = (row.currency_code || targetCurrency) as string;
        const converted = await convertAmount(bucketAmount, fromCurrency, targetCurrency);
        const current = monthTotals.get(monthKey)!;
        current.totalRevenue += converted;
      }

      for (const row of expensesMonthlyResult.rows) {
        const monthKey = row.month as string;
        if (!monthTotals.has(monthKey)) continue;
        const bucketAmount = parseFloat(row.total ?? 0) || 0;
        if (!bucketAmount) continue;
        const fromCurrency = (row.currency_code || targetCurrency) as string;
        const converted = await convertAmount(bucketAmount, fromCurrency, targetCurrency);
        const current = monthTotals.get(monthKey)!;
        current.totalExpenses += converted;
      }

      monthlyTrendsRows = months.map((m) => {
        const entry = monthTotals.get(m)!;
        return {
          month: m,
          totalRevenue: entry.totalRevenue,
          totalExpenses: entry.totalExpenses,
        };
      });
    }

    const netProfit = totalRevenue - totalExpenses;

    return NextResponse.json({
      status: 'success',
      totalRevenue,
      totalExpenses,
      netProfit,
      totalBudgetAllotment,
      monthlyTrends: monthlyTrendsRows,
    });

  } catch (error) {
    console.error('Failed to fetch report summary:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ status: 'error', message }, { status: 500 });
  }
}
