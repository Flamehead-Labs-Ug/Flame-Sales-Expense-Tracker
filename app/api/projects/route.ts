import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/database'
import { getSessionUser } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const orgId = searchParams.get('org_id')
    
    const sessionUser = await getSessionUser(request);
    const organizationId = orgId || sessionUser?.organizationId;
    if (!organizationId) {
      return NextResponse.json({ status: 'error', message: 'Authentication required' }, { status: 401 });
    }
    
    const result = await db.query(
      'SELECT * FROM projects WHERE organization_id = $1 ORDER BY project_name',
      [organizationId]
    )
    return NextResponse.json({ 
      status: 'success', 
      projects: result.rows 
    })
  } catch (error) {
    return NextResponse.json({ 
      status: 'error', 
      message: 'Failed to fetch projects' 
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request);
    if (!sessionUser?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'Authentication required' }, { status: 401 });
    }
    const { organizationId: targetOrgId, id: userId } = sessionUser;

    const { project_name, project_category_id, currency_code } = await request.json();
    
    const result = await db.query(
      'INSERT INTO projects (project_name, project_category_id, organization_id, created_by, currency_code) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [project_name, project_category_id, targetOrgId, userId, currency_code || null]
    )
    
    return NextResponse.json({ 
      status: 'success', 
      project: result.rows[0] 
    })
  } catch (error) {
    console.error('Project creation error:', error)
    return NextResponse.json({ 
      status: 'error', 
      message: 'Failed to create project' 
    }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request);
    if (!sessionUser?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'Authentication required' }, { status: 401 });
    }
    const { organizationId } = sessionUser;

    const { id, project_name, description, start_date, end_date, project_category_id, expense_category_id, currency_code } = await request.json();
    
    const result = await db.query(
      'UPDATE projects SET project_name = $1, description = $2, start_date = $3, end_date = $4, project_category_id = $5, category_id = $6, currency_code = $7 WHERE id = $8 AND organization_id = $9 RETURNING *',
      [project_name, description || null, start_date || null, end_date || null, project_category_id, expense_category_id || null, currency_code || null, id, organizationId]
    )
    
    return NextResponse.json({
      status: 'success',
      project: result.rows[0]
    })
 } catch (error) {
    return NextResponse.json({
      status: 'error',
      message: 'Failed to update project'
    }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request);
    if (!sessionUser?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'Authentication required' }, { status: 401 });
    }
    const { organizationId } = sessionUser;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    await db.query('DELETE FROM projects WHERE id = $1 AND organization_id = $2', [id, organizationId])
    
    return NextResponse.json({ 
      status: 'success', 
      message: 'Project deleted successfully' 
    })
  } catch (error) {
    return NextResponse.json({ 
      status: 'error', 
      message: 'Failed to delete project' 
    }, { status: 500 })
  }
}