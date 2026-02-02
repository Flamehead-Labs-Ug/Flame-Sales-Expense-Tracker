import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/database'
import { getApiOrSessionUser } from '@/lib/api-auth-keys'
import { assertCycleNotInventoryLocked, isCycleInventoryLockedError } from '@/lib/cycle-inventory-lock'
import { postInventoryV2MovementByVariantId } from '@/lib/inventory-v2'

type ProductionOrderInputPayload = {
  input_inventory_item_variant_id: number
  quantity_required: number
  unit_cost_override?: number | null
  notes?: string | null
}

function toInt(value: any): number | null {
  const n = typeof value === 'number' ? value : parseInt(String(value || ''), 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

function toNum(value: any): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value || '0'))
  return Number.isFinite(n) ? n : 0
}

async function assertProjectAccess(queryFn: (t: string, p?: any[]) => Promise<{ rows: any[] }>, user: any, projectId: number) {
  if (user.role === 'admin') return

  const access = await queryFn(
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
    throw new Error('Forbidden')
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getApiOrSessionUser(request)
    if (!user?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'API key required' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const projectId = searchParams.get('project_id')
    const cycleId = searchParams.get('cycle_id')

    let query = 'SELECT * FROM production_orders WHERE organization_id = $1'
    const params: any[] = [user.organizationId]
    let i = 1

    if (user.role !== 'admin') {
      i += 1
      query += ` AND project_id IN (
        SELECT pa.project_id FROM project_assignments pa WHERE pa.user_id = $${i}
        UNION
        SELECT pa.project_id FROM project_assignments pa JOIN team_members tm ON tm.team_id = pa.team_id WHERE tm.user_id = $${i}
      )`
      params.push(user.id)
    }

    if (id) {
      i += 1
      query += ` AND id = $${i}`
      params.push(id)
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

    query += ' ORDER BY id DESC'

    const ordersRes = await db.query(query, params)
    const orders = ordersRes.rows || []

    const ids = orders.map((o: any) => o.id).filter(Boolean)
    if (!ids.length) {
      return NextResponse.json({ status: 'success', orders: [] })
    }

    const inputsRes = await db.query(
      `
      SELECT *
        FROM production_order_inputs
       WHERE production_order_id = ANY($1::int[])
       ORDER BY id ASC
      `,
      [ids],
    )

    const inputsByOrderId = new Map<number, any[]>()
    for (const row of inputsRes.rows || []) {
      const oid = Number(row.production_order_id)
      if (!inputsByOrderId.has(oid)) inputsByOrderId.set(oid, [])
      inputsByOrderId.get(oid)!.push(row)
    }

    const hydrated = orders.map((o: any) => ({
      ...o,
      inputs: inputsByOrderId.get(Number(o.id)) || [],
    }))

    return NextResponse.json({ status: 'success', orders: hydrated })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch production orders'
    return NextResponse.json({ status: 'error', message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getApiOrSessionUser(request)
    if (!user?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'API key required' }, { status: 401 })
    }

    const body = await request.json()

    const projectId = toInt(body.project_id)
    const cycleId = toInt(body.cycle_id)
    const outputVariantId = toInt(body.output_inventory_item_variant_id)
    const outputQty = toInt(body.output_quantity)
    const notes = typeof body.notes === 'string' ? body.notes : null

    const inputsRaw = Array.isArray(body.inputs) ? body.inputs : []
    const inputs: ProductionOrderInputPayload[] = inputsRaw
      .map((x: any) => ({
        input_inventory_item_variant_id: toInt(x.input_inventory_item_variant_id) || 0,
        quantity_required: toInt(x.quantity_required) || 0,
        unit_cost_override: x.unit_cost_override == null ? null : toNum(x.unit_cost_override) || null,
        notes: typeof x.notes === 'string' ? x.notes : null,
      }))
      .filter((x: any) => x.input_inventory_item_variant_id > 0 && x.quantity_required > 0)

    if (!projectId) {
      return NextResponse.json({ status: 'error', message: 'project_id is required' }, { status: 400 })
    }
    if (!cycleId) {
      return NextResponse.json({ status: 'error', message: 'cycle_id is required' }, { status: 400 })
    }
    if (!outputVariantId) {
      return NextResponse.json({ status: 'error', message: 'output_inventory_item_variant_id is required' }, { status: 400 })
    }
    if (!outputQty) {
      return NextResponse.json({ status: 'error', message: 'output_quantity is required' }, { status: 400 })
    }
    if (!inputs.length) {
      return NextResponse.json({ status: 'error', message: 'inputs are required' }, { status: 400 })
    }

    const result = await db.transaction(async (tx) => {
      await assertProjectAccess(tx.query, user, projectId)
      await assertCycleNotInventoryLocked(tx.query, cycleId, user.organizationId)

      const ins = await tx.query(
        `
        INSERT INTO production_orders (
          organization_id,
          project_id,
          cycle_id,
          status,
          output_inventory_item_variant_id,
          output_quantity,
          notes,
          created_by
        ) VALUES ($1,$2,$3,'DRAFT',$4,$5,$6,$7)
        RETURNING *
        `,
        [user.organizationId, projectId, cycleId, outputVariantId, outputQty, notes, user.id],
      )

      const order = ins.rows[0]

      for (const input of inputs) {
        await tx.query(
          `
          INSERT INTO production_order_inputs (
            production_order_id,
            input_inventory_item_variant_id,
            quantity_required,
            unit_cost_override,
            notes
          ) VALUES ($1,$2,$3,$4,$5)
          `,
          [order.id, input.input_inventory_item_variant_id, input.quantity_required, input.unit_cost_override ?? null, input.notes ?? null],
        )
      }

      const inputsRes = await tx.query(
        'SELECT * FROM production_order_inputs WHERE production_order_id = $1 ORDER BY id ASC',
        [order.id],
      )

      return { order: { ...order, inputs: inputsRes.rows || [] } } as const
    })

    return NextResponse.json({ status: 'success', order: (result as any).order })
  } catch (error) {
    if (isCycleInventoryLockedError(error)) {
      return NextResponse.json({ status: 'error', message: error.message }, { status: 409 })
    }
    const message = error instanceof Error ? error.message : 'Failed to create production order'
    const status = message === 'Forbidden' ? 403 : 500
    return NextResponse.json({ status: 'error', message }, { status })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getApiOrSessionUser(request)
    if (!user?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'API key required' }, { status: 401 })
    }

    const body = await request.json()
    const id = toInt(body.id)
    if (!id) {
      return NextResponse.json({ status: 'error', message: 'id is required' }, { status: 400 })
    }

    const nextStatus = typeof body.status === 'string' ? body.status : null
    const nextNotes = body.notes === undefined ? undefined : (typeof body.notes === 'string' ? body.notes : null)

    const outputVariantId = body.output_inventory_item_variant_id === undefined ? undefined : toInt(body.output_inventory_item_variant_id)
    const outputQty = body.output_quantity === undefined ? undefined : toInt(body.output_quantity)

    const inputsRaw = body.inputs === undefined ? undefined : (Array.isArray(body.inputs) ? body.inputs : [])
    const inputs: ProductionOrderInputPayload[] | undefined =
      inputsRaw === undefined
        ? undefined
        : inputsRaw
            .map((x: any) => ({
              input_inventory_item_variant_id: toInt(x.input_inventory_item_variant_id) || 0,
              quantity_required: toInt(x.quantity_required) || 0,
              unit_cost_override: x.unit_cost_override == null ? null : toNum(x.unit_cost_override) || null,
              notes: typeof x.notes === 'string' ? x.notes : null,
            }))
            .filter((x: any) => x.input_inventory_item_variant_id > 0 && x.quantity_required > 0)

    const result = await db.transaction(async (tx) => {
      const existingRes = await tx.query(
        'SELECT * FROM production_orders WHERE id = $1 AND organization_id = $2',
        [id, user.organizationId],
      )
      if (!existingRes.rows.length) {
        throw new Error('Not found')
      }

      const existing = existingRes.rows[0]
      await assertProjectAccess(tx.query, user, Number(existing.project_id))
      await assertCycleNotInventoryLocked(tx.query, Number(existing.cycle_id), user.organizationId)

      const currentStatus = String(existing.status || 'DRAFT')

      if (inputs !== undefined) {
        if (currentStatus === 'COMPLETED') {
          throw new Error('Cannot modify inputs for a completed production order')
        }
        await tx.query('DELETE FROM production_order_inputs WHERE production_order_id = $1', [id])
        for (const input of inputs) {
          await tx.query(
            `
            INSERT INTO production_order_inputs (
              production_order_id,
              input_inventory_item_variant_id,
              quantity_required,
              unit_cost_override,
              notes
            ) VALUES ($1,$2,$3,$4,$5)
            `,
            [id, input.input_inventory_item_variant_id, input.quantity_required, input.unit_cost_override ?? null, input.notes ?? null],
          )
        }
      }

      const updatedOutputVariantId = outputVariantId === undefined ? Number(existing.output_inventory_item_variant_id) : outputVariantId
      const updatedOutputQty = outputQty === undefined ? Number(existing.output_quantity) : outputQty

      const updateFields: string[] = []
      const updateParams: any[] = []
      let p = 0

      if (nextNotes !== undefined) {
        p += 1
        updateFields.push(`notes = $${p}`)
        updateParams.push(nextNotes)
      }

      if (outputVariantId !== undefined) {
        p += 1
        updateFields.push(`output_inventory_item_variant_id = $${p}`)
        updateParams.push(outputVariantId)
      }

      if (outputQty !== undefined) {
        p += 1
        updateFields.push(`output_quantity = $${p}`)
        updateParams.push(outputQty)
      }

      let finalStatus = currentStatus
      if (nextStatus) {
        finalStatus = nextStatus
        p += 1
        updateFields.push(`status = $${p}`)
        updateParams.push(nextStatus)
      }

      if (updateFields.length > 0) {
        p += 1
        updateParams.push(id)
        p += 1
        updateParams.push(user.organizationId)

        await tx.query(
          `UPDATE production_orders SET ${updateFields.join(', ')} WHERE id = $${p - 1} AND organization_id = $${p}`,
          updateParams,
        )
      }

      const afterRes = await tx.query(
        'SELECT * FROM production_orders WHERE id = $1 AND organization_id = $2',
        [id, user.organizationId],
      )
      const after = afterRes.rows[0]

      if (finalStatus === 'COMPLETED' && currentStatus !== 'COMPLETED') {
        const inputsRes = await tx.query(
          'SELECT * FROM production_order_inputs WHERE production_order_id = $1 ORDER BY id ASC',
          [id],
        )
        const lines = inputsRes.rows || []
        if (!lines.length) {
          throw new Error('inputs are required')
        }

        let totalCost = 0
        for (const line of lines) {
          const qty = Number(line.quantity_required) || 0
          if (qty <= 0) continue

          let unitCost = line.unit_cost_override == null ? null : (Number(line.unit_cost_override) || null)
          if (unitCost == null) {
            const balRes = await tx.query(
              `
              SELECT avg_unit_cost
                FROM inventory_balances
               WHERE organization_id = $1
                 AND project_id = $2
                 AND cycle_id = $3
                 AND inventory_item_variant_id = $4
               LIMIT 1
              `,
              [user.organizationId, after.project_id, after.cycle_id, line.input_inventory_item_variant_id],
            )
            unitCost = balRes.rows[0]?.avg_unit_cost == null ? null : (Number(balRes.rows[0]?.avg_unit_cost) || null)
          }
          if (unitCost == null) {
            const varRes = await tx.query(
              'SELECT unit_cost FROM inventory_item_variants WHERE id = $1 LIMIT 1',
              [line.input_inventory_item_variant_id],
            )
            unitCost = varRes.rows[0]?.unit_cost == null ? null : (Number(varRes.rows[0]?.unit_cost) || null)
          }

          totalCost += qty * (unitCost || 0)
        }

        const outputUnitCost = updatedOutputQty > 0 ? (totalCost / updatedOutputQty) : 0

        for (const line of lines) {
          const qty = Number(line.quantity_required) || 0
          if (qty <= 0) continue

          const unitCost = line.unit_cost_override == null ? null : (Number(line.unit_cost_override) || null)

          await postInventoryV2MovementByVariantId(tx.query, {
            organizationId: user.organizationId,
            projectId: Number(after.project_id),
            cycleId: Number(after.cycle_id),
            inventoryItemVariantId: Number(line.input_inventory_item_variant_id),
            quantityDelta: -qty,
            unitCost,
            transactionType: 'PRODUCTION_ISSUE',
            sourceType: 'production_order',
            sourceId: id,
            notes: after.notes ?? null,
            createdBy: user.id,
          })
        }

        await postInventoryV2MovementByVariantId(tx.query, {
          organizationId: user.organizationId,
          projectId: Number(after.project_id),
          cycleId: Number(after.cycle_id),
          inventoryItemVariantId: Number(updatedOutputVariantId),
          quantityDelta: Number(updatedOutputQty),
          unitCost: outputUnitCost,
          transactionType: 'PRODUCTION_RECEIPT',
          sourceType: 'production_order',
          sourceId: id,
          notes: after.notes ?? null,
          createdBy: user.id,
        })

        await tx.query(
          `
          UPDATE production_orders
             SET output_unit_cost = $1,
                 completed_at = NOW(),
                 status = 'COMPLETED'
           WHERE id = $2 AND organization_id = $3
          `,
          [outputUnitCost, id, user.organizationId],
        )
      }

      const finalRes = await tx.query(
        'SELECT * FROM production_orders WHERE id = $1 AND organization_id = $2',
        [id, user.organizationId],
      )
      const finalOrder = finalRes.rows[0]
      const inputsRes = await tx.query(
        'SELECT * FROM production_order_inputs WHERE production_order_id = $1 ORDER BY id ASC',
        [id],
      )

      return { order: { ...finalOrder, inputs: inputsRes.rows || [] } } as const
    })

    return NextResponse.json({ status: 'success', order: (result as any).order })
  } catch (error) {
    if (isCycleInventoryLockedError(error)) {
      return NextResponse.json({ status: 'error', message: error.message }, { status: 409 })
    }
    const message = error instanceof Error ? error.message : 'Failed to update production order'
    const status = message === 'Forbidden' ? 403 : (message === 'Not found' ? 404 : 500)
    return NextResponse.json({ status: 'error', message }, { status })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getApiOrSessionUser(request)
    if (!user?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'API key required' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = toInt(searchParams.get('id'))
    if (!id) {
      return NextResponse.json({ status: 'error', message: 'id is required' }, { status: 400 })
    }

    await db.transaction(async (tx) => {
      const existingRes = await tx.query(
        'SELECT project_id, cycle_id, status FROM production_orders WHERE id = $1 AND organization_id = $2',
        [id, user.organizationId],
      )
      if (!existingRes.rows.length) {
        throw new Error('Not found')
      }

      const existing = existingRes.rows[0]
      await assertProjectAccess(tx.query, user, Number(existing.project_id))
      await assertCycleNotInventoryLocked(tx.query, Number(existing.cycle_id), user.organizationId)

      const currentStatus = String(existing.status || 'DRAFT')
      if (currentStatus === 'COMPLETED') {
        throw new Error('Cannot delete a completed production order')
      }

      await tx.query('DELETE FROM production_orders WHERE id = $1 AND organization_id = $2', [id, user.organizationId])
    })

    return NextResponse.json({ status: 'success', message: 'Production order deleted successfully' })
  } catch (error) {
    if (isCycleInventoryLockedError(error)) {
      return NextResponse.json({ status: 'error', message: error.message }, { status: 409 })
    }
    const message = error instanceof Error ? error.message : 'Failed to delete production order'
    const status = message === 'Forbidden' ? 403 : (message === 'Not found' ? 404 : 500)
    return NextResponse.json({ status: 'error', message }, { status })
  }
}
