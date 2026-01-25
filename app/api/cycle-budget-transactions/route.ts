import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/database'
import { getApiOrSessionUser } from '@/lib/api-auth-keys'
import { computeAmountInOrgCurrency } from '@/lib/org-currency'

export async function GET(request: NextRequest) {
  try {
    const user = await getApiOrSessionUser(request)
    if (!user?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'API key required' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const cycleId = searchParams.get('cycle_id')

    if (!cycleId) {
      return NextResponse.json({ status: 'error', message: 'cycle_id is required' }, { status: 400 })
    }

    const result = await db.query(
      'SELECT * FROM cycle_budget_transactions WHERE organization_id = $1 AND cycle_id = $2 ORDER BY created_at DESC LIMIT 200',
      [user.organizationId, cycleId],
    )

    return NextResponse.json({ status: 'success', transactions: result.rows })
  } catch (error) {
    console.error('Cycle budget transactions GET error:', error)
    return NextResponse.json({ status: 'error', message: 'Failed to fetch budget history' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getApiOrSessionUser(request)
    if (!user?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'API key required' }, { status: 401 })
    }

    const body = await request.json()
    const { cycle_id, action, amount, notes } = body

    if (!cycle_id) {
      return NextResponse.json({ status: 'error', message: 'cycle_id is required' }, { status: 400 })
    }

    if (action !== 'ADD' && action !== 'SET') {
      return NextResponse.json({ status: 'error', message: 'action must be ADD or SET' }, { status: 400 })
    }

    const numericAmount = typeof amount === 'number' ? amount : parseFloat(amount || '0') || 0
    if (numericAmount <= 0) {
      return NextResponse.json({ status: 'error', message: 'amount must be greater than 0' }, { status: 400 })
    }

    const existingRes = await db.query(
      'SELECT id, project_id, budget_allotment FROM cycles WHERE id = $1 AND organization_id = $2',
      [cycle_id, user.organizationId],
    )
    const existing = existingRes.rows[0]
    if (!existing) {
      return NextResponse.json({ status: 'error', message: 'Cycle not found' }, { status: 404 })
    }

    const budgetBefore = parseFloat(existing.budget_allotment ?? 0) || 0
    const budgetAfter = action === 'ADD' ? budgetBefore + numericAmount : numericAmount
    const delta = budgetAfter - budgetBefore

    const deltaOrgCcy = await computeAmountInOrgCurrency(user.organizationId, existing.project_id || null, delta)
    const budgetAfterOrgCcy = await computeAmountInOrgCurrency(user.organizationId, existing.project_id || null, budgetAfter)

    const txType = action === 'ADD' ? 'ALLOTMENT_ADD' : 'ALLOTMENT_SET'

    const result = await db.query(
      `
      WITH upd AS (
        UPDATE cycles
           SET budget_allotment = $1::numeric,
               budget_allotment_org_ccy = $2::numeric
         WHERE id = $3::int AND organization_id = $4::int
         RETURNING id
      ),
      ins AS (
        INSERT INTO cycle_budget_transactions (
          organization_id,
          project_id,
          cycle_id,
          type,
          amount_delta,
          amount_delta_org_ccy,
          budget_before,
          budget_after,
          notes,
          created_by
        )
        VALUES (
          $4::int,
          $5::int,
          $3::int,
          $6::text,
          $7::numeric,
          $8::numeric,
          $9::numeric,
          $10::numeric,
          $11::text,
          $12::int
        )
        RETURNING *
      )
      SELECT
        (SELECT row_to_json(ins) FROM ins) AS transaction,
        $1::numeric AS budget_allotment
      `,
      [
        budgetAfter,
        budgetAfterOrgCcy,
        cycle_id,
        user.organizationId,
        existing.project_id || null,
        txType,
        delta,
        deltaOrgCcy,
        budgetBefore,
        budgetAfter,
        notes || null,
        user.id,
      ],
    )

    return NextResponse.json({ status: 'success', ...result.rows[0] })
  } catch (error) {
    console.error('Cycle budget transactions POST error:', error)
    const message = error instanceof Error ? error.message : 'Failed to update budget'
    return NextResponse.json({ status: 'error', message }, { status: 500 })
  }
}
