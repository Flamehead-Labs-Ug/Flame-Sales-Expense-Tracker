import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/database'
import { getApiOrSessionUser } from '@/lib/api-auth-keys'
import { computeAmountInOrgCurrency } from '@/lib/org-currency'
import { assertCycleNotInventoryLocked, isCycleInventoryLockedError } from '@/lib/cycle-inventory-lock'
import { postInventoryV2Movement, postInventoryV2MovementByVariantId } from '@/lib/inventory-v2'

type QueryFn = (text: string, params?: any[]) => Promise<{ rows: any[] }>

let expensesHasInventoryVariantIdCache: boolean | null = null

async function expensesHasInventoryItemVariantId(queryFn: QueryFn): Promise<boolean> {
  if (expensesHasInventoryVariantIdCache !== null) return expensesHasInventoryVariantIdCache

  const res = await queryFn(
    "SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'expenses' AND column_name = 'inventory_item_variant_id' LIMIT 1",
  )

  expensesHasInventoryVariantIdCache = res.rows.length > 0
  return expensesHasInventoryVariantIdCache
}

function parseOptionalInt(value: any): number | null {
  if (value === undefined || value === null || value === '') return null
  const n = typeof value === 'number' ? value : parseInt(String(value || '0'), 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * @swagger
 * /api/expenses:
 *   get:
 *     operationId: listExpenses
 *     tags:
 *       - Expenses
 *     summary: List expenses
 *     description: List expenses for the authenticated user's organization with optional filters.
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
 *         name: search
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
 *         description: Expenses fetched successfully.
 *       401:
 *         description: API key required.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 message:
 *                   type: string
 *                   example: API key required
 *   post:
 *     operationId: createExpense
 *     tags:
 *       - Expenses
 *     summary: Create a new expense
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
 *               category_id:
 *                 type: integer
 *                 nullable: true
 *               vendor_id:
 *                 type: integer
 *                 nullable: true
 *               payment_method_id:
 *                 type: integer
 *                 nullable: true
 *               cycle_id:
 *                 type: integer
 *                 nullable: true
 *               expense_name:
 *                 type: string
 *                 nullable: true
 *               description:
 *                 type: string
 *                 nullable: true
 *               amount:
 *                 type: number
 *               expense_date:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *               product_id:
 *                 type: integer
 *                 nullable: true
 *               variant_id:
 *                 type: integer
 *                 nullable: true
 *               inventory_quantity:
 *                 type: number
 *                 nullable: true
 *               inventory_unit_cost:
 *                 type: number
 *                 nullable: true
 *             required:
 *               - amount
 *     responses:
 *       200:
 *         description: Expense created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 expense:
 *                   $ref: '#/components/schemas/Expense'
 *       401:
 *         description: API key required.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 message:
 *                   type: string
 *                   example: API key required
 *   put:
 *     operationId: updateExpense
 *     tags:
 *       - Expenses
 *     summary: Update an existing expense
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
 *               category_id:
 *                 type: integer
 *                 nullable: true
 *               vendor_id:
 *                 type: integer
 *                 nullable: true
 *               payment_method_id:
 *                 type: integer
 *                 nullable: true
 *               cycle_id:
 *                 type: integer
 *                 nullable: true
 *               expense_name:
 *                 type: string
 *                 nullable: true
 *               description:
 *                 type: string
 *                 nullable: true
 *               amount:
 *                 type: number
 *               expense_date:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *               product_id:
 *                 type: integer
 *                 nullable: true
 *               variant_id:
 *                 type: integer
 *                 nullable: true
 *               inventory_quantity:
 *                 type: number
 *                 nullable: true
 *               inventory_unit_cost:
 *                 type: number
 *                 nullable: true
 *             required:
 *               - id
 *               - amount
 *     responses:
 *       200:
 *         description: Expense updated successfully.
 *       401:
 *         description: API key required.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 message:
 *                   type: string
 *                   example: API key required
 *   delete:
 *     operationId: deleteExpense
 *     tags:
 *       - Expenses
 *     summary: Delete an expense
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
 *         description: Expense deleted successfully.
 *       401:
 *         description: API key required.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 message:
 *                   type: string
 *                   example: API key required
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
    const search = searchParams.get('search')
    const limit = searchParams.get('limit') || '100'

    const hasInvVariantFilter = await expensesHasInventoryItemVariantId(db.query)

    let query = 'SELECT * FROM expenses WHERE organization_id = $1'
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

    if (search) {
      paramCount++
      query += ` AND (description ILIKE $${paramCount} OR expense_name ILIKE $${paramCount})`
      params.push(`%${search}%`)
    }

    if (id) {
      query += ' LIMIT 1'
    } else {
      query += ` ORDER BY date_time_created DESC LIMIT $${paramCount + 1}`
      params.push(parseInt(limit))
    }

    const result = await db.query(query, params)
    return NextResponse.json({ 
      status: 'success', 
      expenses: result.rows 
    })
  } catch (error) {
    console.error('Expenses GET error:', error)
    return NextResponse.json({ 
      status: 'error', 
      message: 'Failed to fetch expenses' 
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getApiOrSessionUser(request)
    if (!user?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'API key required' }, { status: 401 })
    }
    const { organizationId, id: userId } = user

    const {
      project_id,
      category_id,
      vendor_id,
      payment_method_id,
      cycle_id,
      expense_name,
      description,
      amount,
      expense_date,
      product_id,
      variant_id,
      inventory_item_variant_id,
      inventory_quantity,
      inventory_unit_cost,
    } = await request.json()

    if (user.role !== 'admin') {
      if (!project_id) {
        return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 })
      }

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
        [project_id, userId],
      )

      if (!access.rows.length) {
        return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 })
      }
    }

    const safeInventoryQuantity = typeof inventory_quantity === 'number'
      ? inventory_quantity
      : parseInt(inventory_quantity || '0', 10) || 0

    const safeInventoryUnitCost = typeof inventory_unit_cost === 'number'
      ? inventory_unit_cost
      : parseFloat(inventory_unit_cost || '0') || 0

    const computedAmount = (safeInventoryQuantity > 0 && safeInventoryUnitCost > 0)
      ? safeInventoryQuantity * safeInventoryUnitCost
      : (typeof amount === 'number' ? amount : parseFloat(amount || '0') || 0)

    const numericAmount = computedAmount

    const result = await db.transaction(async (tx) => {
      const safeCycleId = cycle_id === undefined || cycle_id === null
        ? null
        : (typeof cycle_id === 'number' ? cycle_id : parseInt(cycle_id || '0', 10) || null)
      await assertCycleNotInventoryLocked(tx.query, safeCycleId, organizationId)

      const amountOrgCcy = await computeAmountInOrgCurrency(organizationId, project_id || null, numericAmount)

      const hasInvVariant = await expensesHasInventoryItemVariantId(tx.query)
      const inventoryItemVariantId = hasInvVariant ? parseOptionalInt(inventory_item_variant_id) : null

      const insert = hasInvVariant
        ? await tx.query(
            'INSERT INTO expenses (project_id, category_id, vendor_id, payment_method_id, cycle_id, expense_name, description, amount, amount_org_ccy, date_time_created, organization_id, created_by, product_id, variant_id, inventory_item_variant_id, inventory_quantity, inventory_unit_cost) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING *',
            [
              project_id || null,
              category_id || null,
              vendor_id || null,
              payment_method_id || null,
              safeCycleId,
              expense_name || null,
              description || null,
              numericAmount,
              amountOrgCcy,
              expense_date || new Date().toISOString(),
              organizationId,
              userId,
              product_id || null,
              variant_id || null,
              inventoryItemVariantId,
              safeInventoryQuantity || null,
              safeInventoryUnitCost || null,
            ],
          )
        : await tx.query(
            'INSERT INTO expenses (project_id, category_id, vendor_id, payment_method_id, cycle_id, expense_name, description, amount, amount_org_ccy, date_time_created, organization_id, created_by, product_id, variant_id, inventory_quantity, inventory_unit_cost) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING *',
            [
              project_id || null,
              category_id || null,
              vendor_id || null,
              payment_method_id || null,
              safeCycleId,
              expense_name || null,
              description || null,
              numericAmount,
              amountOrgCcy,
              expense_date || new Date().toISOString(),
              organizationId,
              userId,
              product_id || null,
              variant_id || null,
              safeInventoryQuantity || null,
              safeInventoryUnitCost || null,
            ],
          )

      // Increase stock if this is an inventory-linked purchase.
      if (safeInventoryQuantity > 0) {
        const createdExpenseId = insert.rows[0]?.id

        if (product_id) {
          const productUpdate = await tx.query(
            'UPDATE products SET quantity_in_stock = quantity_in_stock + $1 WHERE id = $2 AND organization_id = $3 RETURNING id',
            [safeInventoryQuantity, product_id, organizationId],
          )
          if (productUpdate.rows.length === 0) {
            throw new Error('Failed to update product stock. Product not found or permission denied.')
          }
        }

        if (variant_id) {
          const variantUpdate = await tx.query(
            'UPDATE product_variants SET quantity_in_stock = quantity_in_stock + $1 WHERE id = $2 RETURNING id',
            [safeInventoryQuantity, variant_id],
          )
          if (variantUpdate.rows.length === 0) {
            throw new Error('Failed to update product variant stock. Variant not found.')
          }
        }

        if (product_id) {
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
            ) VALUES ($1,$2,$3,$4,$5,$6,'PURCHASE',$7,$8,$9,$10)`,
            [
              organizationId,
              project_id || null,
              safeCycleId,
              product_id,
              variant_id || null,
              createdExpenseId || null,
              safeInventoryQuantity,
              safeInventoryUnitCost || null,
              description || expense_name || null,
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
              quantityDelta: safeInventoryQuantity,
              unitCost: safeInventoryUnitCost || null,
              transactionType: 'PURCHASE_RECEIPT',
              sourceType: 'expense',
              sourceId: createdExpenseId || null,
              notes: description || expense_name || null,
              createdBy: userId,
            })
          }
        }

        if (inventoryItemVariantId) {
          await postInventoryV2MovementByVariantId(tx.query, {
            organizationId,
            projectId: project_id || null,
            cycleId: safeCycleId,
            inventoryItemVariantId,
            quantityDelta: safeInventoryQuantity,
            unitCost: safeInventoryUnitCost || null,
            transactionType: 'PURCHASE_RECEIPT',
            sourceType: 'expense',
            sourceId: createdExpenseId || null,
            notes: description || expense_name || null,
            createdBy: userId,
          })
        }
      }

      return insert
    })

    return NextResponse.json({ 
      status: 'success', 
      expense: result.rows[0] 
    })
  } catch (error) {
    if (isCycleInventoryLockedError(error)) {
      return NextResponse.json({ status: 'error', message: error.message }, { status: 409 })
    }
    console.error('Expense creation error:', error)
    return NextResponse.json({ 
      status: 'error', 
      message: 'Failed to create expense' 
    }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getApiOrSessionUser(request)
    if (!user?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'API key required' }, { status: 401 })
    }
    const { organizationId } = user

    const {
      id,
      project_id,
      category_id,
      vendor_id,
      payment_method_id,
      cycle_id,
      expense_name,
      description,
      amount,
      expense_date,
      product_id,
      variant_id,
      inventory_item_variant_id,
      inventory_quantity,
      inventory_unit_cost,
    } = await request.json()

    if (user.role !== 'admin') {
      const existing = await db.query(
        'SELECT project_id FROM expenses WHERE id = $1 AND organization_id = $2',
        [id, organizationId],
      )
      const project_id = existing.rows[0]?.project_id
      if (!project_id) {
        return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 })
      }

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
        [project_id, user.id],
      )

      if (!access.rows.length) {
        return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 })
      }
    }

    const safeInventoryQuantity = typeof inventory_quantity === 'number'
      ? inventory_quantity
      : parseInt(inventory_quantity || '0', 10) || 0

    const safeInventoryUnitCost = typeof inventory_unit_cost === 'number'
      ? inventory_unit_cost
      : parseFloat(inventory_unit_cost || '0') || 0

    const computedAmount = (safeInventoryQuantity > 0 && safeInventoryUnitCost > 0)
      ? safeInventoryQuantity * safeInventoryUnitCost
      : (typeof amount === 'number' ? amount : parseFloat(amount || '0') || 0)

    const numericAmount = computedAmount

    const result = await db.transaction(async (tx) => {
      const hasInvVariant = await expensesHasInventoryItemVariantId(tx.query)

      const originalRes = await tx.query(
        hasInvVariant
          ? 'SELECT project_id, cycle_id, product_id, variant_id, inventory_item_variant_id, inventory_quantity, inventory_unit_cost FROM expenses WHERE id = $1 AND organization_id = $2'
          : 'SELECT project_id, cycle_id, product_id, variant_id, inventory_quantity, inventory_unit_cost FROM expenses WHERE id = $1 AND organization_id = $2',
        [id, organizationId],
      )

      if (!originalRes.rows.length) {
        throw new Error('Expense not found')
      }

      const original = originalRes.rows[0]
      const originalProjectId = original.project_id as number | null
      const originalProductId = original.product_id as number | null
      const originalVariantId = original.variant_id as number | null
      const originalInventoryItemVariantId = hasInvVariant
        ? parseOptionalInt((original as any).inventory_item_variant_id)
        : null
      const originalCycleId = original.cycle_id as number | null

      const originalInventoryUnitCost = original.inventory_unit_cost == null
        ? null
        : (typeof original.inventory_unit_cost === 'number'
          ? original.inventory_unit_cost
          : parseFloat(original.inventory_unit_cost || '0') || null)

      const targetCycleId = cycle_id === undefined || cycle_id === null
        ? originalCycleId
        : (typeof cycle_id === 'number' ? cycle_id : parseInt(cycle_id || '0', 10) || null)

      const effectiveProjectId = project_id === undefined ? originalProjectId : (project_id || null)
      const effectiveProductId = product_id === undefined ? originalProductId : (product_id || null)
      const effectiveVariantId = variant_id === undefined ? originalVariantId : (variant_id || null)
      const effectiveInventoryItemVariantId = hasInvVariant
        ? (inventory_item_variant_id === undefined ? originalInventoryItemVariantId : parseOptionalInt(inventory_item_variant_id))
        : null

      await assertCycleNotInventoryLocked(tx.query, originalCycleId, organizationId)
      await assertCycleNotInventoryLocked(tx.query, targetCycleId, organizationId)

      const originalQty = typeof original.inventory_quantity === 'number'
        ? original.inventory_quantity
        : parseInt(original.inventory_quantity || '0', 10) || 0

      // Revert original stock impact if it was inventory-linked
      if (originalQty > 0) {
        if (originalProductId) {
          await tx.query(
            'UPDATE products SET quantity_in_stock = quantity_in_stock - $1 WHERE id = $2 AND organization_id = $3',
            [originalQty, originalProductId, organizationId],
          )
        }

        if (originalVariantId) {
          await tx.query(
            'UPDATE product_variants SET quantity_in_stock = quantity_in_stock - $1 WHERE id = $2',
            [originalQty, originalVariantId],
          )
        }

        if (originalProductId) {
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
            ) VALUES ($1,$2,$3,$4,$5,$6,'REVERSAL',$7,$8,$9,$10)`,
            [
              organizationId,
              originalProjectId || null,
              originalCycleId,
              originalProductId,
              originalVariantId || null,
              id,
              -originalQty,
              originalInventoryUnitCost,
              `Reversal for expense #${id}`,
              user.id,
            ],
          )

          if (!originalInventoryItemVariantId) {
            await postInventoryV2Movement(tx.query, {
              organizationId,
              projectId: originalProjectId || null,
              cycleId: originalCycleId,
              productId: originalProductId,
              productVariantId: originalVariantId || null,
              quantityDelta: -originalQty,
              unitCost: originalInventoryUnitCost,
              transactionType: 'REVERSAL',
              sourceType: 'expense',
              sourceId: Number(id) || null,
              notes: `Reversal for expense #${id}`,
              createdBy: user.id,
            })
          }
        }

        if (originalInventoryItemVariantId) {
          await postInventoryV2MovementByVariantId(tx.query, {
            organizationId,
            projectId: originalProjectId || null,
            cycleId: originalCycleId,
            inventoryItemVariantId: originalInventoryItemVariantId,
            quantityDelta: -originalQty,
            unitCost: originalInventoryUnitCost,
            transactionType: 'REVERSAL',
            sourceType: 'expense',
            sourceId: Number(id) || null,
            notes: `Reversal for expense #${id}`,
            createdBy: user.id,
          })
        }
      }

      // Apply new stock impact
      if (safeInventoryQuantity > 0) {
        if (effectiveProductId) {
          const productUpdate = await tx.query(
            'UPDATE products SET quantity_in_stock = quantity_in_stock + $1 WHERE id = $2 AND organization_id = $3 RETURNING id',
            [safeInventoryQuantity, effectiveProductId, organizationId],
          )
          if (productUpdate.rows.length === 0) {
            throw new Error('Failed to update product stock. Product not found or permission denied.')
          }
        }

        if (effectiveVariantId) {
          const variantUpdate = await tx.query(
            'UPDATE product_variants SET quantity_in_stock = quantity_in_stock + $1 WHERE id = $2 RETURNING id',
            [safeInventoryQuantity, effectiveVariantId],
          )
          if (variantUpdate.rows.length === 0) {
            throw new Error('Failed to update product variant stock. Variant not found.')
          }
        }

        if (effectiveProductId) {
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
            ) VALUES ($1,$2,$3,$4,$5,$6,'PURCHASE',$7,$8,$9,$10)`,
            [
              organizationId,
              effectiveProjectId || null,
              targetCycleId,
              effectiveProductId,
              effectiveVariantId || null,
              id,
              safeInventoryQuantity,
              safeInventoryUnitCost || null,
              description || expense_name || null,
              user.id,
            ],
          )

          if (!effectiveInventoryItemVariantId) {
            await postInventoryV2Movement(tx.query, {
              organizationId,
              projectId: effectiveProjectId || null,
              cycleId: targetCycleId,
              productId: effectiveProductId,
              productVariantId: effectiveVariantId || null,
              quantityDelta: safeInventoryQuantity,
              unitCost: safeInventoryUnitCost || null,
              transactionType: 'PURCHASE_RECEIPT',
              sourceType: 'expense',
              sourceId: Number(id) || null,
              notes: description || expense_name || null,
              createdBy: user.id,
            })
          }
        }

        if (effectiveInventoryItemVariantId) {
          await postInventoryV2MovementByVariantId(tx.query, {
            organizationId,
            projectId: effectiveProjectId || null,
            cycleId: targetCycleId,
            inventoryItemVariantId: effectiveInventoryItemVariantId,
            quantityDelta: safeInventoryQuantity,
            unitCost: safeInventoryUnitCost || null,
            transactionType: 'PURCHASE_RECEIPT',
            sourceType: 'expense',
            sourceId: Number(id) || null,
            notes: description || expense_name || null,
            createdBy: user.id,
          })
        }
      }

      const amountOrgCcy = await computeAmountInOrgCurrency(organizationId, effectiveProjectId || null, numericAmount)

      return hasInvVariant
        ? await tx.query(
            'UPDATE expenses SET project_id = $1, category_id = $2, vendor_id = $3, payment_method_id = $4, cycle_id = $5, expense_name = $6, description = $7, amount = $8, amount_org_ccy = $9, date_time_created = $10, product_id = $11, variant_id = $12, inventory_item_variant_id = $13, inventory_quantity = $14, inventory_unit_cost = $15 WHERE id = $16 AND organization_id = $17 RETURNING *',
            [
              effectiveProjectId,
              category_id,
              vendor_id,
              payment_method_id,
              targetCycleId,
              expense_name || null,
              description,
              numericAmount,
              amountOrgCcy,
              expense_date,
              effectiveProductId,
              effectiveVariantId,
              effectiveInventoryItemVariantId,
              safeInventoryQuantity || null,
              safeInventoryUnitCost || null,
              id,
              organizationId,
            ],
          )
        : await tx.query(
            'UPDATE expenses SET project_id = $1, category_id = $2, vendor_id = $3, payment_method_id = $4, cycle_id = $5, expense_name = $6, description = $7, amount = $8, amount_org_ccy = $9, date_time_created = $10, product_id = $11, variant_id = $12, inventory_quantity = $13, inventory_unit_cost = $14 WHERE id = $15 AND organization_id = $16 RETURNING *',
            [
              effectiveProjectId,
              category_id,
              vendor_id,
              payment_method_id,
              targetCycleId,
              expense_name || null,
              description,
              numericAmount,
              amountOrgCcy,
              expense_date,
              effectiveProductId,
              effectiveVariantId,
              safeInventoryQuantity || null,
              safeInventoryUnitCost || null,
              id,
              organizationId,
            ],
          )
    })

    return NextResponse.json({ 
      status: 'success', 
      expense: result.rows[0] 
    })
  } catch (error) {
    if (isCycleInventoryLockedError(error)) {
      return NextResponse.json({ status: 'error', message: error.message }, { status: 409 })
    }
    return NextResponse.json({ 
      status: 'error', 
      message: 'Failed to update expense' 
    }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getApiOrSessionUser(request)
    if (!user?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'API key required' }, { status: 401 })
    }
    const { organizationId } = user

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (user.role !== 'admin') {
      const existing = await db.query(
        'SELECT project_id FROM expenses WHERE id = $1 AND organization_id = $2',
        [id, organizationId],
      )
      const project_id = existing.rows[0]?.project_id
      if (!project_id) {
        return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 })
      }

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
        [project_id, user.id],
      )

      if (!access.rows.length) {
        return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 })
      }
    }

    await db.transaction(async (tx) => {
      const hasInvVariant = await expensesHasInventoryItemVariantId(tx.query)

      const existing = await tx.query(
        hasInvVariant
          ? 'SELECT project_id, cycle_id, product_id, variant_id, inventory_item_variant_id, inventory_quantity, inventory_unit_cost FROM expenses WHERE id = $1 AND organization_id = $2'
          : 'SELECT project_id, cycle_id, product_id, variant_id, inventory_quantity, inventory_unit_cost FROM expenses WHERE id = $1 AND organization_id = $2',
        [id, organizationId],
      )

      if (!existing.rows.length) {
        return
      }

      const row = existing.rows[0]

      const existingCycleId = row.cycle_id as number | null
      await assertCycleNotInventoryLocked(tx.query, existingCycleId, organizationId)

      const existingProjectId = row.project_id as number | null

      const existingInventoryUnitCost = row.inventory_unit_cost == null
        ? null
        : (typeof row.inventory_unit_cost === 'number'
          ? row.inventory_unit_cost
          : parseFloat(row.inventory_unit_cost || '0') || null)

      const existingInventoryItemVariantId = hasInvVariant
        ? parseOptionalInt((row as any).inventory_item_variant_id)
        : null

      const qty = typeof row.inventory_quantity === 'number'
        ? row.inventory_quantity
        : parseInt(row.inventory_quantity || '0', 10) || 0

      if (qty > 0) {
        if (row.product_id) {
          await tx.query(
            'UPDATE products SET quantity_in_stock = quantity_in_stock - $1 WHERE id = $2 AND organization_id = $3',
            [qty, row.product_id, organizationId],
          )
        }

        if (row.variant_id) {
          await tx.query(
            'UPDATE product_variants SET quantity_in_stock = quantity_in_stock - $1 WHERE id = $2',
            [qty, row.variant_id],
          )
        }

        if (row.product_id) {
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
            ) VALUES ($1,$2,$3,$4,$5,$6,'REVERSAL',$7,$8,$9,$10)`,
            [
              organizationId,
              existingProjectId || null,
              existingCycleId,
              row.product_id,
              row.variant_id || null,
              id,
              -qty,
              existingInventoryUnitCost,
              `Reversal for expense #${id} (delete)`,
              user.id,
            ],
          )

          if (!existingInventoryItemVariantId) {
            await postInventoryV2Movement(tx.query, {
              organizationId,
              projectId: existingProjectId || null,
              cycleId: existingCycleId,
              productId: row.product_id,
              productVariantId: row.variant_id || null,
              quantityDelta: -qty,
              unitCost: existingInventoryUnitCost,
              transactionType: 'REVERSAL',
              sourceType: 'expense',
              sourceId: Number(id) || null,
              notes: `Reversal for expense #${id} (delete)`,
              createdBy: user.id,
            })
          }
        }

        if (existingInventoryItemVariantId) {
          await postInventoryV2MovementByVariantId(tx.query, {
            organizationId,
            projectId: existingProjectId || null,
            cycleId: existingCycleId,
            inventoryItemVariantId: existingInventoryItemVariantId,
            quantityDelta: -qty,
            unitCost: existingInventoryUnitCost,
            transactionType: 'REVERSAL',
            sourceType: 'expense',
            sourceId: Number(id) || null,
            notes: `Reversal for expense #${id} (delete)`,
            createdBy: user.id,
          })
        }
      }

      await tx.query('DELETE FROM expenses WHERE id = $1 AND organization_id = $2', [id, organizationId])
    })

    return NextResponse.json({
      status: 'success',
      message: 'Expense deleted successfully',
    })
  } catch (error) {
    if (isCycleInventoryLockedError(error)) {
      return NextResponse.json({ status: 'error', message: error.message }, { status: 409 })
    }
    return NextResponse.json({ 
      status: 'error', 
      message: 'Failed to delete expense' 
    }, { status: 500 })
  }
}