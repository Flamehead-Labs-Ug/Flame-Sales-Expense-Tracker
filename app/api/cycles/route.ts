import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/database'
import { getApiOrSessionUser } from '@/lib/api-auth-keys'
import { computeAmountInOrgCurrency } from '@/lib/org-currency'

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

    const { project_id, cycle_number, cycle_name, start_date, end_date, budget_allotment } = await request.json()
    const { organizationId, id: userId } = user

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

    const numericBudget = typeof budget_allotment === 'number' ? budget_allotment : parseFloat(budget_allotment || '0') || 0
    const budgetOrgCcy = await computeAmountInOrgCurrency(organizationId, project_id || null, numericBudget)

    const result = await db.query(
      'INSERT INTO cycles (project_id, cycle_number, cycle_name, start_date, end_date, budget_allotment, budget_allotment_org_ccy, organization_id, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
      [project_id, cycle_number, cycle_name || null, start_date || null, end_date || null, numericBudget || null, budgetOrgCcy, organizationId, userId]
    )
    
    return NextResponse.json({ 
      status: 'success', 
      cycle: result.rows[0] 
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

    const { id, project_id, cycle_number, cycle_name, start_date, end_date, budget_allotment } = await request.json()

    if (user.role !== 'admin') {
      const existing = await db.query(
        'SELECT project_id FROM cycles WHERE id = $1 AND organization_id = $2',
        [id, user.organizationId],
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
    const budgetOrgCcy = await computeAmountInOrgCurrency(user.organizationId, project_id || null, numericBudget)

    const result = await db.query(
      'UPDATE cycles SET project_id = $1, cycle_number = $2, cycle_name = $3, start_date = $4, end_date = $5, budget_allotment = $6, budget_allotment_org_ccy = $7 WHERE id = $8 AND organization_id = $9 RETURNING *',
      [project_id, cycle_number, cycle_name, start_date, end_date, numericBudget, budgetOrgCcy, id, user.organizationId]
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

    if (user.role !== 'admin') {
      const existing = await db.query(
        'SELECT project_id FROM cycles WHERE id = $1 AND organization_id = $2',
        [id, user.organizationId],
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

    await db.query('DELETE FROM cycles WHERE id = $1 AND organization_id = $2', [id, user.organizationId])

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