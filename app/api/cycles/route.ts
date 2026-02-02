import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/database'
import { getApiOrSessionUser } from '@/lib/api-auth-keys'
import { computeAmountInOrgCurrency } from '@/lib/org-currency'
import { getDefaultPreviousCycleIdWithQuery } from '@/lib/cycle-inventory-lock'

/**
 * @swagger
 * /api/cycles:
 *   get:
 *     operationId: listCycles
 *     tags:
 *       - Cycles
 *     summary: List project cycles
 *     description: List cycles for the current organization, optionally filtered by project or organization.
 *     security:
 *       - stackSession: []
 *     parameters:
 *       - in: query
 *         name: project_id
 *         required: false
 *         schema:
 *           type: string
 *       - in: query
 *         name: org_id
 *         required: false
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Cycles fetched successfully.
 *       401:
 *         description: API key required.
 *   post:
 *     operationId: createCycle
 *     tags:
 *       - Cycles
 *     summary: Create a new project cycle
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
 *               cycle_number:
 *                 type: integer
 *               cycle_name:
 *                 type: string
 *                 nullable: true
 *               start_date:
 *                 type: string
 *                 format: date
 *                 nullable: true
 *               end_date:
 *                 type: string
 *                 format: date
 *                 nullable: true
 *               budget_allotment:
 *                 type: number
 *                 nullable: true
 *             required:
 *               - project_id
 *               - cycle_number
 *     responses:
 *       200:
 *         description: Cycle created successfully.
 *       401:
 *         description: API key required.
 *   put:
 *     operationId: updateCycle
 *     tags:
 *       - Cycles
 *     summary: Update an existing project cycle
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
 *               cycle_number:
 *                 type: integer
 *               cycle_name:
 *                 type: string
 *                 nullable: true
 *               start_date:
 *                 type: string
 *                 format: date
 *                 nullable: true
 *               end_date:
 *                 type: string
 *                 format: date
 *                 nullable: true
 *               budget_allotment:
 *                 type: number
 *                 nullable: true
 *             required:
 *               - id
 *     responses:
 *       200:
 *         description: Cycle updated successfully.
 *       401:
 *         description: API key required.
 *   delete:
 *     operationId: deleteCycle
 *     tags:
 *       - Cycles
 *     summary: Delete a cycle
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
 *         description: Cycle deleted successfully.
 *       401:
 *         description: API key required.
 */

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('project_id')
    const orgId = searchParams.get('org_id')
    const id = searchParams.get('id')
    
    const user = await getApiOrSessionUser(request as NextRequest)
    if (!user) {
      return NextResponse.json({ status: 'error', message: 'API key required' }, { status: 401 })
    }

    let organizationId: string | number | null = user.organizationId

    if (orgId) {
      if (String(user.organizationId) === String(orgId)) {
        organizationId = orgId
      } else {
        if (user.role !== 'admin') {
          return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 })
        }

        const orgCheck = await db.query(
          'SELECT id FROM organizations WHERE id = $1 AND created_by = $2',
          [orgId, user.id],
        )
        if (!orgCheck.rows.length) {
          return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 })
        }
        organizationId = orgId
      }
    }

    if (!organizationId) {
      return NextResponse.json({ status: 'error', message: 'API key required' }, { status: 401 })
    }

    const organizationIdNum = typeof organizationId === 'string' ? parseInt(organizationId, 10) : organizationId

    if (projectId && user.role !== 'admin') {
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
    
    let query = 'SELECT * FROM cycles WHERE organization_id = $1'
    const params: any[] = [organizationIdNum]
    let paramCount = 1

    if (user.role !== 'admin') {
      paramCount++
      query += ` AND project_id IN (
        SELECT pa.project_id FROM project_assignments pa WHERE pa.user_id = $${paramCount}
        UNION
        SELECT pa.project_id FROM project_assignments pa JOIN team_members tm ON tm.team_id = pa.team_id WHERE tm.user_id = $${paramCount}
      )`
      params.push(user.id)
    }
    
    if (projectId) {
      paramCount++
      query += ` AND project_id = $${paramCount}`
      params.push(projectId)
    }

    if (id) {
      paramCount++
      query += ` AND id = $${paramCount}`
      params.push(id)
    }
    
    query += ' ORDER BY cycle_number'
    
    const result = await db.query(query, params)
    return NextResponse.json({ 
      status: 'success', 
      cycles: result.rows 
    })
  } catch (error) {
    return NextResponse.json({ 
      status: 'error', 
      message: 'Failed to fetch cycles' 
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getApiOrSessionUser(request)
    if (!user?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'API key required' }, { status: 401 })
    }

    const {
      project_id,
      cycle_number,
      cycle_name,
      start_date,
      end_date,
      budget_allotment,
      carry_forward_inventory,
      carry_forward_from_cycle_id,
    } = await request.json()
    const { id: userId } = user

    if (!project_id) {
      return NextResponse.json({ status: 'error', message: 'Project ID is required' }, { status: 400 })
    }

    const projectResult = await db.query(
      'SELECT organization_id FROM projects WHERE id = $1',
      [project_id],
    )

    if (!projectResult.rows.length) {
      return NextResponse.json({ status: 'error', message: 'Project not found' }, { status: 404 })
    }

    const projectOrgId = projectResult.rows[0]?.organization_id as number | null
    if (!projectOrgId) {
      return NextResponse.json({ status: 'error', message: 'Project is missing organization' }, { status: 400 })
    }

    // Ensure the user is allowed to create cycles in the project's organization
    if (user.role !== 'admin') {
      if (String(projectOrgId) !== String(user.organizationId)) {
        return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 })
      }
    } else {
      if (String(projectOrgId) !== String(user.organizationId)) {
        const orgCheck = await db.query(
          'SELECT id FROM organizations WHERE id = $1 AND created_by = $2',
          [projectOrgId, user.id],
        )
        if (!orgCheck.rows.length) {
          return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 })
        }
      }
    }

    if (user.role !== 'admin') {
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

    const numericBudget = typeof budget_allotment === 'number' ? budget_allotment : parseFloat(budget_allotment || '0') || 0
    const budgetOrgCcy = await computeAmountInOrgCurrency(projectOrgId, project_id || null, numericBudget)

    const result = await db.transaction(async (tx) => {
      const cycleRes = await tx.query(
        `
        WITH ins_cycle AS (
          INSERT INTO cycles (
            project_id,
            cycle_number,
            cycle_name,
            start_date,
            end_date,
            budget_allotment,
            budget_allotment_org_ccy,
            organization_id,
            created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::int)
          RETURNING *
        ),
        ins_tx AS (
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
          SELECT
            $8::int,
            $1::int,
            c.id,
            'ALLOTMENT_SET',
            $6::numeric,
            $7::numeric,
            0::numeric,
            $6::numeric,
            'Initial budget on cycle creation',
            $9::int
          FROM ins_cycle c
          WHERE COALESCE($6::numeric, 0) > 0
          RETURNING id
        )
        SELECT * FROM ins_cycle
        `,
        [
          project_id,
          cycle_number,
          cycle_name || null,
          start_date || null,
          end_date || null,
          numericBudget || null,
          budgetOrgCcy,
          projectOrgId,
          userId,
        ],
      )

      const createdCycle = cycleRes.rows[0]

      if (!carry_forward_inventory) {
        return { cycle: createdCycle } as const
      }

      const v2Check = await tx.query(
        "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'inventory_balances' LIMIT 1",
      )
      if (!v2Check.rows.length) {
        return { cycle: createdCycle } as const
      }

      const lockCols = await tx.query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cycles' AND column_name IN ('carry_forward_from_cycle_id','opening_balance_posted_at','opening_balance_posted_by','inventory_locked_at','inventory_locked_by')",
      )
      const colSet = new Set<string>(lockCols.rows.map((r: any) => String(r.column_name)))
      const hasCarryForwardCols =
        colSet.has('carry_forward_from_cycle_id') &&
        colSet.has('opening_balance_posted_at') &&
        colSet.has('opening_balance_posted_by') &&
        colSet.has('inventory_locked_at') &&
        colSet.has('inventory_locked_by')

      const prevCycleId = carry_forward_from_cycle_id
        ? (typeof carry_forward_from_cycle_id === 'number'
          ? carry_forward_from_cycle_id
          : parseInt(carry_forward_from_cycle_id || '0', 10) || null)
        : await getDefaultPreviousCycleIdWithQuery(tx.query, projectOrgId, project_id, createdCycle?.id ?? null)

      if (!prevCycleId) {
        return { cycle: createdCycle } as const
      }

      if (hasCarryForwardCols) {
        const alreadyPosted = await tx.query(
          'SELECT opening_balance_posted_at FROM cycles WHERE id = $1 AND organization_id = $2',
          [createdCycle.id, projectOrgId],
        )
        if (alreadyPosted.rows[0]?.opening_balance_posted_at) {
          return { cycle: createdCycle } as const
        }
      }

      await tx.query(
        `
        INSERT INTO inventory_item_transactions (
          organization_id,
          project_id,
          cycle_id,
          inventory_item_id,
          inventory_item_variant_id,
          transaction_type,
          quantity_delta,
          unit_cost,
          source_type,
          source_id,
          notes,
          created_by
        )
        SELECT
          b.organization_id,
          b.project_id,
          $1::int,
          v.inventory_item_id,
          b.inventory_item_variant_id,
          'OPENING_BALANCE',
          b.quantity_on_hand,
          b.avg_unit_cost,
          'cycle_carry_forward',
          $2::int,
          'Carry-forward opening balance',
          $3::int
        FROM inventory_balances b
        JOIN inventory_item_variants v ON v.id = b.inventory_item_variant_id
        WHERE b.organization_id = $4
          AND b.project_id = $5
          AND b.cycle_id = $6
          AND b.quantity_on_hand <> 0
        `,
        [createdCycle.id, prevCycleId, userId, projectOrgId, project_id, prevCycleId],
      )

      await tx.query(
        `
        INSERT INTO inventory_balances (
          organization_id,
          project_id,
          cycle_id,
          inventory_item_variant_id,
          quantity_on_hand,
          avg_unit_cost
        )
        SELECT
          b.organization_id,
          b.project_id,
          $1::int,
          b.inventory_item_variant_id,
          b.quantity_on_hand,
          b.avg_unit_cost
        FROM inventory_balances b
        WHERE b.organization_id = $2
          AND b.project_id = $3
          AND b.cycle_id = $4
          AND b.quantity_on_hand <> 0
        ON CONFLICT (organization_id, project_id, cycle_id, inventory_item_variant_id)
        DO UPDATE SET
          quantity_on_hand = EXCLUDED.quantity_on_hand,
          avg_unit_cost = EXCLUDED.avg_unit_cost,
          updated_at = NOW()
        `,
        [createdCycle.id, projectOrgId, project_id, prevCycleId],
      )

      if (hasCarryForwardCols) {
        await tx.query(
          `
          UPDATE cycles
             SET carry_forward_from_cycle_id = $1,
                 opening_balance_posted_at = NOW(),
                 opening_balance_posted_by = $2
           WHERE id = $3 AND organization_id = $4
          `,
          [prevCycleId, userId, createdCycle.id, projectOrgId],
        )

        await tx.query(
          `
          UPDATE cycles
             SET inventory_locked_at = COALESCE(inventory_locked_at, NOW()),
                 inventory_locked_by = COALESCE(inventory_locked_by, $1)
           WHERE id = $2 AND organization_id = $3
          `,
          [userId, prevCycleId, projectOrgId],
        )
      }

      const refreshed = await tx.query(
        'SELECT * FROM cycles WHERE id = $1 AND organization_id = $2',
        [createdCycle.id, projectOrgId],
      )

      return { cycle: refreshed.rows[0] ?? createdCycle } as const
    })
    
    return NextResponse.json({ 
      status: 'success', 
      cycle: (result as any).cycle 
    })
  } catch (error) {
    console.error('Cycle creation error:', error)
    return NextResponse.json({ 
      status: 'error', 
      message: 'Failed to create cycle' 
    }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getApiOrSessionUser(request)
    if (!user?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'API key required' }, { status: 401 })
    }

    const { id, project_id, cycle_number, cycle_name, start_date, end_date, budget_allotment, org_id } = await request.json()

    let organizationId: string | number | null = user.organizationId

    if (org_id != null) {
      if (String(user.organizationId) === String(org_id)) {
        organizationId = org_id
      } else {
        if (user.role !== 'admin') {
          return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 })
        }

        const orgCheck = await db.query(
          'SELECT id FROM organizations WHERE id = $1 AND created_by = $2',
          [org_id, user.id],
        )
        if (!orgCheck.rows.length) {
          return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 })
        }
        organizationId = org_id
      }
    }

    if (!organizationId) {
      return NextResponse.json({ status: 'error', message: 'API key required' }, { status: 401 })
    }

    const organizationIdNum = typeof organizationId === 'string' ? parseInt(organizationId, 10) : organizationId

    if (user.role !== 'admin') {
      const existing = await db.query(
        'SELECT project_id FROM cycles WHERE id = $1 AND organization_id = $2',
        [id, organizationIdNum],
      )
      if (!existing.rows.length) {
        return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 })
      }

      const targetProjectId = project_id ?? existing.rows[0]?.project_id
      if (!targetProjectId) {
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
        [targetProjectId, user.id],
      )

      if (!access.rows.length) {
        return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 })
      }
    }

    const numericBudget = typeof budget_allotment === 'number' ? budget_allotment : parseFloat(budget_allotment || '0') || 0
    const budgetOrgCcy = await computeAmountInOrgCurrency(organizationIdNum, project_id || null, numericBudget)

    const result = await db.query(
      'UPDATE cycles SET project_id = $1, cycle_number = $2, cycle_name = $3, start_date = $4, end_date = $5, budget_allotment = $6, budget_allotment_org_ccy = $7 WHERE id = $8 AND organization_id = $9 RETURNING *',
      [project_id, cycle_number, cycle_name, start_date, end_date, numericBudget, budgetOrgCcy, id, organizationIdNum]
    )

    return NextResponse.json({
      status: 'success',
      cycle: result.rows[0],
    })
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to update cycle',
      },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getApiOrSessionUser(request)
    if (!user?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'API key required' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const orgId = searchParams.get('org_id')

    let organizationId: string | number | null = user.organizationId

    if (orgId) {
      if (String(user.organizationId) === String(orgId)) {
        organizationId = orgId
      } else {
        if (user.role !== 'admin') {
          return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 })
        }

        const orgCheck = await db.query(
          'SELECT id FROM organizations WHERE id = $1 AND created_by = $2',
          [orgId, user.id],
        )
        if (!orgCheck.rows.length) {
          return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 })
        }
        organizationId = orgId
      }
    }

    if (!organizationId) {
      return NextResponse.json({ status: 'error', message: 'API key required' }, { status: 401 })
    }

    const organizationIdNum = typeof organizationId === 'string' ? parseInt(organizationId, 10) : organizationId

    if (user.role !== 'admin') {
      const existing = await db.query(
        'SELECT project_id FROM cycles WHERE id = $1 AND organization_id = $2',
        [id, organizationIdNum],
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

    const deleted = await db.query('DELETE FROM cycles WHERE id = $1 AND organization_id = $2 RETURNING id', [id, organizationIdNum])

    if (!deleted.rows.length) {
      return NextResponse.json({ status: 'error', message: 'Cycle not found' }, { status: 404 })
    }

    return NextResponse.json({
      status: 'success',
      message: 'Cycle deleted successfully',
    })
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to delete cycle',
      },
      { status: 500 }
    )
  }
}