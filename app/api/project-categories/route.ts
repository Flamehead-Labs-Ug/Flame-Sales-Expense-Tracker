import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/database'
import { getSessionUser, isUserMidSetup } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request);
    const midSetup = await isUserMidSetup(request);

    if (!sessionUser?.id || (!sessionUser.organizationId && !midSetup)) {
      return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    if (midSetup) {
      const result = await db.query('SELECT * FROM project_categories WHERE organization_id IS NULL ORDER BY category_name');
      return NextResponse.json({
        status: 'success',
        categories: result.rows,
      });
    }

    if (projectId) {
      const result = await db.query(
        'SELECT * FROM project_categories WHERE (organization_id = $1 OR organization_id IS NULL) AND (project_id = $2 OR project_id IS NULL) ORDER BY category_name',
        [sessionUser.organizationId, projectId]
      );
      return NextResponse.json({
        status: 'success',
        categories: result.rows,
      });
    }

    const result = await db.query(
      'SELECT * FROM project_categories WHERE (organization_id = $1 OR organization_id IS NULL) AND project_id IS NULL ORDER BY category_name',
      [sessionUser.organizationId]
    );
    return NextResponse.json({
      status: 'success',
      categories: result.rows,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to fetch project categories',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request);
    if (!sessionUser?.id) {
      return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 401 });
    }

    const { category_name, description, is_custom, organization_id, project_id } = await request.json();
    const orgId = organization_id || sessionUser.organizationId;

    if (!orgId) {
      return NextResponse.json({ status: 'error', message: 'Organization ID is required' }, { status: 400 });
    }

    const result = await db.query(
      'INSERT INTO project_categories (category_name, description, is_custom, organization_id, project_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [category_name, description || null, is_custom ? 1 : 0, orgId, project_id || null]
    );

    return NextResponse.json({
      status: 'success',
      category: result.rows[0],
    });
  } catch (error) {
    console.error('Error creating project category:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to create project category',
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request);
    if (!sessionUser?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 401 });
    }

    const { id, category_name, description, is_custom } = await request.json();

    const result = await db.query(
      'UPDATE project_categories SET category_name = $1, description = $2, is_custom = $3 WHERE id = $4 AND organization_id = $5 RETURNING *',
      [category_name, description, is_custom, id, sessionUser.organizationId]
    );

    return NextResponse.json({
      status: 'success',
      category: result.rows[0],
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to update project category',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request);
    if (!sessionUser?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    await db.query('DELETE FROM project_categories WHERE id = $1 AND organization_id = $2', [id, sessionUser.organizationId]);

    return NextResponse.json({
      status: 'success',
      message: 'Project category deleted successfully',
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to delete project category',
      },
      { status: 500 }
    );
  }
}