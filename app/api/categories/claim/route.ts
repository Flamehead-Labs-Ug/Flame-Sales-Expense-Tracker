import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { getSessionUser } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request);
    if (!sessionUser?.id || !sessionUser.organizationId) {
      return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, projectCategoryIds, expenseCategoryIds } = await request.json();

    if (!projectId) {
      return NextResponse.json({ status: 'error', message: 'Project ID is required' }, { status: 400 });
    }

    if (projectCategoryIds && projectCategoryIds.length > 0) {
      await db.query(
        'UPDATE project_categories SET project_id = $1 WHERE id = ANY($2::int[]) AND organization_id = $3',
        [projectId, projectCategoryIds, sessionUser.organizationId]
      );
    }

    if (expenseCategoryIds && expenseCategoryIds.length > 0) {
      await db.query(
        'UPDATE expense_category SET project_id = $1 WHERE id = ANY($2::int[]) AND organization_id = $3',
        [projectId, expenseCategoryIds, sessionUser.organizationId]
      );
    }

    return NextResponse.json({
      status: 'success',
      message: 'Categories claimed successfully',
    });
  } catch (error) {
    console.error('Error claiming categories:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to claim categories',
      },
      { status: 500 }
    );
  }
}
