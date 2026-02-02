import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/database'
import { getApiOrSessionUser } from '@/lib/api-auth-keys'
import { computeAmountInOrgCurrency } from '@/lib/org-currency'
import { assertCycleNotInventoryLocked, isCycleInventoryLockedError } from '@/lib/cycle-inventory-lock'
import { postInventoryV2Movement, postInventoryV2MovementByVariantId } from '@/lib/inventory-v2'

type QueryFn = (text: string, params?: any[]) => Promise<{ rows: any[] }>

let salesHasInventoryVariantIdCache: boolean | null = null

async function salesHasInventoryItemVariantId(queryFn: QueryFn): Promise<boolean> {
  if (salesHasInventoryVariantIdCache !== null) return salesHasInventoryVariantIdCache

  const res = await queryFn(
    "SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'inventory_item_variant_id' LIMIT 1",
  )

  salesHasInventoryVariantIdCache = res.rows.length > 0
  return salesHasInventoryVariantIdCache
}

function parseOptionalInt(value: any): number | null {
  if (value === undefined || value === null || value === '') return null
  const n = typeof value === 'number' ? value : parseInt(String(value || '0'), 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * @swagger
 * /api/sales:
 *   get:
 *     operationId: listSales
 *     tags:
 *       - Sales
 *     summary: List sales
 *     description: List sales for the authenticated user's organization with optional filters.
 *     security:
 *       - stackSession: []
 *     parameters:
 *       - in: query
 *         name: project_id
 *         required: false
 *         schema:
 *           type: string
 *       - in: query
 *         name: cycle_id
 *         required: false
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: string
 *           default: '100'
 *     responses:
 *       200:
 *         description: Sales fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 sales:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Sale'
 *       401:
 *         description: API key required.
 *   post:
 *     operationId: createSale
 *     tags:
 *       - Sales
 *     summary: Create a new sale
 *     security:
 *       - stackSession: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               project_id:
 *                 type: integer
 *                 nullable: true
 *               cycle_id:
 *                 type: integer
 *                 nullable: true
 *               product_id:
 *                 type: integer
 *                 nullable: true
 *               variant_id:
 *                 type: integer
 *                 nullable: true
 *               inventory_item_variant_id:
 *                 type: integer
 *                 nullable: true
 *               customer:
 *                 type: string
 *                 nullable: true
 *               quantity:
 *                 type: number
 *               unit_cost:
 *                 type: number
 *                 nullable: true
 *               price:
 *                 type: number
 *               status:
 *                 type: string
 *                 nullable: true
 *               sale_date:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *               cash_at_hand:
 *                 type: number
 *                 nullable: true
 *               balance:
 *                 type: number
 *                 nullable: true
 *             required:
 *               - quantity
 *               - price
 *     responses:
 *       200:
 *         description: Sale created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 sale:
 *                   $ref: '#/components/schemas/Sale'
 *       401:
 *         description: API key required.
 *   put:
 *     operationId: updateSale
 *     tags:
 *       - Sales
 *     summary: Update an existing sale
 *     security:
 *       - stackSession: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: integer
 *               project_id:
 *                 type: integer
 *                 nullable: true
 *               cycle_id:
 *                 type: integer
 *                 nullable: true
 *               product_id:
 *                 type: integer
 *                 nullable: true
 *               variant_id:
 *                 type: integer
 *                 nullable: true
 *               inventory_item_variant_id:
 *                 type: integer
 *                 nullable: true
 *               customer:
 *                 type: string
 *                 nullable: true
 *               quantity:
 *                 type: number
 *               unit_cost:
 *                 type: number
 *                 nullable: true
 *               price:
 *                 type: number
 *               status:
 *                 type: string
 *                 nullable: true
 *               sale_date:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *               cash_at_hand:
 *                 type: number
 *                 nullable: true
 *               balance:
 *                 type: number
 *                 nullable: true
 *             required:
 *               - id
 *               - quantity
 *               - price
 *     responses:
 *       200:
 *         description: Sale updated successfully.
 *       401:
 *         description: API key required.
 *   delete:
 *     operationId: deleteSale
 *     tags:
 *       - Sales
 *     summary: Delete a sale
 *     security:
 *       - stackSession: []
 *     parameters:
 *       - in: query
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Sale deleted successfully.
 *       401:
 *         description: API key required.
 */

export async function GET(request: Request) {
  try {
    const user = await getApiOrSessionUser(request as NextRequest)
    if (!user?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'API key required' }, { status: 401 })
    }
    const { organizationId } = user

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const projectId = searchParams.get('project_id')
    const cycleId = searchParams.get('cycle_id')
    const productId = searchParams.get('product_id')
    const variantId = searchParams.get('variant_id')
    const inventoryItemVariantId = searchParams.get('inventory_item_variant_id')
    const status = searchParams.get('status')
    const limit = searchParams.get('limit') || '100'

    const hasInvVariantFilter = inventoryItemVariantId ? await salesHasInventoryItemVariantId(db.query) : false

    let query = 'SELECT * FROM sales WHERE organization_id = $1'
    const params: any[] = [organizationId]
    let paramCount = 1

    if (user.role !== 'admin') {
      if (projectId) {
        const access = await db.query(
          `
          SELECT 1
            FROM project_assignments pa
           WHERE pa.project_id = $1 AND pa.user_id = $2
          UNION
          SELECT 1
            FROM project_assignments pa
            JOIN team_members tm ON tm.team_id = pa.team_id
           WHERE pa.project_id = $1 AND tm.user_id = $2
           LIMIT 1
          `,
          [projectId, user.id],
        )

        if (!access.rows.length) {
          return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 })
        }
      }

      paramCount++
      query += ` AND project_id IN (
        SELECT pa.project_id FROM project_assignments pa WHERE pa.user_id = $${paramCount}
        UNION
        SELECT pa.project_id FROM project_assignments pa JOIN team_members tm ON tm.team_id = pa.team_id WHERE tm.user_id = $${paramCount}
      )`
      params.push(user.id)
    }

    if (id) {
      paramCount++
      query += ` AND id = $${paramCount}`
      params.push(id)
    }

    if (projectId) {
      paramCount++
      query += ` AND project_id = $${paramCount}`
      params.push(projectId)
    }

    if (cycleId) {
      paramCount++
      query += ` AND cycle_id = $${paramCount}`
      params.push(cycleId)
    }

    if (productId) {
      paramCount++
      query += ` AND product_id = $${paramCount}`
      params.push(productId)
    }

    if (variantId) {
      paramCount++
      query += ` AND variant_id = $${paramCount}`
      params.push(variantId)
    }

    if (inventoryItemVariantId && hasInvVariantFilter) {
      paramCount++
      query += ` AND inventory_item_variant_id = $${paramCount}`
      params.push(inventoryItemVariantId)
    }

    if (status) {
      paramCount++
      query += ` AND status = $${paramCount}`
      params.push(status)
    }

    if (id) {
      query += ' LIMIT 1'
    } else {
      query += ` ORDER BY id DESC LIMIT $${paramCount + 1}`
      params.push(parseInt(limit, 10))
    }

    const result = await db.query(query, params)

    if (id) {
      return NextResponse.json({
        status: 'success',
        sale: result.rows[0] || null,
      })
    }

    return NextResponse.json({
      status: 'success',
      sales: result.rows,
    })
  } catch (error) {
    console.error('Sales GET error:', error)
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to fetch sales',
      },
      { status: 500 },
    )
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
    const { project_id, cycle_id, product_id, variant_id, inventory_item_variant_id, customer, quantity, unit_cost, price, status, sale_date, cash_at_hand, balance } = body

    const result = await db.transaction(async (tx) => {
      if (user.role !== 'admin') {
        if (!project_id) {
          return { forbidden: true } as const
        }

        const access = await tx.query(
          `
          SELECT 1
            FROM project_assignments pa
           WHERE pa.project_id = $1 AND pa.user_id = $2
          UNION
          SELECT 1
            FROM project_assignments pa
            JOIN team_members tm ON tm.team_id = pa.team_id
           WHERE pa.project_id = $1 AND tm.user_id = $2
           LIMIT 1
          `,
          [project_id, userId],
        )

        if (!access.rows.length) {
          return { forbidden: true } as const
        }
      }

      const safeCycleId = cycle_id === undefined || cycle_id === null
        ? null
        : (typeof cycle_id === 'number' ? cycle_id : parseInt(cycle_id || '0', 10) || null)
      await assertCycleNotInventoryLocked(tx.query, safeCycleId, organizationId)

      const safeQuantity = typeof quantity === 'number' ? quantity : parseInt(quantity || '0', 10) || 0
      const safeUnitCost = typeof unit_cost === 'number' ? unit_cost : parseFloat(unit_cost || '0') || 0
      const safePrice = typeof price === 'number' ? price : parseFloat(price || '0') || 0
      const safeCashAtHand = typeof cash_at_hand === 'number' ? cash_at_hand : parseFloat(cash_at_hand || '0') || 0
      const safeBalance = typeof balance === 'number' ? balance : parseFloat(balance || '0') || 0
      const amount = safeQuantity * safePrice
      const amountOrgCcy = await computeAmountInOrgCurrency(organizationId, project_id || null, amount)

      const hasInvVariant = await salesHasInventoryItemVariantId(tx.query)
      const inventoryItemVariantId = hasInvVariant ? parseOptionalInt(inventory_item_variant_id) : null

      let customerId: number | null = null
      if (customer && typeof customer === 'string' && customer.trim()) {
        const customerRes = await tx.query(
          `INSERT INTO customers (name, organization_id)
           VALUES ($1, $2)
           ON CONFLICT (organization_id, name) DO UPDATE SET name = EXCLUDED.name
           RETURNING id`,
          [customer.trim(), organizationId]
        )
        customerId = customerRes.rows[0]?.id ?? null
      }

      const saleResult = hasInvVariant
        ? await tx.query(
            'INSERT INTO sales (project_id, cycle_id, product_id, variant_id, inventory_item_variant_id, customer_name, customer_id, quantity, unit_cost, price, status, cash_at_hand, balance, amount, amount_org_ccy, sale_date, organization_id, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING *',
            [
              project_id || null,
              safeCycleId,
              product_id || null,
              variant_id || null,
              inventoryItemVariantId,
              customer || null,
              customerId,
              safeQuantity,
              safeUnitCost,
              safePrice,
              status || 'pending',
              safeCashAtHand,
              safeBalance,
              amount,
              amountOrgCcy,
              sale_date || null,
              organizationId,
              userId,
            ],
          )
        : await tx.query(
            'INSERT INTO sales (project_id, cycle_id, product_id, variant_id, customer_name, customer_id, quantity, unit_cost, price, status, cash_at_hand, balance, amount, amount_org_ccy, sale_date, organization_id, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING *',
            [
              project_id || null,
              safeCycleId,
              product_id || null,
              variant_id || null,
              customer || null,
              customerId,
              safeQuantity,
              safeUnitCost,
              safePrice,
              status || 'pending',
              safeCashAtHand,
              safeBalance,
              amount,
              amountOrgCcy,
              sale_date || null,
              organizationId,
              userId,
            ],
          )

      const createdSale = saleResult.rows[0]

      if (safeQuantity > 0) {
        if (inventoryItemVariantId) {
          await postInventoryV2MovementByVariantId(tx.query, {
            organizationId,
            projectId: project_id || null,
            cycleId: safeCycleId,
            inventoryItemVariantId,
            quantityDelta: -safeQuantity,
            unitCost: safeUnitCost || null,
            transactionType: 'SALE_ISSUE',
            sourceType: 'sale',
            sourceId: createdSale.id ?? null,
            notes: `Sale #${createdSale.id}${customer ? ` - ${customer}` : ''}`,
            createdBy: userId,
          })
        }

        if (product_id) {
          const productUpdate = await tx.query(
            'UPDATE products SET quantity_in_stock = quantity_in_stock - $1 WHERE id = $2 AND organization_id = $3 RETURNING id',
            [safeQuantity, product_id, organizationId]
          )

          if (productUpdate.rows.length === 0) {
            throw new Error('Failed to update product stock. Product not found or permission denied.')
          }

          if (variant_id) {
            const variantUpdate = await tx.query(
              'UPDATE product_variants SET quantity_in_stock = quantity_in_stock - $1 WHERE id = $2 RETURNING id',
              [safeQuantity, variant_id]
            )
            if (variantUpdate.rows.length === 0) {
              throw new Error('Failed to update product variant stock. Variant not found.')
            }
          }

          await tx.query(
            `INSERT INTO inventory_transactions (
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
            ) VALUES ($1,$2,$3,$4,$5,NULL,'SALE',$6,$7,$8,$9)`,
            [
              organizationId,
              project_id || null,
              safeCycleId,
              product_id,
              variant_id || null,
              -safeQuantity,
              safeUnitCost || null,
              `Sale #${createdSale.id}${customer ? ` - ${customer}` : ''}`,
              userId,
            ],
          )

          if (!inventoryItemVariantId) {
            await postInventoryV2Movement(tx.query, {
              organizationId,
              projectId: project_id || null,
              cycleId: safeCycleId,
              productId: product_id,
              productVariantId: variant_id || null,
              quantityDelta: -safeQuantity,
              unitCost: safeUnitCost || null,
              transactionType: 'SALE_ISSUE',
              sourceType: 'sale',
              sourceId: createdSale.id ?? null,
              notes: `Sale #${createdSale.id}${customer ? ` - ${customer}` : ''}`,
              createdBy: userId,
            })
          }
        }
      }

      return { sale: createdSale } as const
    })

    if ((result as any).forbidden) {
      return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json({ status: 'success', sale: (result as any).sale })
  } catch (error) {
    if (isCycleInventoryLockedError(error)) {
      return NextResponse.json({ status: 'error', message: error.message }, { status: 409 })
    }
    console.error('Sale creation error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to create sale'
    return NextResponse.json({ status: 'error', message: errorMessage }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getApiOrSessionUser(request)
    if (!user?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'API key required' }, { status: 401 })
    }
    const { organizationId } = user

    const body = await request.json()
    const { id, project_id, cycle_id, product_id, variant_id, inventory_item_variant_id, customer, quantity, unit_cost, price, status, sale_date, cash_at_hand, balance } = body

    const result = await db.transaction(async (tx) => {
      const hasInvVariant = await salesHasInventoryItemVariantId(tx.query)

      const originalSaleResult = await tx.query(
        hasInvVariant
          ? 'SELECT quantity, product_id, variant_id, inventory_item_variant_id, customer_id, project_id, cycle_id, customer_name, unit_cost, price, status, cash_at_hand, balance, sale_date FROM sales WHERE id = $1 AND organization_id = $2'
          : 'SELECT quantity, product_id, variant_id, customer_id, project_id, cycle_id, customer_name, unit_cost, price, status, cash_at_hand, balance, sale_date FROM sales WHERE id = $1 AND organization_id = $2',
        [id, organizationId]
      )

      if (originalSaleResult.rows.length === 0) {
        throw new Error('Sale not found')
      }
      const originalSale = originalSaleResult.rows[0]

      const originalQuantity = originalSale.quantity
      const originalProductId = originalSale.product_id as number | null
      const originalVariantId = originalSale.variant_id as number | null
      const originalInventoryItemVariantId = hasInvVariant
        ? parseOptionalInt((originalSale as any).inventory_item_variant_id)
        : null

      const originalCustomerId = originalSale.customer_id as number | null
      const originalCustomerName = originalSale.customer_name as string | null
      const originalProjectId = originalSale.project_id as number | null
      const originalCycleId = originalSale.cycle_id as number | null

      const originalUnitCost = originalSale.unit_cost == null
        ? 0
        : (typeof originalSale.unit_cost === 'number'
          ? originalSale.unit_cost
          : parseFloat(originalSale.unit_cost || '0') || 0)
      const originalPrice = originalSale.price == null
        ? 0
        : (typeof originalSale.price === 'number'
          ? originalSale.price
          : parseFloat(originalSale.price || '0') || 0)
      const originalStatus = (originalSale.status as string | null) ?? 'pending'
      const originalCashAtHand = originalSale.cash_at_hand == null
        ? 0
        : (typeof originalSale.cash_at_hand === 'number'
          ? originalSale.cash_at_hand
          : parseFloat(originalSale.cash_at_hand || '0') || 0)
      const originalBalance = originalSale.balance == null
        ? 0
        : (typeof originalSale.balance === 'number'
          ? originalSale.balance
          : parseFloat(originalSale.balance || '0') || 0)
      const originalSaleDate = (originalSale.sale_date as string | null) ?? null

      const effectiveProjectId = project_id === undefined ? originalProjectId : (project_id || null)
      const effectiveProductId = product_id === undefined ? originalProductId : (product_id || null)
      const effectiveVariantId = variant_id === undefined ? originalVariantId : (variant_id || null)

      const targetCycleId = cycle_id === undefined || cycle_id === null
        ? originalCycleId
        : (typeof cycle_id === 'number' ? cycle_id : parseInt(cycle_id || '0', 10) || null)

      await assertCycleNotInventoryLocked(
        tx.query,
        originalCycleId,
        organizationId,
      )
      await assertCycleNotInventoryLocked(
        tx.query,
        targetCycleId,
        organizationId,
      )

      if (user.role !== 'admin') {
        const currentProjectId = originalSale.project_id as number | null
        const targetProjectId = (project_id ?? currentProjectId) as number | null
        if (!targetProjectId) {
          return { forbidden: true } as const
        }

        const access = await tx.query(
          `
          SELECT 1
            FROM project_assignments pa
           WHERE pa.project_id = $1 AND pa.user_id = $2
          UNION
          SELECT 1
            FROM project_assignments pa
            JOIN team_members tm ON tm.team_id = pa.team_id
           WHERE pa.project_id = $1 AND tm.user_id = $2
           LIMIT 1
          `,
          [targetProjectId, user.id],
        )

        if (!access.rows.length) {
          return { forbidden: true } as const
        }
      }

      const safeQuantity = typeof quantity === 'number' ? quantity : parseInt(quantity || '0', 10) || 0
      const quantityDifference = safeQuantity - originalQuantity

      const requestedInventoryItemVariantId = hasInvVariant ? parseOptionalInt(inventory_item_variant_id) : null
      const isLegacyProductChanging = originalProductId !== effectiveProductId || originalVariantId !== effectiveVariantId
      const targetInventoryItemVariantId = hasInvVariant
        ? (inventory_item_variant_id === undefined
            ? (isLegacyProductChanging ? null : originalInventoryItemVariantId)
            : requestedInventoryItemVariantId)
        : null

      const requestedUnitCost = unit_cost === undefined
        ? undefined
        : (typeof unit_cost === 'number' ? unit_cost : parseFloat(unit_cost || '0') || 0)
      const requestedPrice = price === undefined
        ? undefined
        : (typeof price === 'number' ? price : parseFloat(price || '0') || 0)
      const requestedCashAtHand = cash_at_hand === undefined
        ? undefined
        : (typeof cash_at_hand === 'number' ? cash_at_hand : parseFloat(cash_at_hand || '0') || 0)
      const requestedBalance = balance === undefined
        ? undefined
        : (typeof balance === 'number' ? balance : parseFloat(balance || '0') || 0)

      const effectiveUnitCost = requestedUnitCost === undefined ? originalUnitCost : requestedUnitCost
      const effectivePrice = requestedPrice === undefined ? originalPrice : requestedPrice
      const effectiveCashAtHand = requestedCashAtHand === undefined ? originalCashAtHand : requestedCashAtHand
      const effectiveBalance = requestedBalance === undefined ? originalBalance : requestedBalance
      const effectiveStatus = status === undefined ? originalStatus : (status || 'pending')
      const effectiveSaleDate = sale_date === undefined ? originalSaleDate : (sale_date || null)

      const amount = safeQuantity * effectivePrice
      const amountOrgCcy = await computeAmountInOrgCurrency(organizationId, effectiveProjectId || null, amount)

      let customerName: string | null = customer === undefined ? originalCustomerName : (customer || null)
      let customerId: number | null = customer === undefined ? originalCustomerId : null
      if (customerName && typeof customerName === 'string' && customerName.trim()) {
        const customerRes = await tx.query(
          `INSERT INTO customers (name, organization_id)
           VALUES ($1, $2)
           ON CONFLICT (organization_id, name) DO UPDATE SET name = EXCLUDED.name
           RETURNING id`,
          [customerName.trim(), organizationId]
        )
        customerId = customerRes.rows[0]?.id ?? null
        customerName = customerName.trim()
      }

      const saleResult = await tx.query(
        hasInvVariant
          ? 'UPDATE sales SET project_id = $1, cycle_id = $2, product_id = $3, variant_id = $4, inventory_item_variant_id = $5, customer_name = $6, customer_id = $7, quantity = $8, unit_cost = $9, price = $10, status = $11, cash_at_hand = $12, balance = $13, amount = $14, amount_org_ccy = $15, sale_date = $16 WHERE id = $17 AND organization_id = $18 RETURNING *'
          : 'UPDATE sales SET project_id = $1, cycle_id = $2, product_id = $3, variant_id = $4, customer_name = $5, customer_id = $6, quantity = $7, unit_cost = $8, price = $9, status = $10, cash_at_hand = $11, balance = $12, amount = $13, amount_org_ccy = $14, sale_date = $15 WHERE id = $16 AND organization_id = $17 RETURNING *',
        hasInvVariant
          ? [
              effectiveProjectId,
              targetCycleId,
              effectiveProductId,
              effectiveVariantId,
              targetInventoryItemVariantId,
              customerName,
              customerId,
              safeQuantity,
              effectiveUnitCost,
              effectivePrice,
              effectiveStatus,
              effectiveCashAtHand,
              effectiveBalance,
              amount,
              amountOrgCcy,
              effectiveSaleDate,
              id,
              organizationId,
            ]
          : [
              effectiveProjectId,
              targetCycleId,
              effectiveProductId,
              effectiveVariantId,
              customerName,
              customerId,
              safeQuantity,
              effectiveUnitCost,
              effectivePrice,
              effectiveStatus,
              effectiveCashAtHand,
              effectiveBalance,
              amount,
              amountOrgCcy,
              effectiveSaleDate,
              id,
              organizationId,
            ]
      )

      if (originalProductId === effectiveProductId && originalVariantId === effectiveVariantId) {
        const inventoryRefChanged = originalInventoryItemVariantId !== targetInventoryItemVariantId

        if (inventoryRefChanged) {
          if (originalQuantity > 0) {
            if (originalInventoryItemVariantId) {
              await postInventoryV2MovementByVariantId(tx.query, {
                organizationId,
                projectId: originalProjectId || null,
                cycleId: originalCycleId || null,
                inventoryItemVariantId: originalInventoryItemVariantId,
                quantityDelta: originalQuantity,
                unitCost: effectiveUnitCost || null,
                transactionType: 'REVERSAL',
                sourceType: 'sale',
                sourceId: Number(id) || null,
                notes: `Sale #${id} inventory item variant change reversal`,
                createdBy: user.id,
              })
            } else if (originalProductId) {
              await postInventoryV2Movement(tx.query, {
                organizationId,
                projectId: originalProjectId || null,
                cycleId: originalCycleId || null,
                productId: originalProductId,
                productVariantId: originalVariantId || null,
                quantityDelta: originalQuantity,
                unitCost: effectiveUnitCost || null,
                transactionType: 'REVERSAL',
                sourceType: 'sale',
                sourceId: Number(id) || null,
                notes: `Sale #${id} inventory item variant change reversal`,
                createdBy: user.id,
              })
            }
          }

          if (safeQuantity > 0) {
            if (targetInventoryItemVariantId) {
              await postInventoryV2MovementByVariantId(tx.query, {
                organizationId,
                projectId: effectiveProjectId || null,
                cycleId: targetCycleId,
                inventoryItemVariantId: targetInventoryItemVariantId,
                quantityDelta: -safeQuantity,
                unitCost: effectiveUnitCost || null,
                transactionType: 'SALE_ISSUE',
                sourceType: 'sale',
                sourceId: Number(id) || null,
                notes: `Sale #${id} inventory item variant change new sale`,
                createdBy: user.id,
              })
            } else if (effectiveProductId) {
              await postInventoryV2Movement(tx.query, {
                organizationId,
                projectId: effectiveProjectId || null,
                cycleId: targetCycleId,
                productId: effectiveProductId,
                productVariantId: effectiveVariantId || null,
                quantityDelta: -safeQuantity,
                unitCost: effectiveUnitCost || null,
                transactionType: 'SALE_ISSUE',
                sourceType: 'sale',
                sourceId: Number(id) || null,
                notes: `Sale #${id} inventory item variant change new sale`,
                createdBy: user.id,
              })
            }
          }
        }

        if (quantityDifference !== 0 && effectiveProductId) {
          const productUpdate = await tx.query(
            'UPDATE products SET quantity_in_stock = quantity_in_stock - $1 WHERE id = $2 AND organization_id = $3 RETURNING id',
            [quantityDifference, effectiveProductId, organizationId]
          )

          if (productUpdate.rows.length === 0) {
            throw new Error('Failed to update product stock. Product not found or permission denied.')
          }

          if (effectiveVariantId) {
            const variantUpdate = await tx.query(
              'UPDATE product_variants SET quantity_in_stock = quantity_in_stock - $1 WHERE id = $2 RETURNING id',
              [quantityDifference, effectiveVariantId]
            )
            if (variantUpdate.rows.length === 0) {
              throw new Error('Failed to update product variant stock. Variant not found.')
            }
          }

          await tx.query(
            `INSERT INTO inventory_transactions (
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
            ) VALUES ($1,$2,$3,$4,$5,NULL,'SALE',$6,$7,$8,$9)`,
            [
              organizationId,
              effectiveProjectId,
              targetCycleId,
              effectiveProductId,
              effectiveVariantId || null,
              -quantityDifference,
              effectiveUnitCost || null,
              `Sale #${id} quantity update`,
              user.id,
            ],
          )

          if (!inventoryRefChanged) {
            if (targetInventoryItemVariantId) {
              await postInventoryV2MovementByVariantId(tx.query, {
                organizationId,
                projectId: (effectiveProjectId || null) as any,
                cycleId: targetCycleId as any,
                inventoryItemVariantId: targetInventoryItemVariantId,
                quantityDelta: -quantityDifference,
                unitCost: effectiveUnitCost || null,
                transactionType: (-quantityDifference < 0 ? 'SALE_ISSUE' : 'REVERSAL'),
                sourceType: 'sale',
                sourceId: Number(id) || null,
                notes: `Sale #${id} quantity update`,
                createdBy: user.id,
              })
            } else {
              await postInventoryV2Movement(tx.query, {
                organizationId,
                projectId: (effectiveProjectId || null) as any,
                cycleId: targetCycleId as any,
                productId: effectiveProductId,
                productVariantId: effectiveVariantId || null,
                quantityDelta: -quantityDifference,
                unitCost: effectiveUnitCost || null,
                transactionType: (-quantityDifference < 0 ? 'SALE_ISSUE' : 'REVERSAL'),
                sourceType: 'sale',
                sourceId: Number(id) || null,
                notes: `Sale #${id} quantity update`,
                createdBy: user.id,
              })
            }
          }
        }
      } else {
        if (originalProductId && originalQuantity > 0) {
          const restoreProduct = await tx.query(
            'UPDATE products SET quantity_in_stock = quantity_in_stock + $1 WHERE id = $2 AND organization_id = $3 RETURNING id',
            [originalQuantity, originalProductId, organizationId]
          )
          if (restoreProduct.rows.length === 0) {
            throw new Error('Failed to restore product stock. Product not found or permission denied.')
          }

          if (originalVariantId) {
            const restoreVariant = await tx.query(
              'UPDATE product_variants SET quantity_in_stock = quantity_in_stock + $1 WHERE id = $2 RETURNING id',
              [originalQuantity, originalVariantId]
            )
            if (restoreVariant.rows.length === 0) {
              throw new Error('Failed to restore product variant stock. Variant not found or permission denied.')
            }
          }

          await tx.query(
            `INSERT INTO inventory_transactions (
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
            ) VALUES ($1,$2,$3,$4,$5,NULL,'SALE_REVERSAL',$6,$7,$8,$9)`,
            [
              organizationId,
              originalProjectId || null,
              originalCycleId || null,
              originalProductId,
              originalVariantId || null,
              originalQuantity,
              effectiveUnitCost || null,
              `Sale #${id} product/variant change reversal`,
              user.id,
            ],
          )

          if (originalInventoryItemVariantId) {
            await postInventoryV2MovementByVariantId(tx.query, {
              organizationId,
              projectId: originalProjectId || null,
              cycleId: originalCycleId || null,
              inventoryItemVariantId: originalInventoryItemVariantId,
              quantityDelta: originalQuantity,
              unitCost: effectiveUnitCost || null,
              transactionType: 'REVERSAL',
              sourceType: 'sale',
              sourceId: Number(id) || null,
              notes: `Sale #${id} product/variant change reversal`,
              createdBy: user.id,
            })
          } else {
            await postInventoryV2Movement(tx.query, {
              organizationId,
              projectId: originalProjectId || null,
              cycleId: originalCycleId || null,
              productId: originalProductId,
              productVariantId: originalVariantId || null,
              quantityDelta: originalQuantity,
              unitCost: effectiveUnitCost || null,
              transactionType: 'REVERSAL',
              sourceType: 'sale',
              sourceId: Number(id) || null,
              notes: `Sale #${id} product/variant change reversal`,
              createdBy: user.id,
            })
          }
        }

        if (effectiveProductId && safeQuantity > 0) {
          const deductProduct = await tx.query(
            'UPDATE products SET quantity_in_stock = quantity_in_stock - $1 WHERE id = $2 AND organization_id = $3 RETURNING id',
            [safeQuantity, effectiveProductId, organizationId]
          )
          if (deductProduct.rows.length === 0) {
            throw new Error('Failed to deduct product stock. Product not found or permission denied.')
          }

          if (effectiveVariantId) {
            const deductVariant = await tx.query(
              'UPDATE product_variants SET quantity_in_stock = quantity_in_stock - $1 WHERE id = $2 RETURNING id',
              [safeQuantity, effectiveVariantId]
            )
            if (deductVariant.rows.length === 0) {
              throw new Error('Failed to deduct product variant stock. Variant not found or permission denied.')
            }
          }

          await tx.query(
            `INSERT INTO inventory_transactions (
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
            ) VALUES ($1,$2,$3,$4,$5,NULL,'SALE',$6,$7,$8,$9)`,
            [
              organizationId,
              effectiveProjectId,
              targetCycleId,
              effectiveProductId,
              effectiveVariantId || null,
              -safeQuantity,
              effectiveUnitCost || null,
              `Sale #${id} product/variant change new sale`,
              user.id,
            ],
          )

          if (targetInventoryItemVariantId) {
            await postInventoryV2MovementByVariantId(tx.query, {
              organizationId,
              projectId: (effectiveProjectId || null) as any,
              cycleId: targetCycleId as any,
              inventoryItemVariantId: targetInventoryItemVariantId,
              quantityDelta: -safeQuantity,
              unitCost: effectiveUnitCost || null,
              transactionType: 'SALE_ISSUE',
              sourceType: 'sale',
              sourceId: Number(id) || null,
              notes: `Sale #${id} product/variant change new sale`,
              createdBy: user.id,
            })
          } else {
            await postInventoryV2Movement(tx.query, {
              organizationId,
              projectId: (effectiveProjectId || null) as any,
              cycleId: targetCycleId as any,
              productId: effectiveProductId,
              productVariantId: effectiveVariantId || null,
              quantityDelta: -safeQuantity,
              unitCost: effectiveUnitCost || null,
              transactionType: 'SALE_ISSUE',
              sourceType: 'sale',
              sourceId: Number(id) || null,
              notes: `Sale #${id} product/variant change new sale`,
              createdBy: user.id,
            })
          }
        }
      }

      return { sale: saleResult.rows[0] } as const
    })

    if ((result as any).forbidden) {
      return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json({ status: 'success', sale: (result as any).sale })
  } catch (error) {
    if (isCycleInventoryLockedError(error)) {
      return NextResponse.json({ status: 'error', message: error.message }, { status: 409 })
    }
    console.error('Sale update error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to update sale'
    return NextResponse.json({ status: 'error', message: errorMessage }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    const user = await getApiOrSessionUser(request)
    if (!user?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'API key required' }, { status: 401 })
    }
    const { organizationId } = user

    const result = await db.transaction(async (tx) => {
      const saleResult = await tx.query(
        (await salesHasInventoryItemVariantId(tx.query))
          ? 'SELECT product_id, variant_id, inventory_item_variant_id, quantity, project_id, cycle_id, unit_cost, customer_name FROM sales WHERE id = $1 AND organization_id = $2'
          : 'SELECT product_id, variant_id, quantity, project_id, cycle_id, unit_cost, customer_name FROM sales WHERE id = $1 AND organization_id = $2',
        [id, organizationId]
      )

      if (saleResult.rows.length === 0) {
        throw new Error('Sale not found')
      }
      const { product_id, variant_id, inventory_item_variant_id, quantity, project_id, cycle_id, unit_cost, customer_name } = saleResult.rows[0]

      const inventoryItemVariantId = parseOptionalInt(inventory_item_variant_id)

      await assertCycleNotInventoryLocked(
        tx.query,
        cycle_id === undefined || cycle_id === null
          ? null
          : (typeof cycle_id === 'number' ? cycle_id : parseInt(cycle_id || '0', 10) || null),
        organizationId,
      )

      if (user.role !== 'admin') {
        if (!project_id) {
          return { forbidden: true } as const
        }

        const access = await tx.query(
          `
          SELECT 1
            FROM project_assignments pa
           WHERE pa.project_id = $1 AND pa.user_id = $2
          UNION
          SELECT 1
            FROM project_assignments pa
            JOIN team_members tm ON tm.team_id = pa.team_id
           WHERE pa.project_id = $1 AND tm.user_id = $2
           LIMIT 1
          `,
          [project_id, user.id],
        )

        if (!access.rows.length) {
          return { forbidden: true } as const
        }
      }

      if (inventoryItemVariantId && quantity > 0) {
        await postInventoryV2MovementByVariantId(tx.query, {
          organizationId,
          projectId: project_id || null,
          cycleId: cycle_id || null,
          inventoryItemVariantId,
          quantityDelta: quantity,
          unitCost: unit_cost || null,
          transactionType: 'REVERSAL',
          sourceType: 'sale',
          sourceId: Number(id) || null,
          notes: `Sale #${id} deleted${customer_name ? ` - ${customer_name}` : ''}`,
          createdBy: user.id,
        })
      }

      if (product_id && quantity > 0) {
        const updateResult = await tx.query(
          'UPDATE products SET quantity_in_stock = quantity_in_stock + $1 WHERE id = $2 AND organization_id = $3 RETURNING id',
          [quantity, product_id, organizationId]
        )
        if (updateResult.rows.length === 0) {
          throw new Error('Failed to restore product stock. Product not found or permission denied.')
        }

        if (variant_id) {
          const variantUpdate = await tx.query(
            'UPDATE product_variants SET quantity_in_stock = quantity_in_stock + $1 WHERE id = $2 RETURNING id',
            [quantity, variant_id]
          )
          if (variantUpdate.rows.length === 0) {
            throw new Error('Failed to restore product variant stock. Variant not found or permission denied.')
          }
        }

        await tx.query(
          `INSERT INTO inventory_transactions (
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
          ) VALUES ($1,$2,$3,$4,$5,NULL,'SALE_REVERSAL',$6,$7,$8,$9)`,
          [
            organizationId,
            project_id || null,
            cycle_id || null,
            product_id,
            variant_id || null,
            quantity,
            unit_cost || null,
            `Sale #${id} deleted${customer_name ? ` - ${customer_name}` : ''}`,
            user.id,
          ],
        )

        if (!inventoryItemVariantId) {
          await postInventoryV2Movement(tx.query, {
            organizationId,
            projectId: project_id || null,
            cycleId: cycle_id || null,
            productId: product_id,
            productVariantId: variant_id || null,
            quantityDelta: quantity,
            unitCost: unit_cost || null,
            transactionType: 'REVERSAL',
            sourceType: 'sale',
            sourceId: Number(id) || null,
            notes: `Sale #${id} deleted${customer_name ? ` - ${customer_name}` : ''}`,
            createdBy: user.id,
          })
        }
      }

      await tx.query('DELETE FROM sales WHERE id = $1 AND organization_id = $2', [id, organizationId])
      return { ok: true } as const
    })

    if ((result as any).forbidden) {
      return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json({
      status: 'success',
      message: 'Sale deleted successfully',
    })
  } catch (error) {
    if (isCycleInventoryLockedError(error)) {
      return NextResponse.json({ status: 'error', message: error.message }, { status: 409 })
    }
    console.error('Sale deletion error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to delete sale'
    return NextResponse.json({
      status: 'error',
      message: errorMessage,
    }, { status: 500 })
  }
}