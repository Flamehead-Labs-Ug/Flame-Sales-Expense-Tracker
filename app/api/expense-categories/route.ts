import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/database'
import { getSessionUser, isUserMidSetup } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request);
    const midSetup = await isUserMidSetup(request);

    if (!sessionUser?.id || (!sessionUser.organizationId && !midSetup)) {
      return NextResponse.json({ status: 'error', message: 'Authentication required' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    if (midSetup) {
      const result = await db.query('SELECT * FROM expense_category WHERE organization_id IS NULL ORDER BY category_name');
      return NextResponse.json({
        status: 'success',
        categories: result.rows,
      });
    }

    const { organizationId } = sessionUser;

    if (projectId) {
      const result = await db.query(
        'SELECT * FROM expense_category WHERE organization_id = $1 AND (project_id = $2 OR project_id IS NULL) ORDER BY category_name',
        [organizationId, projectId]
      );
      return NextResponse.json({
        status: 'success',
        categories: result.rows,
      });
    }

    const result = await db.query(
      'SELECT * FROM expense_category WHERE organization_id = $1 AND project_id IS NULL ORDER BY category_name',
      [organizationId]
    );

    return NextResponse.json({
      status: 'success',
      categories: result.rows,
    });
  } catch (error: any) {
    console.error('Expense categories API error:', error)
    return NextResponse.json({
      status: 'error',
      message: `Failed to fetch expense categories: ${error.message}`
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request);
    if (!sessionUser?.id) {
      return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 401 });
    }

    const { category_name, project_category_id, description, organization_id, project_id } = await request.json();
    const orgId = organization_id || sessionUser.organizationId;

    if (!orgId) {
      return NextResponse.json({ status: 'error', message: 'Organization ID is required' }, { status: 400 });
    }

    const result = await db.query(
      'INSERT INTO expense_category (category_name, project_category_id, description, organization_id, project_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [category_name, project_category_id || null, description || null, orgId, project_id || null]
    );

    return NextResponse.json({
      status: 'success',
      category: result.rows[0],
    });
  } catch (error) {
    console.error('Error creating expense category:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to create expense category',
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request)
    if (!sessionUser?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'Authentication required' }, { status: 401 })
    }
    const { organizationId } = sessionUser

    const { id, category_name, project_category_id, description } = await request.json()

    const result = await db.query(
      'UPDATE expense_category SET category_name = $1, project_category_id = $2, description = $3 WHERE id = $4 AND organization_id = $5 RETURNING *',
      [category_name, project_category_id, description, id, organizationId]
    )

    return NextResponse.json({
      status: 'success',
      category: result.rows[0],
    })
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to update expense category',
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
    const { organizationId } = sessionUser

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    await db.query('DELETE FROM expense_category WHERE id = $1 AND organization_id = $2', [id, organizationId])

    return NextResponse.json({
      status: 'success',
      message: 'Expense category deleted successfully',
    })
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to delete expense category',
      },
      { status: 500 }
    )
  }
}