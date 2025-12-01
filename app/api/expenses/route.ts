import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/database'
import { getSessionUser } from '@/lib/api-auth'
import { computeAmountInOrgCurrency } from '@/lib/org-currency'

export async function GET(request: Request) {
  try {
    const sessionUser = await getSessionUser(request as NextRequest)
    if (!sessionUser?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'Authentication required' }, { status: 401 })
    }
    const { organizationId } = sessionUser
    
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('project_id')
    const cycleId = searchParams.get('cycle_id')
    const search = searchParams.get('search')
    const limit = searchParams.get('limit') || '100'
    
    let query = 'SELECT * FROM expenses WHERE organization_id = $1'
    let params: any[] = [organizationId]
    let paramCount = 1
    
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
      query += ` AND description ILIKE $${paramCount}`
      params.push(`%${search}%`)
    }
    
    query += ` ORDER BY date_time_created DESC LIMIT $${paramCount + 1}`
    params.push(parseInt(limit))
    
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
    const sessionUser = await getSessionUser(request)
    if (!sessionUser?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'Authentication required' }, { status: 401 })
    }
    const { organizationId, id: userId } = sessionUser

    // The current expenses table does not have an expense_name or receipt_id column,
    // so we only persist description and other structural fields here.
    // Any linkage to a receipt should be done via receipts.expense_id.
    const { project_id, category_id, vendor_id, payment_method_id, cycle_id, description, amount, expense_date } = await request.json()

    const numericAmount = typeof amount === 'number' ? amount : parseFloat(amount || '0') || 0
    const amountOrgCcy = await computeAmountInOrgCurrency(organizationId, project_id || null, numericAmount)

    const result = await db.query(
      'INSERT INTO expenses (project_id, category_id, vendor_id, payment_method_id, cycle_id, description, amount, amount_org_ccy, date_time_created, organization_id, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *',
      [project_id || null, category_id || null, vendor_id || null, payment_method_id || null, cycle_id || null, description || null, numericAmount, amountOrgCcy, expense_date || new Date().toISOString(), organizationId, userId]
    )
    
    return NextResponse.json({ 
      status: 'success', 
      expense: result.rows[0] 
    })
  } catch (error) {
    console.error('Expense creation error:', error)
    return NextResponse.json({ 
      status: 'error', 
      message: 'Failed to create expense' 
    }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request)
    if (!sessionUser?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'Authentication required' }, { status: 401 })
    }
    const { organizationId } = sessionUser

    // Do not reference expense_name in the UPDATE, since the column does not exist.
    const { id, project_id, category_id, vendor_id, payment_method_id, cycle_id, description, amount, expense_date } = await request.json()

    const numericAmount = typeof amount === 'number' ? amount : parseFloat(amount || '0') || 0
    const amountOrgCcy = await computeAmountInOrgCurrency(organizationId, project_id || null, numericAmount)

    const result = await db.query(
      'UPDATE expenses SET project_id = $1, category_id = $2, vendor_id = $3, payment_method_id = $4, cycle_id = $5, description = $6, amount = $7, amount_org_ccy = $8, date_time_created = $9 WHERE id = $10 AND organization_id = $11 RETURNING *',
      [project_id, category_id, vendor_id, payment_method_id, cycle_id, description, numericAmount, amountOrgCcy, expense_date, id, organizationId]
    )
    
    return NextResponse.json({ 
      status: 'success', 
      expense: result.rows[0] 
    })
  } catch (error) {
    return NextResponse.json({ 
      status: 'error', 
      message: 'Failed to update expense' 
    }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request)
    if (!sessionUser?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'Authentication required' }, { status: 401 })
    }
    const { organizationId } = sessionUser

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    
    await db.query('DELETE FROM expenses WHERE id = $1 AND organization_id = $2', [id, organizationId])
    
    return NextResponse.json({ 
      status: 'success', 
      message: 'Expense deleted successfully' 
    })
  } catch (error) {
    return NextResponse.json({ 
      status: 'error', 
      message: 'Failed to delete expense' 
    }, { status: 500 })
  }
}