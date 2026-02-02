'use strict'

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/database'
import { getApiOrSessionUser } from '@/lib/api-auth-keys'

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
    const typeCode = searchParams.get('type_code')
    const projectId = toInt(searchParams.get('project_id'))
    const cycleId = toInt(searchParams.get('cycle_id'))

    if ((projectId && !cycleId) || (!projectId && cycleId)) {
      return NextResponse.json({ status: 'error', message: 'project_id and cycle_id must be provided together' }, { status: 400 })
    }

    if (projectId) {
      await assertProjectAccess(db.query, user, projectId)
    }

    const params: any[] = [user.organizationId]
    let i = 1

    let query = `
      SELECT
        ii.*,
        it.code AS type_code,
        it.name AS type_name
      FROM inventory_items ii
      JOIN inventory_item_types it ON it.id = ii.inventory_item_type_id
      WHERE ii.organization_id = $1
    `

    if (typeCode) {
      i += 1
      query += ` AND it.code = $${i}`
      params.push(typeCode)
    }

    query += ' ORDER BY ii.id DESC'

    const itemsRes = await db.query(query, params)
    const items = itemsRes.rows || []

    const itemIds = items.map((x: any) => x.id).filter(Boolean)
    if (!itemIds.length) {
      return NextResponse.json({ status: 'success', items: [] })
    }

    const variantsRes = await db.query(
      `
      SELECT *
        FROM inventory_item_variants
       WHERE inventory_item_id = ANY($1::int[])
       ORDER BY id ASC
      `,
      [itemIds],
    )

    const balancesRes = (projectId && cycleId)
      ? await db.query(
          `
          SELECT inventory_item_variant_id, quantity_on_hand, avg_unit_cost
            FROM inventory_balances
           WHERE organization_id = $1
             AND project_id = $2
             AND cycle_id = $3
          `,
          [user.organizationId, projectId, cycleId],
        )
      : { rows: [] as any[] }

    const balanceByVariantId = new Map<number, { quantity_on_hand: number; avg_unit_cost: number | null }>()
    for (const b of balancesRes.rows || []) {
      balanceByVariantId.set(Number(b.inventory_item_variant_id), {
        quantity_on_hand: Number(b.quantity_on_hand ?? 0) || 0,
        avg_unit_cost: b.avg_unit_cost == null ? null : (Number(b.avg_unit_cost) || null),
      })
    }

    const variantsByItemId = new Map<number, any[]>()
    for (const v of variantsRes.rows || []) {
      const itemId = Number(v.inventory_item_id)
      const variantId = Number(v.id)
      const bal = balanceByVariantId.get(variantId) || null

      const enriched = {
        ...v,
        quantity_on_hand: bal ? bal.quantity_on_hand : undefined,
        avg_unit_cost: bal ? bal.avg_unit_cost : undefined,
      }

      if (!variantsByItemId.has(itemId)) variantsByItemId.set(itemId, [])
      variantsByItemId.get(itemId)!.push(enriched)
    }

    const hydrated = items.map((it: any) => ({
      ...it,
      variants: variantsByItemId.get(Number(it.id)) || [],
    }))

    return NextResponse.json({ status: 'success', items: hydrated })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch inventory items'
    const status = message === 'Forbidden' ? 403 : 500
    return NextResponse.json({ status: 'error', message }, { status })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getApiOrSessionUser(request)
    if (!user?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'API key required' }, { status: 401 })
    }

    const body = await request.json()

    const typeCode = typeof body.inventory_item_type_code === 'string' ? body.inventory_item_type_code : null
    const typeId = body.inventory_item_type_id === undefined ? null : toInt(body.inventory_item_type_id)
    const name = typeof body.name === 'string' ? body.name.trim() : ''

    if (!name) {
      return NextResponse.json({ status: 'error', message: 'name is required' }, { status: 400 })
    }

    const sku = typeof body.sku === 'string' ? body.sku : null
    const imageUrl = typeof body.image_url === 'string' ? body.image_url : null
    const uom = typeof body.uom === 'string' ? body.uom : null
    const isActive = body.is_active === undefined ? true : Boolean(body.is_active)
    const defaultPurchaseUnitCost = body.default_purchase_unit_cost == null ? null : (toNum(body.default_purchase_unit_cost) || null)
    const defaultSalePrice = body.default_sale_price == null ? null : (toNum(body.default_sale_price) || null)
    const description = typeof body.description === 'string' ? body.description : null

    const variantsRaw = Array.isArray(body.variants) ? body.variants : []
    const variants = variantsRaw
      .map((v: any) => ({
        label: typeof v.label === 'string' ? v.label : null,
        sku: typeof v.sku === 'string' ? v.sku : null,
        is_active: v.is_active === undefined ? true : Boolean(v.is_active),
        unit_cost: v.unit_cost == null ? null : (toNum(v.unit_cost) || null),
        selling_price: v.selling_price == null ? null : (toNum(v.selling_price) || null),
      }))
      .filter((v: any) => v.label || v.sku || v.unit_cost != null || v.selling_price != null)

    const result = await db.transaction(async (tx) => {
      let resolvedTypeId: number | null = typeId

      if (!resolvedTypeId && typeCode) {
        const t = await tx.query('SELECT id FROM inventory_item_types WHERE code = $1 LIMIT 1', [typeCode])
        resolvedTypeId = t.rows[0]?.id ?? null
      }

      if (!resolvedTypeId) {
        throw new Error('inventory_item_type_id or inventory_item_type_code is required')
      }

      const ins = await tx.query(
        `
        INSERT INTO inventory_items (
          organization_id,
          inventory_item_type_id,
          name,
          sku,
          image_url,
          uom,
          is_active,
          default_purchase_unit_cost,
          default_sale_price,
          description,
          created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        RETURNING *
        `,
        [
          user.organizationId,
          resolvedTypeId,
          name,
          sku,
          imageUrl,
          uom,
          isActive,
          defaultPurchaseUnitCost,
          defaultSalePrice,
          description,
          user.id,
        ],
      )

      const item = ins.rows[0]

      if (variants.length > 0) {
        for (const v of variants) {
          await tx.query(
            `
            INSERT INTO inventory_item_variants (
              inventory_item_id,
              label,
              sku,
              is_active,
              unit_cost,
              selling_price
            ) VALUES ($1,$2,$3,$4,$5,$6)
            `,
            [item.id, v.label, v.sku, v.is_active, v.unit_cost, v.selling_price],
          )
        }
      } else {
        await tx.query(
          `
          INSERT INTO inventory_item_variants (
            inventory_item_id,
            label,
            sku,
            is_active,
            unit_cost,
            selling_price
          ) VALUES ($1,'Default',$2,true,$3,$4)
          `,
          [item.id, sku, defaultPurchaseUnitCost, defaultSalePrice],
        )
      }

      const vres = await tx.query('SELECT * FROM inventory_item_variants WHERE inventory_item_id = $1 ORDER BY id ASC', [item.id])

      return { item: { ...item, variants: vres.rows || [] } } as const
    })

    return NextResponse.json({ status: 'success', item: (result as any).item })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create inventory item'
    const status = message === 'Forbidden' ? 403 : 500
    return NextResponse.json({ status: 'error', message }, { status })
  }
}
