import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/database'
import { getApiOrSessionUser } from '@/lib/api-auth-keys'

function toInt(value: any): number | null {
  const n = typeof value === 'number' ? value : parseInt(String(value || ''), 10)
  return Number.isFinite(n) && n > 0 ? n : null
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
    const projectId = toInt(searchParams.get('project_id'))
    const cycleId = toInt(searchParams.get('cycle_id'))
    const typeCode = searchParams.get('type_code')
    const inventoryItemVariantId = toInt(searchParams.get('inventory_item_variant_id'))

    const limitRaw = parseInt(String(searchParams.get('limit') || '200'), 10)
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 5000) : 200

    if ((projectId && !cycleId) || (!projectId && cycleId)) {
      return NextResponse.json(
        { status: 'error', message: 'project_id and cycle_id must be provided together' },
        { status: 400 },
      )
    }

    if (projectId) {
      await assertProjectAccess(db.query, user, projectId)
    }

    const v2Check = await db.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'inventory_item_transactions' LIMIT 1",
    )
    if (!v2Check.rows.length) {
      return NextResponse.json({ status: 'success', transactions: [] })
    }

    let query = `
      SELECT
        iit.*,
        ii.name AS item_name,
        it.code AS type_code,
        iiv.label AS variant_label,
        iiv.sku AS variant_sku
      FROM inventory_item_transactions iit
      JOIN inventory_item_variants iiv ON iiv.id = iit.inventory_item_variant_id
      JOIN inventory_items ii ON ii.id = iit.inventory_item_id
      JOIN inventory_item_types it ON it.id = ii.inventory_item_type_id
      WHERE iit.organization_id = $1
    `

    const params: any[] = [user.organizationId]
    let i = 1

    if (projectId) {
      i += 1
      query += ` AND iit.project_id = $${i}`
      params.push(projectId)

      i += 1
      query += ` AND iit.cycle_id = $${i}`
      params.push(cycleId)
    }

    if (typeCode) {
      i += 1
      query += ` AND it.code = $${i}`
      params.push(typeCode)
    }

    if (inventoryItemVariantId) {
      i += 1
      query += ` AND iit.inventory_item_variant_id = $${i}`
      params.push(inventoryItemVariantId)
    }

    i += 1
    query += ` ORDER BY iit.created_at DESC, iit.id DESC LIMIT $${i}`
    params.push(limit)

    const { rows } = await db.query(query, params)

    return NextResponse.json({ status: 'success', transactions: rows })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch inventory log'
    const status = message === 'Forbidden' ? 403 : 500
    return NextResponse.json({ status: 'error', message }, { status })
  }
}
