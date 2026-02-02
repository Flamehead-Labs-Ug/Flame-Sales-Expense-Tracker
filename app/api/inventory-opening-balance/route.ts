import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/database'
import { getApiOrSessionUser } from '@/lib/api-auth-keys'
import { assertCycleNotInventoryLocked, isCycleInventoryLockedError } from '@/lib/cycle-inventory-lock'
import { postInventoryV2MovementByVariantId } from '@/lib/inventory-v2'

function toInt(value: any): number | null {
  const n = typeof value === 'number' ? value : parseInt(String(value || ''), 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

function toNumOrNull(value: any): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : parseFloat(String(value || '0'))
  return Number.isFinite(n) ? n : null
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

export async function POST(request: NextRequest) {
  try {
    const user = await getApiOrSessionUser(request)
    if (!user?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'API key required' }, { status: 401 })
    }

    const body = await request.json()

    const projectId = toInt(body.project_id)
    const cycleId = toInt(body.cycle_id)
    const linesRaw = Array.isArray(body.lines) ? body.lines : []

    if (!projectId) {
      return NextResponse.json({ status: 'error', message: 'project_id is required' }, { status: 400 })
    }
    if (!cycleId) {
      return NextResponse.json({ status: 'error', message: 'cycle_id is required' }, { status: 400 })
    }

    const lines = linesRaw
      .map((l: any) => ({
        inventory_item_variant_id: toInt(l.inventory_item_variant_id),
        quantity_on_hand: typeof l.quantity_on_hand === 'number' ? l.quantity_on_hand : parseInt(String(l.quantity_on_hand || '0'), 10) || 0,
        unit_cost: toNumOrNull(l.unit_cost),
      }))
      .filter((l: any) => l.inventory_item_variant_id && Number.isFinite(l.quantity_on_hand))

    if (!lines.length) {
      return NextResponse.json({ status: 'error', message: 'lines are required' }, { status: 400 })
    }

    const result = await db.transaction(async (tx) => {
      await assertProjectAccess(tx.query, user, projectId)
      await assertCycleNotInventoryLocked(tx.query, cycleId, user.organizationId)

      const v2Check = await tx.query(
        "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'inventory_balances' LIMIT 1",
      )
      if (!v2Check.rows.length) {
        throw new Error('Inventory v2 is not enabled')
      }

      for (const l of lines) {
        const variantId = Number(l.inventory_item_variant_id)
        const desiredQty = Number(l.quantity_on_hand) || 0

        const existingBal = await tx.query(
          `
          SELECT quantity_on_hand
            FROM inventory_balances
           WHERE organization_id = $1
             AND project_id = $2
             AND cycle_id = $3
             AND inventory_item_variant_id = $4
           LIMIT 1
          `,
          [user.organizationId, projectId, cycleId, variantId],
        )

        const currentQty = Number(existingBal.rows[0]?.quantity_on_hand ?? 0) || 0
        const delta = desiredQty - currentQty
        if (!delta) continue

        await postInventoryV2MovementByVariantId(tx.query, {
          organizationId: user.organizationId,
          projectId,
          cycleId,
          inventoryItemVariantId: variantId,
          quantityDelta: delta,
          unitCost: delta > 0 ? (l.unit_cost ?? null) : null,
          transactionType: 'OPENING_BALANCE',
          sourceType: 'opening_balance',
          sourceId: null,
          notes: null,
          createdBy: user.id,
        })
      }

      const updated = await tx.query(
        `
        SELECT b.*
          FROM inventory_balances b
         WHERE b.organization_id = $1
           AND b.project_id = $2
           AND b.cycle_id = $3
        `,
        [user.organizationId, projectId, cycleId],
      )

      return { balances: updated.rows || [] } as const
    })

    return NextResponse.json({ status: 'success', balances: (result as any).balances })
  } catch (error) {
    if (isCycleInventoryLockedError(error)) {
      return NextResponse.json({ status: 'error', message: error.message }, { status: 409 })
    }
    const message = error instanceof Error ? error.message : 'Failed to post opening balance'
    const status = message === 'Forbidden' ? 403 : 500
    return NextResponse.json({ status: 'error', message }, { status })
  }
}
