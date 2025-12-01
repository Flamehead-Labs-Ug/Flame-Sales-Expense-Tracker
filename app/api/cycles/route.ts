import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/database'
import { getSessionUser } from '@/lib/api-auth'
import { computeAmountInOrgCurrency } from '@/lib/org-currency'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('project_id')
    const orgId = searchParams.get('org_id')
    
    const sessionUser = await getSessionUser(request as NextRequest)
    const organizationId = orgId || sessionUser?.organizationId

    if (!organizationId) {
      return NextResponse.json({ status: 'error', message: 'Authentication required' }, { status: 401 })
    }
    
    let query = 'SELECT * FROM cycles WHERE organization_id = $1'
    let params: any[] = [organizationId]
    
    if (projectId) {
      query += ' AND project_id = $2'
      params.push(projectId)
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
    const sessionUser = await getSessionUser(request)
    if (!sessionUser?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'Authentication required' }, { status: 401 })
    }

    const { project_id, cycle_number, cycle_name, start_date, end_date, budget_allotment } = await request.json()
    const { organizationId, id: userId } = sessionUser

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
    const sessionUser = await getSessionUser(request)
    if (!sessionUser?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'Authentication required' }, { status: 401 })
    }

    const { id, project_id, cycle_number, cycle_name, start_date, end_date, budget_allotment } = await request.json()

    const numericBudget = typeof budget_allotment === 'number' ? budget_allotment : parseFloat(budget_allotment || '0') || 0
    const budgetOrgCcy = await computeAmountInOrgCurrency(sessionUser.organizationId, project_id || null, numericBudget)

    const result = await db.query(
      'UPDATE cycles SET project_id = $1, cycle_number = $2, cycle_name = $3, start_date = $4, end_date = $5, budget_allotment = $6, budget_allotment_org_ccy = $7 WHERE id = $8 AND organization_id = $9 RETURNING *',
      [project_id, cycle_number, cycle_name, start_date, end_date, numericBudget, budgetOrgCcy, id, sessionUser.organizationId]
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
    const sessionUser = await getSessionUser(request)
    if (!sessionUser?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'Authentication required' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    await db.query('DELETE FROM cycles WHERE id = $1 AND organization_id = $2', [id, sessionUser.organizationId])

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