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
    const productId = searchParams.get('product_id')
    const variantId = searchParams.get('variant_id')
    const projectId = searchParams.get('project_id')
    const cycleId = searchParams.get('cycle_id')

    let query = 'SELECT * FROM inventory_transactions WHERE organization_id = $1'
    const params: any[] = [user.organizationId]
    let i = 1

    if (productId) {
      i += 1
      query += ` AND product_id = $${i}`
      params.push(productId)
    }

    if (variantId) {
      i += 1
      query += ` AND variant_id = $${i}`
      params.push(variantId)
    }

    if (projectId) {
      i += 1
      query += ` AND project_id = $${i}`
      params.push(projectId)
    }

    if (cycleId) {
      i += 1
      query += ` AND cycle_id = $${i}`
      params.push(cycleId)
    }

    query += ' ORDER BY created_at DESC LIMIT 200'

    const result = await db.query(query, params)
    return NextResponse.json({ status: 'success', transactions: result.rows })
  } catch (error) {
    console.error('Inventory transactions GET error:', error)
    return NextResponse.json({ status: 'error', message: 'Failed to fetch inventory transactions' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getApiOrSessionUser(request)
    if (!user?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'API key required' }, { status: 401 })
    }

    const { organizationId, id: userId } = user

    const body = await request.json()
    const {
      type,
      project_id,
      cycle_id,
      product_id,
      variant_id,
      quantity,
      unit_cost,
      notes,
      create_expense,
      expense_category_id,
      expense_name,
      expense_date,
      vendor_id,
      payment_method_id,
      update_variant_unit_cost,
      update_variant_selling_price,
    } = body

    const safeQty = typeof quantity === 'number' ? quantity : parseInt(quantity || '0', 10) || 0
    if (!product_id || safeQty <= 0) {
      return NextResponse.json({ status: 'error', message: 'product_id and quantity (>0) are required' }, { status: 400 })
    }

    if (!type || typeof type !== 'string') {
      return NextResponse.json({ status: 'error', message: 'type is required' }, { status: 400 })
    }

    const safeUnitCost = typeof unit_cost === 'number' ? unit_cost : parseFloat(unit_cost || '0') || 0
    const safeUpdateVariantUnitCost =
      typeof update_variant_unit_cost === 'number'
        ? update_variant_unit_cost
        : update_variant_unit_cost === null || update_variant_unit_cost === undefined
          ? null
          : (parseFloat(update_variant_unit_cost || '0') || 0)
    const safeUpdateVariantSellingPrice =
      typeof update_variant_selling_price === 'number'
        ? update_variant_selling_price
        : update_variant_selling_price === null || update_variant_selling_price === undefined
          ? null
          : (parseFloat(update_variant_selling_price || '0') || 0)

    if (create_expense && !expense_category_id) {
      return NextResponse.json(
        { status: 'error', message: 'expense_category_id is required when create_expense is true' },
        { status: 400 },
      )
    }

    const amount = create_expense && safeUnitCost > 0 ? safeUnitCost * safeQty : 0
    const amountOrgCcy = create_expense
      ? await computeAmountInOrgCurrency(organizationId, project_id || null, amount)
      : 0

    const quantityDelta = type === 'PURCHASE' || type === 'ADJUSTMENT_IN' ? safeQty : -safeQty

    const result = await db.query(
      `
      WITH exp AS (
        INSERT INTO expenses (
          project_id,
          category_id,
          vendor_id,
          payment_method_id,
          cycle_id,
          expense_name,
          description,
          amount,
          amount_org_ccy,
          date_time_created,
          organization_id,
          created_by,
          product_id,
          variant_id,
          inventory_quantity,
          inventory_unit_cost
        )
        SELECT
          $1::int,
          $2::int,
          $3::int,
          $4::int,
          $5::int,
          $6::text,
          $7::text,
          $8::numeric,
          $9::numeric,
          $10::timestamptz,
          $11::int,
          $12::int,
          $13::int,
          $14::int,
          $15::int,
          $16::numeric
        WHERE $17::boolean = true
        RETURNING id
      ),
      inv AS (
        INSERT INTO inventory_transactions (
          organization_id,
          project_id,
          cycle_id,
          product_id,
          variant_id,
          expense_id,
          type,
          quantity_delta,
          unit_cost,
          notes,
          created_by
        )
        VALUES (
          $11::int,
          $1::int,
          $5::int,
          $13::int,
          $14::int,
          (SELECT id FROM exp),
          $18::text,
          $19::int,
          $16::numeric,
          $7::text,
          $12::int
        )
        RETURNING *
      ),
      upd_prod AS (
        UPDATE products
           SET quantity_in_stock = quantity_in_stock + $19::int
         WHERE id = $13::int AND organization_id = $11::int
         RETURNING id
      ),
      upd_var AS (
        UPDATE product_variants
           SET quantity_in_stock = quantity_in_stock + $19::int
         WHERE id = $14::int
         RETURNING id
      ),
      upd_prices AS (
        UPDATE product_variants
           SET unit_cost = COALESCE($20::numeric, unit_cost),
               selling_price = COALESCE($21::numeric, selling_price)
         WHERE id = $14::int
           AND ($20::numeric IS NOT NULL OR $21::numeric IS NOT NULL)
         RETURNING id
      )
      SELECT
        (SELECT row_to_json(inv) FROM inv) AS inventory_transaction,
        (SELECT id FROM exp) AS expense_id
      `,
      [
        project_id || null,
        expense_category_id || null,
        vendor_id || null,
        payment_method_id || null,
        cycle_id || null,
        expense_name || 'Stock Purchase',
        notes || expense_name || (create_expense ? 'Stock purchase' : null),
        amount,
        amountOrgCcy,
        expense_date || new Date().toISOString(),
        organizationId,
        userId,
        product_id,
        variant_id || null,
        safeQty,
        safeUnitCost || null,
        Boolean(create_expense),
        type,
        quantityDelta,
        safeUpdateVariantUnitCost,
        safeUpdateVariantSellingPrice,
      ],
    )

    const row = result.rows[0] || {}
    return NextResponse.json({ status: 'success', ...row })
  } catch (error) {
    console.error('Inventory transactions POST error:', error)
    const message = error instanceof Error ? error.message : 'Failed to create inventory transaction'
    return NextResponse.json({ status: 'error', message }, { status: 500 })
  }
}
