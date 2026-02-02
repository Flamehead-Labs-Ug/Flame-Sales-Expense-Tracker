import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/database'
import { getApiOrSessionUser } from '@/lib/api-auth-keys'

export const dynamic = 'force-dynamic';

/**
 * @swagger
 * /api/projects:
 *   get:
 *     operationId: listProjects
 *     tags:
 *       - Projects
 *     summary: List projects
 *     description: List projects for the authenticated user's organization, optionally filtered by organization id.
 *     security:
 *       - stackSession: []
 *     parameters:
 *       - in: query
 *         name: org_id
 *         required: false
 *         schema:
 *           type: string
 *         description: Optional override of organization id (admin / internal use).
 *     responses:
 *       200:
 *         description: Projects fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 projects:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Project'
 *       401:
 *         description: API key required.
 *   post:
 *     operationId: createProject
 *     tags:
 *       - Projects
 *     summary: Create a new project
 *     security:
 *       - stackSession: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               project_name:
 *                 type: string
 *               project_category_id:
 *                 type: integer
 *               currency_code:
 *                 type: string
 *             required:
 *               - project_name
 *               - project_category_id
 *     responses:
 *       200:
 *         description: Project created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 project:
 *                   $ref: '#/components/schemas/Project'
 *       401:
 *         description: API key required.
 *   put:
 *     operationId: updateProject
 *     tags:
 *       - Projects
 *     summary: Update an existing project
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
 *               project_name:
 *                 type: string
 *               description:
 *                 type: string
 *                 nullable: true
 *               start_date:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *               end_date:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *               project_category_id:
 *                 type: integer
 *               expense_category_id:
 *                 type: integer
 *                 nullable: true
 *               currency_code:
 *                 type: string
 *                 nullable: true
 *             required:
 *               - id
 *               - project_name
 *               - project_category_id
 *     responses:
 *       200:
 *         description: Project updated successfully.
 *   delete:
 *     operationId: deleteProject
 *     tags:
 *       - Projects
 *     summary: Delete a project
 *     security:
 *       - stackSession: []
 *     parameters:
 *       - in: query
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the project to delete.
 *     responses:
 *       200:
 *         description: Project deleted successfully.
 *       401:
 *         description: API key required.
 */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const orgId = searchParams.get('org_id')
    const id = searchParams.get('id')
    
    const user = await getApiOrSessionUser(request);
    if (!user) {
      return NextResponse.json({ status: 'error', message: 'API key required' }, { status: 401 });
    }

    let organizationId: string | number | null = user.organizationId;

    if (orgId) {
      if (String(user.organizationId) === String(orgId)) {
        organizationId = orgId;
      } else {
        if (user.role !== 'admin') {
          return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 });
        }

        const orgCheck = await db.query(
          'SELECT id FROM organizations WHERE id = $1 AND created_by = $2',
          [orgId, user.id],
        );

        if (!orgCheck.rows.length) {
          return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 });
        }

        organizationId = orgId;
      }
    }

    if (!organizationId) {
      return NextResponse.json({ status: 'error', message: 'API key required' }, { status: 401 });
    }

    const organizationIdNum = typeof organizationId === 'string' ? parseInt(organizationId, 10) : organizationId;

    const result = user.role === 'admin'
      ? await db.query(
          `
          SELECT *
            FROM projects
           WHERE organization_id = $1
             AND ($2::int IS NULL OR id = $2::int)
           ORDER BY project_name
          `,
          [organizationIdNum, id ? parseInt(id, 10) : null],
        )
      : await db.query(
          `
          SELECT *
            FROM projects
           WHERE organization_id = $1
             AND ($3::int IS NULL OR id = $3::int)
             AND id IN (
               SELECT pa.project_id
                 FROM project_assignments pa
                WHERE pa.user_id = $2
               UNION
               SELECT pa.project_id
                 FROM project_assignments pa
                 JOIN team_members tm ON tm.team_id = pa.team_id
                WHERE tm.user_id = $2
             )
           ORDER BY project_name
          `,
          [organizationIdNum, user.id, id ? parseInt(id, 10) : null],
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
    const user = await getApiOrSessionUser(request);
    if (!user?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'API key required' }, { status: 401 });
    }

    if (user.role !== 'admin') {
      return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 });
    }
    const { organizationId: userOrgId, id: userId } = user;

    const body = await request.json();
    const { project_name, project_category_id, organization_id, currency_code } = body ?? {};

    let targetOrgId: number = Number(userOrgId);
    const requestedOrgId = organization_id != null ? Number(organization_id) : null;

    if (requestedOrgId && requestedOrgId !== Number(userOrgId)) {
      const orgCheck = await db.query(
        'SELECT id FROM organizations WHERE id = $1 AND created_by = $2',
        [requestedOrgId, user.id],
      );

      if (!orgCheck.rows.length) {
        return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 });
      }

      targetOrgId = requestedOrgId;
    }

    const result = await db.query(
      'INSERT INTO projects (project_name, project_category_id, organization_id, created_by, currency_code) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [project_name, project_category_id, targetOrgId, String(userId), currency_code || null],
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
    const user = await getApiOrSessionUser(request);
    if (!user?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'API key required' }, { status: 401 });
    }

    if (user.role !== 'admin') {
      return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 });
    }
    const { organizationId } = user;

    const { id, project_name, project_category_id, currency_code } = await request.json();
    
    const result = await db.query(
      'UPDATE projects SET project_name = $1, project_category_id = $2, currency_code = $3 WHERE id = $4 AND organization_id = $5 RETURNING *',
      [project_name, project_category_id, currency_code || null, id, organizationId]
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
    const user = await getApiOrSessionUser(request);
    if (!user?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'API key required' }, { status: 401 });
    }
    if (user.role !== 'admin') {
      return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 });
    }
    const { organizationId } = user;

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